// @ts-expect-error JavaScript runtime has no declaration file.
import { PRESETS } from '../runtime.mjs';
import { PACKAGE_NAME, SOURCE, VERSION } from './constants.js';
// The status object served at the status route, and the bookkeeping that keeps it current.
export function createStatusBoard({ ctx, resolved, degraded, agents, runningDetectors, interventions, effectiveSettings, mentorTable }) {
    const status = {
        identity: {
            name: PACKAGE_NAME,
            version: VERSION,
            description: 'SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.',
            source: SOURCE,
        },
        configuration: { ...resolved, threshold: PRESETS[resolved.preset] },
        lifecycle: { state: 'active', startedAt: Date.now(), liveAgents: 0, subscriptions: 4, degraded },
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
    // Called once per finished SOUP calculation, after status.detector.evaluations has been incremented.
    const noteEvaluation = (result) => {
        ratioTotal += result.kl_divergence / result.threshold;
        klTotal += result.kl_divergence;
        status.detector.averageKlDivergence = klTotal / status.detector.evaluations;
        updateDriftSummary();
    };
    return { status, abortIntervention, refreshOperationalState, recordError, noteEvaluation, mentorSnapshots, updateMentorStatus };
}
