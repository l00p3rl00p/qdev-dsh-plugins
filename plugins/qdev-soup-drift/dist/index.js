import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import s from '@deepseek-ai/schemastery';
import { z } from 'zod';
// The official SOUP worker and policy remain ordinary package files beside the compiled entry.
// @ts-expect-error JavaScript runtime has no declaration file.
import { createPluginRuntime, PRESETS } from '../runtime.mjs';
const PACKAGE_NAME = 'qdev-trajectory-drift-soup';
const VERSION = '0.5.3';
const SOURCE = 'https://github.com/l00p3rl00p/qdev-dsh-plugins/tree/main/plugins/qdev-soup-drift';
const STATUS_PATH = '/qdev-soup-drift/status';
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
    const mentorTable = mentorDomain.table('sessions');
    const initialMentorState = Object.fromEntries(mentorTable.entries());
    const resolved = {
        python: config.python ?? process.env.SOUP_PYTHON ?? 'python3',
        enabled: config.enabled.get() ?? true,
        detectorEnabled: config.detectorEnabled.get() ?? true,
        reanchoring: config.reanchoring.get() ?? true,
        preset: Math.max(0, Math.min(4, Math.trunc(config.preset.get() ?? 2))),
        baselineCount: Math.max(1, Math.min(100, Math.trunc(config.baselineCount.get() ?? 4))),
        windowCount: Math.max(1, Math.min(100, Math.trunc(config.windowCount.get() ?? 4))),
    };
    const agents = new Map();
    const seenSessions = new Set();
    const pendingMessages = new Map();
    const lifecycleAbort = new AbortController();
    const status = {
        identity: {
            name: PACKAGE_NAME,
            version: VERSION,
            description: 'SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.',
            source: SOURCE,
        },
        configuration: { ...resolved, threshold: PRESETS[resolved.preset] },
        lifecycle: { state: 'active', startedAt: Date.now(), liveAgents: 0, subscriptions: 3 },
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
    const recordError = (error, details = {}) => {
        const message = error instanceof Error ? error.message : String(error);
        status.errors.unshift({ at: Date.now(), message, ...details });
        status.errors.splice(8);
        if (status.detector.state !== 'disabled')
            status.detector.state = 'error';
        ctx.logger.error('SOUP drift error phase=%s session=%s: %s', details.phase ?? 'runtime', details.sessionId ?? '-', message);
    };
    let klTotal = 0;
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
    const runtime = createPluginRuntime({
        ...resolved,
        initialMentorState,
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
            void ctx.userQuestions.ask({
                agent,
                signal: lifecycleAbort.signal,
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
                if (lifecycleAbort.signal.aborted)
                    return;
                record.state = 'failed';
                record.error = error instanceof Error ? error.message : String(error);
                status.mentor.state = 'error';
                recordError(error, { phase: 'human-escalation', sessionId: id });
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
        onEvaluationStart: () => {
            status.detector.state = 'running';
            status.detector.lastStartedAt = Date.now();
        },
        onEvaluation: ({ sessionId, turn, singleTurn, result }) => {
            status.detector.state = 'idle';
            status.detector.evaluations += 1;
            klTotal += result.kl_divergence;
            status.detector.averageKlDivergence = klTotal / status.detector.evaluations;
            status.detector.averageThresholdRatio = result.threshold > 0
                ? status.detector.averageKlDivergence / result.threshold
                : undefined;
            const ratio = status.detector.averageThresholdRatio ?? 0;
            status.detector.humanSummary = ratio < 0.5
                ? 'Stable'
                : ratio < 1
                    ? 'Approaching threshold'
                    : ratio < 2
                        ? 'Drifting'
                        : 'Severe drift';
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
        onError: (error, details = {}) => recordError(error, details),
    });
    const attachAgent = (agent) => {
        const id = String(agent.id);
        if (agents.get(id) === agent)
            return;
        agents.set(id, agent);
        status.lifecycle.liveAgents = agents.size;
        const events = agent.session.snapshotEvents();
        status.trajectory.replayedEvents += events.length;
        runtime.replay(id, events);
        updateMentorStatus(runtime.mentorState(id), false);
    };
    for (const agent of ctx.agents.list())
        attachAgent(agent);
    ctx.on('agent/created', ({ agent }) => {
        attachAgent(agent);
        return undefined;
    });
    ctx.on('agent/disposed', ({ agent }) => {
        const id = String(agent.id);
        if (agents.get(id) === agent)
            agents.delete(id);
        status.lifecycle.liveAgents = agents.size;
    });
    ctx.on('session/event', (session, event) => {
        if (!resolved.enabled)
            return;
        const sessionId = String(session.id);
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
        runtime.observe(sessionId, event);
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
            if (request.method !== 'POST') {
                response.statusCode = 405;
                response.setHeader('allow', 'GET, POST');
                response.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }));
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
                const result = runtime.decideDriftReset(sessionId, reset);
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
        lifecycleAbort.abort();
        runtime.dispose();
        agents.clear();
        pendingMessages.clear();
        mentorSnapshots.clear();
        await mentorDomain.close();
    });
}
