// @ts-expect-error JavaScript runtime has no declaration file.
import { PRESETS } from '../runtime.mjs';
// @ts-expect-error JavaScript module has no declaration file.
import { GENTLE_MENTOR_MESSAGE } from '../reanchor.mjs';
import { VERSION } from './constants.js';
// The read model behind the Live & Mentor view of one chat.
export function createLiveView({ resolved, agents, live, initialLive, initialMentorState, runtimes, mentorSnapshots, interventions, mentorContexts, registerTable, effectiveSettings }) {
    const { sessionLive, liveTools, liveDecisions } = live;
    const sessionLiveView = (id, attached = agents.has(id)) => {
        const effective = effectiveSettings(id);
        const record = sessionLive.get(id);
        const storedMentor = initialMentorState[id] ?? {};
        const mentor = runtimes.get(id)?.mentorState(id) ?? mentorSnapshots.get(id) ?? {
            sessionId: id,
            turn: null,
            driftCount: Number.isInteger(storedMentor.carry) ? storedMentor.carry : 0,
            carry: Number.isInteger(storedMentor.carry) ? storedMentor.carry : 0,
            decisionPending: storedMentor.decisionPending === true,
            escalated: false,
        };
        const active = resolved.enabled && effective.enabled;
        const detectorActive = active && effective.detectorEnabled;
        const trajectoryState = !active ? 'disabled' : !attached ? 'detached' : record ? 'observing' : 'waiting';
        const detectorState = !detectorActive ? 'disabled' : !attached ? 'detached' : record?.pending
            ? 'running' : record?.lastError ? 'error' : 'idle';
        const mentorState = !active || !effective.reanchoring ? 'disabled'
            : record?.mentorActivity === 'error' ? 'error'
                : mentor.decisionPending || mentor.escalated || interventions.has(id) ? 'escalated'
                    : record?.mentorActivity ?? 'ready';
        return {
            sessionId: id,
            version: VERSION,
            tools: liveTools.get(id) ?? initialLive[id]?.tools ?? [],
            decisions: liveDecisions.get(id) ?? initialLive[id]?.decisions ?? [],
            attached,
            effective: {
                enabled: active,
                detectorEnabled: detectorActive,
                reanchoring: active && effective.reanchoring,
                threshold: PRESETS[effective.preset],
                baselineTarget: effective.baselineCount,
                windowTarget: effective.windowCount,
            },
            trajectory: {
                state: trajectoryState,
                sessionEvents: record?.sessionEvents ?? 0,
                assistantMessages: record?.assistantMessages ?? 0,
                baselineSize: record?.baselineSize ?? 0,
                windowSize: record?.windowSize ?? 0,
                ...(record?.lastEventAt === undefined ? {} : { lastEventAt: record.lastEventAt }),
                ...(record?.lastEventType === undefined ? {} : { lastEventType: record.lastEventType }),
            },
            detector: {
                state: detectorState,
                pending: record?.pending ?? false,
                evaluations: record?.evaluations ?? 0,
                drifts: record?.drifts ?? 0,
                history: record?.history ?? initialLive[id]?.history ?? [],
                markers: record?.markers ?? initialLive[id]?.markers ?? [],
                ...(record && record.evaluations > 0 ? { averageKlDivergence: record.klTotal / record.evaluations, averageThresholdRatio: record.klTotal / record.evaluations / PRESETS[effective.preset] } : {}),
                ...(record?.lastStartedAt === undefined ? {} : { lastStartedAt: record.lastStartedAt }),
                ...(record?.lastCompletedAt === undefined ? {} : { lastCompletedAt: record.lastCompletedAt }),
                ...(record?.lastResult === undefined ? {} : { lastResult: record.lastResult }),
                ...(record?.lastError === undefined ? {} : { lastError: record.lastError }),
            },
            mentor: {
                state: mentorState,
                turn: mentor.turn,
                driftCount: mentor.driftCount,
                carry: mentor.carry,
                decisionPending: mentor.decisionPending,
                escalated: mentor.escalated,
                // What Gentle Mentor did in this chat (counted from its intervention evidence; delivery is status.mentor.reminders).
                actions: record?.interventions ?? { total: 0, reminders: 0, escalations: 0, resets: 0, carries: 0 },
                originalPlan: runtimes.get(id)?.originalPlan(id) ?? null,
                // Effective Gentle Mentor prompt parts; "customized" says which fields a chat has overridden.
                context: {
                    message: mentorContexts.get(id)?.message ?? GENTLE_MENTOR_MESSAGE,
                    plan: mentorContexts.get(id)?.plan ?? runtimes.get(id)?.originalPlan(id) ?? null,
                    amendments: mentorContexts.get(id)?.amendments ?? [],
                    // Spec B4: the register for this chat, newest last, capped so the response stays small.
                    register: [...registerTable.entries()].map(([, entry]) => entry).filter((entry) => entry.id === id).sort((a, b) => a.at - b.at).slice(-50),
                    // Spec B1: the chat's own bypass switch, and whether the global switch allows it.
                    escalationBypass: mentorContexts.get(id)?.escalationBypass === true,
                    escalationBypassGlobal: resolved.escalationBypass === true,
                    customized: {
                        message: mentorContexts.get(id)?.message !== undefined,
                        plan: mentorContexts.get(id)?.plan !== undefined,
                        amendments: mentorContexts.get(id)?.amendments !== undefined,
                    },
                },
                ...(record?.mentorError === undefined ? {} : { lastError: record.mentorError }),
            },
        };
    };
    return sessionLiveView;
}
