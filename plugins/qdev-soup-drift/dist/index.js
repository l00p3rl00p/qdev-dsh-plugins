import s from '@deepseek-ai/schemastery';
// The official SOUP worker (soup_worker.py) is the only thing that measures drift. This host feeds it through the
// monitor and wires every other responsibility (mentor, status, live view, settings, routes) beside it.
// @ts-expect-error JavaScript runtime has no declaration file.
import { createPluginRuntime, PRESETS } from '../runtime.mjs';
// @ts-expect-error JavaScript settings module has no declaration file.
import { createSessionSettings } from '../session-settings.mjs';
import { PACKAGE_NAME } from './constants.js';
import { openTables } from './storage.js';
import { createLive } from './live.js';
import { createStatusBoard } from './status-board.js';
import { createLiveView } from './live-view.js';
import { createRuntimeFactory } from './mentor-host.js';
import { registerRoutes } from './routes.js';
export const name = PACKAGE_NAME;
// Only the monitoring core's service is required. Storage, web server and user questions serve the
// consumers (mentor, register, settings, status routes); when one is absent the monitor still runs.
export const inject = ['agents'];
export const Config = s.object({
    python: s.string().default('python3')
        .description('Python interpreter containing the official soup-cli package.'),
    enabled: s.boolean().default(true).volatile().description('Master switch for trajectory observation and intervention.'),
    detectorEnabled: s.boolean().default(true).volatile().description('Run the official SOUP drift detector for observed assistant messages.'),
    reanchoring: s.boolean().default(true).volatile().description('Deliver two Gentle Mentor reminders, then ask the human for clarification.'),
    escalationBypass: s.boolean().default(false).description('Global escalation bypass (spec B1). When on, a chat may use its own bypass switch: it never escalates, and every 10th drift sends the full message.'),
    preset: s.number().min(0).max(4).step(1).default(2).volatile()
        .description('Five-position SOUP sensitivity selector; position 2 is threshold 0.2.'),
    baselineCount: s.number().min(1).max(100).step(1).default(4).volatile()
        .description('Assistant messages used to establish the fixed reference distribution.'),
    windowCount: s.number().min(1).max(100).step(1).default(4).volatile()
        .description('Assistant messages compared in each live SOUP window.'),
});
export async function apply(ctx, config = {}) {
    // Consumer services are optional. A missing one is recorded in status.lifecycle.degraded and its
    // consumer falls back to volatile (in-memory) state; the SOUP monitor itself never depends on them.
    const degraded = [];
    const noteMissing = (service) => { if (!degraded.includes(service))
        degraded.push(service); };
    const { mentorTable, registerTable, liveTable, contextTable, settingsTable, initialMentorState, initialLive, mentorContexts } = await openTables(ctx, noteMissing);
    const readConfiguration = () => ({
        // The configured interpreter is authoritative; python3 is the portable default.
        python: config.python ?? 'python3',
        // Global escalation bypass (spec B1): a plain, persisted setting, read as a value rather than volatile.
        escalationBypass: config.escalationBypass === true,
        enabled: config.enabled.get() ?? true,
        detectorEnabled: config.detectorEnabled.get() ?? true,
        reanchoring: config.reanchoring.get() ?? true,
        preset: Math.max(0, Math.min(4, Math.trunc(config.preset.get() ?? 2))),
        baselineCount: Math.max(1, Math.min(100, Math.trunc(config.baselineCount.get() ?? 4))),
        windowCount: Math.max(1, Math.min(100, Math.trunc(config.windowCount.get() ?? 4))),
    });
    const resolved = readConfiguration();
    const agents = new Map();
    const seenSessions = new Set();
    const pendingMessages = new Map();
    const runtimes = new Map();
    const runningDetectors = new Set();
    const interventions = new Map();
    let applySessionSettings = () => { };
    const sessionSettings = createSessionSettings({
        table: settingsTable,
        getGlobal: () => resolved,
        onCommitted: (id) => {
            if (board.status.lifecycle.state === 'active')
                applySessionSettings(id);
        },
    });
    const effectiveSettings = (id) => sessionSettings.read(id).effective;
    // Consumers, each in its own module: per-chat records, the status board, the Live & Mentor read model,
    // and the Gentle Mentor runtime factory.
    const board = createStatusBoard({ ctx, resolved, degraded, agents, runningDetectors, interventions, effectiveSettings, mentorTable });
    const { status, abortIntervention, refreshOperationalState, updateMentorStatus, mentorSnapshots } = board;
    const live = createLive({ initialLive, liveTable, recordError: board.recordError });
    const { sessionLive, ensureSessionLive, persistLive, observeTool, observeDecision } = live;
    const sessionLiveView = createLiveView({ resolved, agents, live, initialLive, initialMentorState, runtimes, mentorSnapshots, interventions, mentorContexts, registerTable, effectiveSettings });
    const getRuntime = createRuntimeFactory({ ctx, resolved, agents, runtimes, pendingMessages, interventions, runningDetectors, effectiveSettings, initialMentorState, mentorContexts, registerTable, live, board, noteMissing });
    const replayAgent = (agent, beforeSeq) => {
        const id = String(agent.id);
        if (!effectiveSettings(id).enabled)
            return;
        const snapshot = agent.session.snapshotEvents();
        const events = beforeSeq === undefined ? snapshot : snapshot.filter((event) => Number(event.seq) < beforeSeq);
        status.trajectory.replayedEvents += events.length;
        const runtime = getRuntime(id);
        runtime.replay(id, events);
        updateMentorStatus(runtime.mentorState(id), false);
    };
    const attachAgent = (agent) => {
        const id = String(agent.id);
        if (agents.get(id) === agent)
            return;
        agents.set(id, agent);
        status.lifecycle.liveAgents = agents.size;
        // Fresh Host startup stays inert: only an already-activated runtime is resumed here.
        // A retained/pre-existing agent is replayed lazily when its next session event arrives.
        if (runtimes.has(id))
            applySessionSettings(id);
    };
    const activateSession = (id, event) => {
        const existing = runtimes.get(id);
        if (existing)
            return existing;
        const agent = agents.get(id) ?? ctx.agents.get(id);
        if (!agent)
            return undefined;
        attachAgent(agent);
        replayAgent(agent, Number(event.seq));
        return runtimes.get(id);
    };
    applySessionSettings = (id) => {
        const next = effectiveSettings(id);
        const agent = agents.get(id);
        const existing = runtimes.get(id);
        // A retained runtime stays suspended while its receiving agent is absent. Global
        // or chat edits may update its configuration, but only reattachment can enable
        // and replay it, which prevents a closed chat from missing history on resume.
        const operational = agent ? next : { ...next, enabled: false };
        const reset = existing ? existing.configure(operational) : Boolean(agent && next.enabled);
        if (reset) {
            runningDetectors.delete(id);
            const live = sessionLive.get(id);
            if (live) {
                live.baselineSize = 0;
                live.windowSize = 0;
                live.pending = false;
                delete live.lastError;
            }
            if (status.trajectory.lastSessionId === id) {
                status.trajectory.baselineSize = 0;
                status.trajectory.windowSize = 0;
            }
        }
        if (!next.enabled || !next.reanchoring)
            abortIntervention(id);
        if (reset && next.enabled && agent)
            replayAgent(agent);
        refreshOperationalState();
    };
    // Global defaults update inherited fields only; every chat keeps its own detector
    // generation and Mentor instance. The global master is applied before any replay.
    ctx.on('loader/volatile-update', () => {
        Object.assign(resolved, readConfiguration());
        status.configuration = { ...resolved, threshold: PRESETS[resolved.preset] };
        status.trajectory.baselineTarget = resolved.baselineCount;
        status.trajectory.windowTarget = resolved.windowCount;
        for (const id of runtimes.keys())
            applySessionSettings(id);
        refreshOperationalState();
    });
    ctx.on('agent/created', ({ agent }) => {
        attachAgent(agent);
        return undefined;
    });
    ctx.on('agent/disposed', ({ agent }) => {
        const id = String(agent.id);
        if (agents.get(id) === agent) {
            agents.delete(id);
            abortIntervention(id);
            const runtime = runtimes.get(id);
            if (runtime)
                runtime.configure({ ...effectiveSettings(id), enabled: false });
            const live = sessionLive.get(id);
            if (live)
                live.pending = false;
            runningDetectors.delete(id);
            refreshOperationalState();
        }
        status.lifecycle.liveAgents = agents.size;
    });
    ctx.on('session/event', (session, event) => {
        if (!resolved.enabled)
            return;
        const sessionId = String(session.id);
        if (!effectiveSettings(sessionId).enabled)
            return;
        const live = ensureSessionLive(sessionId);
        live.sessionEvents += 1;
        live.lastEventAt = event.time;
        live.lastEventType = event.type;
        if (event.type === 'assistant/message')
            live.assistantMessages += 1;
        seenSessions.add(sessionId);
        status.trajectory.sessionEvents += 1;
        status.trajectory.sessionsObserved = seenSessions.size;
        status.trajectory.lastEventAt = event.time;
        status.trajectory.lastEventType = event.type;
        status.trajectory.lastSessionId = sessionId;
        if (event.type === 'assistant/message')
            status.trajectory.assistantMessages += 1;
        if (event.type === 'agent/inbox/spliced') {
            for (const inserted of event.data.inserted) {
                const record = pendingMessages.get(String(inserted.id));
                if (!record || inserted.source.kind !== 'qdev-trajectory-drift-soup')
                    continue;
                record.state = 'delivered';
                record.deliveredAt = event.time;
                record.eventSeq = Number(event.seq);
                pendingMessages.delete(String(inserted.id));
                const deliveredLive = sessionLive.get(record.sessionId);
                if (deliveredLive) {
                    deliveredLive.mentorActivity = 'ready';
                    // Delivered reminders, escalations and clarifications appear as markers on the chart.
                    deliveredLive.markers.push({ at: Date.now(), kind: record.kind });
                    if (deliveredLive.markers.length > 50)
                        deliveredLive.markers.splice(0, deliveredLive.markers.length - 50);
                    persistLive(record.sessionId, deliveredLive);
                }
                status.mentor.lastOutcome = `${record.kind} delivered in native agent inbox event ${String(event.seq)}.`;
            }
        }
        if (event.type === 'tool/call' || event.type === 'tool/result')
            observeTool(sessionId, event);
        const type = event.type;
        if (type === 'plan/mode' || type === 'hook/result')
            observeDecision(sessionId, event);
        const runtime = runtimes.get(sessionId) ?? activateSession(sessionId, event);
        runtime?.observe(sessionId, event);
    });
    registerRoutes({ ctx, status, resolved, agents, runtimes, interventions, sessionSettings, sessionLiveView, mentorContexts, contextTable, noteMissing });
    ctx.effect(() => async () => {
        status.lifecycle.state = 'disposing';
        for (const id of interventions.keys())
            abortIntervention(id);
        for (const runtime of runtimes.values())
            runtime.dispose();
        runtimes.clear();
        sessionLive.clear();
        runningDetectors.clear();
        agents.clear();
        pendingMessages.clear();
        mentorSnapshots.clear();
    });
}
