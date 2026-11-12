import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import s from '@deepseek-ai/schemastery';
import { z } from 'zod';
// The official SOUP worker and policy remain ordinary package files beside the compiled entry.
// @ts-expect-error JavaScript runtime has no declaration file.
import { createPluginRuntime, PRESETS } from '../runtime.mjs';
// @ts-expect-error JavaScript settings module has no declaration file.
import { createSessionSettings, SessionSettingsRecord, SessionSettingsError } from '../session-settings.mjs';
const PACKAGE_NAME = 'qdev-trajectory-drift-soup';
const VERSION = '0.6.3';
const SOURCE = 'https://github.com/l00p3rl00p/qdev-dsh-plugins/tree/main/plugins/qdev-soup-drift';
const STATUS_PATH = '/qdev-soup-drift/status';
const SESSION_SETTINGS_PATH = '/api/qdev-soup/session-settings';
const SESSION_SETTINGS_DOMAIN = defineDomain({
    name: 'qdev_soup_session_settings',
    version: 1,
    layout: 'per-record',
    tables: { sessions: domainTable(SessionSettingsRecord) },
});
const MENTOR_STATE_DOMAIN = defineDomain({
    name: 'qdev_soup_drift_state',
    version: 1,
    layout: 'per-record',
    tables: {
        sessions: domainTable(z.object({
            carry: z.number().int().nonnegative(),
            decisionPending: z.boolean(),
        })),
    },
});
export const name = PACKAGE_NAME;
export const inject = ['agents', 'storageDomain', 'webServer', 'userQuestions'];
export const Config = s.object({
    python: s.string().default('python3')
        .description('Python interpreter containing the official soup-cli package.'),
    enabled: s.boolean().default(true).volatile().description('Master switch for trajectory observation and intervention.'),
    detectorEnabled: s.boolean().default(true).volatile().description('Run the official SOUP drift detector for observed assistant messages.'),
    reanchoring: s.boolean().default(true).volatile().description('Deliver two Gentle Mentor reminders, then ask the human for clarification.'),
    preset: s.number().min(0).max(4).step(1).default(2).volatile()
        .description('Five-position SOUP sensitivity selector; position 2 is threshold 0.2.'),
    baselineCount: s.number().min(1).max(100).step(1).default(4).volatile()
        .description('Assistant messages used to establish the fixed reference distribution.'),
    windowCount: s.number().min(1).max(100).step(1).default(4).volatile()
        .description('Assistant messages compared in each live SOUP window.'),
});
const messageText = (answer) => {
    const item = answer.answers[0];
    return item?.custom?.trim() || item?.selected?.join(', ') || 'Continue with the original plan.';
};
const readJsonBody = async (request) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
        size += bytes.byteLength;
        if (size > 4096)
            throw new Error('Request body exceeds 4096 bytes');
        chunks.push(bytes);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
};
export async function apply(ctx, config = {}) {
    const mentorDomain = await ctx.storageDomain.open(MENTOR_STATE_DOMAIN);
    ctx.effect(() => () => mentorDomain.close());
    const mentorTable = mentorDomain.table('sessions');
    const initialMentorState = Object.fromEntries(mentorTable.entries());
    const settingsDomain = await ctx.storageDomain.open(SESSION_SETTINGS_DOMAIN);
    ctx.effect(() => () => settingsDomain.close());
    const readConfiguration = () => ({
        python: config.python ?? process.env.SOUP_PYTHON ?? 'python3',
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
    const status = {
        identity: {
            name: PACKAGE_NAME,
            version: VERSION,
            description: 'SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.',
            source: SOURCE,
        },
        configuration: { ...resolved, threshold: PRESETS[resolved.preset] },
        lifecycle: { state: 'active', startedAt: Date.now(), liveAgents: 0, subscriptions: 4 },
        trajectory: {
            state: resolved.enabled ? 'waiting' : 'disabled',
            sessionEvents: 0,
            assistantMessages: 0,
            replayedEvents: 0,
            sessionsObserved: 0,
            baselineSize: 0,
            baselineTarget: resolved.baselineCount,
            windowSize: 0,
            windowTarget: resolved.windowCount,
        },
        detector: {
            state: !resolved.enabled || !resolved.detectorEnabled ? 'disabled' : 'idle',
            evaluations: 0,
            drifts: 0,
            humanSummary: 'Waiting for measurements',
        },
        mentor: {
            state: !resolved.enabled || !resolved.reanchoring ? 'disabled' : 'ready',
            reminders: [],
            driftCount: 0,
            carriedDrifts: 0,
        },
        errors: [],
    };
    const sessionSettings = createSessionSettings({
        table: settingsDomain.table('sessions'),
        getGlobal: () => resolved,
        onCommitted: (id) => {
            if (status.lifecycle.state === 'active')
                applySessionSettings(id);
        },
    });
    const effectiveSettings = (id) => sessionSettings.read(id).effective;
    const abortIntervention = (id) => {
        const pending = interventions.get(id);
        if (!pending)
            return;
        pending.controller.abort();
        pending.record.state = 'failed';
        pending.record.error = 'Cancelled by SOUP settings or session disposal';
        interventions.delete(id);
    };
    const refreshOperationalState = () => {
        const configurations = [...agents.keys()].map(effectiveSettings);
        const observing = resolved.enabled && (!configurations.length || configurations.some((value) => value.enabled));
        const detecting = observing && (configurations.length ? configurations.some((value) => value.enabled && value.detectorEnabled) : resolved.detectorEnabled);
        const mentoring = observing && (configurations.length ? configurations.some((value) => value.enabled && value.reanchoring) : resolved.reanchoring);
        if (!observing)
            status.trajectory.state = 'disabled';
        else if (status.trajectory.state === 'disabled')
            status.trajectory.state = 'waiting';
        status.detector.state = !detecting ? 'disabled' : runningDetectors.size ? 'running' : 'idle';
        status.mentor.state = !mentoring ? 'disabled' : status.mentor.resetDecision?.required ? 'escalated' : 'ready';
    };
    const recordError = (error, details = {}) => {
        const message = error instanceof Error ? error.message : String(error);
        status.errors.unshift({ at: Date.now(), message, ...details });
        status.errors.splice(8);
        if (status.detector.state !== 'disabled')
            status.detector.state = 'error';
        ctx.logger.error('SOUP drift error phase=%s session=%s: %s', details.phase ?? 'runtime', details.sessionId ?? '-', message);
    };
    let klTotal = 0;
    let ratioTotal = 0;
    const updateDriftSummary = () => {
        // Different chats may have different thresholds; average each recorded sample's ratio.
        const ratio = status.detector.evaluations ? ratioTotal / status.detector.evaluations : undefined;
        status.detector.averageThresholdRatio = ratio;
        status.detector.humanSummary = ratio === undefined
            ? 'Waiting for measurements'
            : ratio < 0.5 ? 'Stable' : ratio < 1 ? 'Approaching threshold' : ratio < 2 ? 'Drifting' : 'Severe drift';
    };
    const mentorSnapshots = new Map();
    const updateMentorStatus = (snapshot, persist = true) => {
        mentorSnapshots.set(snapshot.sessionId, snapshot);
        status.mentor.driftCount = snapshot.driftCount;
        status.mentor.carriedDrifts = snapshot.carry;
        const pending = [...mentorSnapshots.values()].find((item) => item.decisionPending);
        if (pending) {
            status.mentor.resetDecision = { required: true, sessionId: pending.sessionId, turn: pending.turn };
        }
        else {
            delete status.mentor.resetDecision;
            if (status.mentor.state === 'escalated')
                status.mentor.state = 'ready';
        }
        if (persist) {
            void mentorTable.put(snapshot.sessionId, {
                carry: snapshot.carry,
                decisionPending: snapshot.decisionPending,
            }).catch((error) => recordError(error, { phase: 'mentor-state-persist', sessionId: snapshot.sessionId }));
        }
    };
    const deliver = (agent, record, text, form, report) => {
        const effective = effectiveSettings(String(agent.id));
        if (!effective.enabled || !effective.reanchoring) {
            record.state = 'failed';
            record.error = 'Intervention disabled for this chat';
            return;
        }
        const message = createUserMessage({
            content: [{ type: 'text', text }],
            source: {
                kind: 'qdev-trajectory-drift-soup',
                form,
                ...(record.attempt === undefined ? {} : { attempt: record.attempt }),
                ...(typeof report?.kl_divergence === 'number' ? { kl: report.kl_divergence } : {}),
                ...(typeof report?.threshold === 'number' ? { threshold: report.threshold } : {}),
            },
        });
        record.messageId = String(message.id);
        pendingMessages.set(record.messageId, record);
        agent.inject(message);
    };
    const getRuntime = (id) => {
        const existing = runtimes.get(id);
        if (existing)
            return existing;
        const runtime = createPluginRuntime({
            ...effectiveSettings(id),
            initialMentorState: { [id]: initialMentorState[id] },
            onMentorStateChange: updateMentorStatus,
            inject: ({ id, turn, attempt, reminder, report }) => {
                const record = { kind: 'reminder', attempt, sessionId: id, turn, requestedAt: Date.now(), state: 'pending' };
                status.mentor.reminders.push(record);
                status.mentor.reminders.splice(0, Math.max(0, status.mentor.reminders.length - 6));
                status.mentor.state = 'reminding';
                const agent = agents.get(id);
                if (!agent) {
                    record.state = 'failed';
                    record.error = 'No live receiving agent';
                    status.mentor.state = 'error';
                    ctx.logger.warn('SOUP reminder could not be injected: no agent session=%s', id);
                    return;
                }
                deliver(agent, record, reminder, 'reminder', report);
            },
            escalate: ({ id, turn, question, report }) => {
                // Never replace a live controller without aborting it: a late answer from an
                // older question must not reset the current guard or inject clarification.
                abortIntervention(id);
                const record = { kind: 'escalation', sessionId: id, turn, requestedAt: Date.now(), state: 'pending' };
                status.mentor.escalation = record;
                status.mentor.state = 'escalated';
                const agent = agents.get(id);
                if (!agent) {
                    record.state = 'failed';
                    record.error = 'No live receiving agent';
                    status.mentor.state = 'error';
                    return;
                }
                deliver(agent, record, `SOUP measured repeated trajectory drift and paused automatic reanchoring. ${question}`, 'escalation', report);
                const controller = new AbortController();
                interventions.set(id, { controller, record });
                const signal = controller.signal;
                void ctx.userQuestions.ask({
                    agent,
                    signal,
                    questions: [{
                            id: 'trajectory-clarification',
                            header: 'Trajectory drift',
                            question,
                            detail: `SOUP detected a third qualifying drift window (KL ${report.kl_divergence.toFixed(4)}, threshold ${report.threshold}). Your response will be delivered to the agent.`,
                        }, {
                            id: 'reset-drift-count',
                            header: 'Drift accountability',
                            question: 'Reset the accumulated qualifying-drift count?',
                            detail: 'Reset starts the reminder policy from zero. Keep carries the three strikes forward, so the next qualifying drift escalates immediately.',
                            options: [
                                { label: 'Yes — reset to 0', description: 'Give the corrected trajectory a fresh two-reminder allowance.' },
                                { label: 'No — carry 3 forward', description: 'Keep accountability across turns; the next qualifying drift escalates.' },
                            ],
                        }],
                }).then((answer) => {
                    const effective = effectiveSettings(id);
                    if (signal.aborted || !effective.enabled || !effective.reanchoring)
                        return;
                    record.state = 'answered';
                    const resetAnswer = answer.answers.find((item) => item.id === 'reset-drift-count');
                    if (resetAnswer)
                        runtime.decideDriftReset(id, resetAnswer.selected.includes('Yes — reset to 0'));
                    const clarification = { kind: 'clarification', sessionId: id, turn, requestedAt: Date.now(), state: 'pending' };
                    deliver(agent, clarification, `Human clarification after SOUP escalation:\n\n${messageText(answer)}`, 'clarification');
                    status.mentor.lastOutcome = resetAnswer?.selected.includes('Yes — reset to 0')
                        ? 'Human clarification delivered; drift count reset to 0.'
                        : 'Human clarification delivered; three qualifying drifts carried forward.';
                }).catch((error) => {
                    if (signal.aborted)
                        return;
                    record.state = 'failed';
                    record.error = error instanceof Error ? error.message : String(error);
                    status.mentor.state = 'error';
                    recordError(error, { phase: 'human-escalation', sessionId: id });
                }).finally(() => {
                    if (interventions.get(id)?.controller === controller)
                        interventions.delete(id);
                });
            },
            notify: ({ sessionId, turn, singleTurn, result }) => {
                status.detector.drifts += 1;
                ctx.logger.warn('SOUP DRIFT session=%s turn=%s KL=%s threshold=%s singleTurn=%s', sessionId, turn ?? '-', result.kl_divergence, result.threshold, singleTurn);
            },
            reportMissing: ({ id }) => {
                status.mentor.lastOutcome = 'Original intent unavailable; reminder suppressed.';
                ctx.logger.warn('SOUP original intent unavailable session=%s', id);
            },
            reportStale: ({ id, turn, reportTurn }) => {
                status.mentor.lastOutcome = 'Stale cross-turn drift result suppressed.';
                ctx.logger.info('SOUP stale drift suppressed session=%s currentTurn=%s reportTurn=%s', id, turn, reportTurn ?? '-');
            },
            onObservation: ({ sessionId, baselineSize, baselineTarget, windowSize, windowTarget }) => {
                status.trajectory.state = 'observing';
                status.trajectory.lastSessionId = sessionId;
                status.trajectory.baselineSize = baselineSize;
                status.trajectory.baselineTarget = baselineTarget;
                status.trajectory.windowSize = windowSize;
                status.trajectory.windowTarget = windowTarget;
            },
            onEvaluationStart: ({ sessionId }) => {
                runningDetectors.add(sessionId);
                status.detector.state = 'running';
                status.detector.lastStartedAt = Date.now();
            },
            onEvaluation: ({ sessionId, turn, singleTurn, result }) => {
                runningDetectors.delete(sessionId);
                status.detector.state = runningDetectors.size ? 'running' : 'idle';
                status.detector.evaluations += 1;
                ratioTotal += result.kl_divergence / result.threshold;
                klTotal += result.kl_divergence;
                status.detector.averageKlDivergence = klTotal / status.detector.evaluations;
                updateDriftSummary();
                status.detector.lastCompletedAt = Date.now();
                status.detector.lastResult = {
                    sessionId,
                    turn,
                    singleTurn,
                    klDivergence: result.kl_divergence,
                    threshold: result.threshold,
                    driftDetected: result.drift_detected,
                };
            },
            onError: (error, details = {}) => {
                if (details.sessionId)
                    runningDetectors.delete(details.sessionId);
                recordError(error, details);
            },
        });
        runtimes.set(id, runtime);
        return runtime;
    };
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
        const agent = agents.get(id) ?? ctx.agents.list().find((item) => String(item.id) === id);
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
                status.mentor.lastOutcome = `${record.kind} delivered in native agent inbox event ${String(event.seq)}.`;
            }
        }
        const runtime = runtimes.get(sessionId) ?? activateSession(sessionId, event);
        runtime?.observe(sessionId, event);
    });
    // Native Connection owns authentication, trust and owner-only admission for this
    // exact Fetch route. Optional UI services must never gate the monitoring core.
    ctx.inject(['connection', 'sessionPersistence'], (uiCtx) => {
        const reply = (data, code = 200) => Response.json(data, {
            status: code, headers: { 'cache-control': 'no-store' },
        });
        const view = (id) => ({ ...sessionSettings.read(id), writable: resolved.enabled });
        const exists = async (id) => agents.has(id)
            || ctx.agents.list().some((agent) => String(agent.id) === id)
            || Boolean(await uiCtx.sessionPersistence.stat(id));
        uiCtx.connection.fetch.register({
            path: SESSION_SETTINGS_PATH,
            methods: ['GET', 'POST'],
            requestBody: 'buffered',
            async fetch(request) {
                if (status.lifecycle.state !== 'active')
                    return reply({ ok: false, error: 'plugin-disposed' }, 503);
                try {
                    if (request.method === 'GET') {
                        const ids = new URL(request.url).searchParams.getAll('sessionId');
                        if (ids.length !== 1)
                            return reply({ ok: false, error: 'invalid-settings', message: 'One session identifier is required' }, 400);
                        const settings = view(ids[0]);
                        if (!await exists(ids[0]))
                            return reply({ ok: false, error: 'session-not-found' }, 404);
                        return reply({ ok: true, settings });
                    }
                    if (request.headers.get('x-qdev-soup-action') !== 'session-settings') {
                        return reply({ ok: false, error: 'action-header-required' }, 403);
                    }
                    if (!request.headers.get('content-type')?.startsWith('application/json')) {
                        return reply({ ok: false, error: 'json-required' }, 415);
                    }
                    if (!resolved.enabled)
                        return reply({ ok: false, error: 'soup-disabled', message: 'Enable the global SOUP master before editing chat settings' }, 409);
                    const text = await request.text();
                    if (Buffer.byteLength(text) > 16_384)
                        return reply({ ok: false, error: 'request-too-large' }, 413);
                    let body;
                    try {
                        body = JSON.parse(text);
                    }
                    catch {
                        return reply({ ok: false, error: 'invalid-settings', message: 'Invalid JSON' }, 400);
                    }
                    if (!body || typeof body !== 'object' || Array.isArray(body))
                        return reply({ ok: false, error: 'invalid-settings' }, 400);
                    const { sessionId, ...command } = body;
                    if (typeof sessionId !== 'string')
                        return reply({ ok: false, error: 'invalid-settings' }, 400);
                    view(sessionId);
                    if (!await exists(sessionId))
                        return reply({ ok: false, error: 'session-not-found' }, 404);
                    if (!resolved.enabled)
                        return reply({ ok: false, error: 'soup-disabled' }, 409);
                    const settings = await sessionSettings.mutate(sessionId, command);
                    return reply({ ok: true, settings: { ...settings, writable: resolved.enabled } });
                }
                catch (error) {
                    if (error instanceof SessionSettingsError) {
                        const failure = error;
                        return reply({
                            ok: false, error: failure.code, message: failure.message,
                            ...(failure.settings ? { settings: { ...failure.settings, writable: resolved.enabled } } : {}),
                        }, failure.code === 'revision-conflict' ? 409 : failure.code === 'storage-failed' ? 503 : 400);
                    }
                    return reply({ ok: false, error: 'settings-unavailable', message: 'Unable to read or apply chat settings' }, 500);
                }
            },
        });
    });
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: STATUS_PATH,
        handler: async (request, response) => {
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.setHeader('cache-control', 'no-store');
            if (request.method === 'GET') {
                response.statusCode = 200;
                response.end(JSON.stringify(status));
                return;
            }
            if (request.method === 'POST' && !resolved.enabled) {
                response.statusCode = 409;
                response.end(JSON.stringify({ ok: false, error: 'soup-disabled' }));
                return;
            }
            if (request.method !== 'POST') {
                response.statusCode = 405;
                response.setHeader('allow', 'GET, POST');
                response.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }));
                return;
            }
            const rejection = ctx.get('connection')?.requestRejection(request);
            if (rejection !== undefined) {
                response.statusCode = rejection;
                response.end(JSON.stringify({ ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden' }));
                return;
            }
            if (request.headers['x-qdev-soup-action'] !== 'reset-drift-count') {
                response.statusCode = 403;
                response.end(JSON.stringify({ ok: false, error: 'action-header-required' }));
                return;
            }
            try {
                const body = await readJsonBody(request);
                if (!body || typeof body !== 'object' || Array.isArray(body))
                    throw new Error('Expected a JSON object');
                const action = Reflect.get(body, 'action');
                const reset = Reflect.get(body, 'reset');
                const requestedSession = Reflect.get(body, 'sessionId');
                if (action !== 'reset-drift-count' || typeof reset !== 'boolean')
                    throw new Error('Invalid reset action');
                const sessionId = typeof requestedSession === 'string' && requestedSession
                    ? requestedSession
                    : status.mentor.resetDecision?.sessionId;
                if (!sessionId)
                    throw new Error('No session is awaiting a reset decision');
                const result = runtimes.get(sessionId)?.decideDriftReset(sessionId, reset) ?? { accepted: false, reason: 'no-live-runtime' };
                if (result.accepted) {
                    const pending = interventions.get(sessionId);
                    if (pending) {
                        pending.controller.abort();
                        pending.record.state = 'answered';
                        delete pending.record.error;
                        interventions.delete(sessionId);
                    }
                }
                response.statusCode = result.accepted ? 200 : 409;
                response.end(JSON.stringify({ ok: result.accepted, result }));
            }
            catch (error) {
                response.statusCode = 400;
                response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
            }
        },
    }));
    ctx.effect(() => async () => {
        status.lifecycle.state = 'disposing';
        for (const id of interventions.keys())
            abortIntervention(id);
        for (const runtime of runtimes.values())
            runtime.dispose();
        runtimes.clear();
        runningDetectors.clear();
        agents.clear();
        pendingMessages.clear();
        mentorSnapshots.clear();
    });
}
