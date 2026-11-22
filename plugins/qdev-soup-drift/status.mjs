// Host-independent status decisions (P2). No DSH, cordis or zod imports: src/*.ts only wires
// these into the Harness, so the rules below can be tested without a running host.
import { validateInterventionEvidence } from './soup-core.mjs'

const MAX_ERRORS = 8

/** Initial status object (same shape the host has always served at the status route). */
export function createStatus({ identity, resolved, threshold, degraded = [], now = Date.now }) {
  return {
    identity,
    configuration: { ...resolved, threshold },
    lifecycle: { state: 'active', startedAt: now(), liveAgents: 0, subscriptions: 4, degraded },
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
      droppedEvents: 0,
      humanSummary: 'Waiting for measurements',
    },
    mentor: {
      state: !resolved.enabled || !resolved.reanchoring ? 'disabled' : 'ready',
      reminders: [],
      driftCount: 0,
      carriedDrifts: 0,
    },
    // Counted by a PEER consumer from Mentor's intervention evidence (createInterventionStatusHandler).
    interventions: { total: 0, reminders: 0, escalations: 0, resets: 0, carries: 0 },
    errors: [],
  }
}

/**
 * Status as a consumer of DERIVED evidence: counts what Gentle Mentor did, reading only the
 * intervention evidence contract. Throws on a malformed object (the seam isolates and reports it).
 */
export function createInterventionStatusHandler({ status, now = Date.now }) {
  return (evidence) => {
    const check = validateInterventionEvidence(evidence)
    if (!check.ok) throw new TypeError(`Invalid intervention evidence: ${check.errors.join('; ')}`)
    const counters = { reminder: 'reminders', escalation: 'escalations', reset: 'resets', carry: 'carries' }
    status.interventions[counters[evidence.action]] += 1
    status.interventions.total += 1
    status.interventions.lastAt = now()
    status.interventions.last = { sessionId: evidence.sessionId, turn: evidence.turn, action: evidence.action, attempt: evidence.attempt, strikes: evidence.strikes }
  }
}

// Phases that are diagnostics about something other than the measurement itself: they must
// be recorded but must not flip the detector to 'error'.
const NON_MEASUREMENT_PHASES = new Set(['consumer', 'drop', 'evidence'])
// 'consumer' and the runtime's own 'consumer:<name>:<topic>' spelling are both consumer diagnostics.
const isMeasurementPhase = (phase) => !NON_MEASUREMENT_PHASES.has(phase) && !String(phase ?? '').startsWith('consumer:')

/** Record an error (newest first, newest MAX_ERRORS kept). Returns the message for logging. */
export function recordError(status, error, details = {}, now = Date.now) {
  const message = error instanceof Error ? error.message : String(error)
  status.errors.unshift({ at: now(), message, ...details })
  status.errors.splice(MAX_ERRORS)
  // A downstream consumer failure (notify/Mentor/observers) is not a measurement failure: keep detector state.
  if (isMeasurementPhase(details.phase) && status.detector.state !== 'disabled') status.detector.state = 'error'
  return message
}

/**
 * Aggregate trajectory/detector/mentor state from the global master, per-chat effective
 * settings and the running-detector count. Pure: returns the three states, mutates nothing.
 */
export function deriveOperationalState({ resolved, configurations, runningCount, trajectoryState, resetRequired }) {
  const observing = resolved.enabled && (!configurations.length || configurations.some((value) => value.enabled))
  const detecting = observing && (configurations.length ? configurations.some((value) => value.enabled && value.detectorEnabled) : resolved.detectorEnabled)
  const mentoring = observing && (configurations.length ? configurations.some((value) => value.enabled && value.reanchoring) : resolved.reanchoring)
  return {
    trajectory: !observing ? 'disabled' : trajectoryState === 'disabled' ? 'waiting' : trajectoryState,
    detector: !detecting ? 'disabled' : runningCount ? 'running' : 'idle',
    mentor: !mentoring ? 'disabled' : resetRequired ? 'escalated' : 'ready',
  }
}

const RECENT_WINDOW = 5   // evaluations in the recent ratio
const NOW_WINDOW = 3      // any drift among the last N means "drifting now"
const levelOf = (ratio) => ratio < 0.5 ? 'Stable' : ratio < 1 ? 'Approaching threshold' : ratio < 2 ? 'Drifting' : 'Severe drift'

/**
 * P4: drift summary that cannot be hidden by history. The cumulative averages stay (as separate
 * fields), but humanSummary follows the RECENT evaluations: 40 healthy then 3 drifting is drifting.
 */
export function createDriftSummary() {
  let total = 0
  let klTotal = 0
  let ratioTotal = 0
  let lastDriftAt
  let lastDriftTurn
  const recent = [] // newest last: { ratio, drifted }

  return {
    record({ turn, result, at }) {
      // Different chats may have different thresholds; each sample contributes its own ratio.
      const ratio = result.kl_divergence / result.threshold
      total += 1
      klTotal += result.kl_divergence
      ratioTotal += ratio
      recent.push({ ratio, drifted: result.drift_detected === true })
      if (recent.length > RECENT_WINDOW) recent.shift()
      if (result.drift_detected === true) { lastDriftAt = at; lastDriftTurn = turn }
    },
    applyTo(detector) {
      detector.averageThresholdRatio = total ? ratioTotal / total : undefined
      detector.averageKlDivergence = total ? klTotal / total : undefined
      detector.recentThresholdRatio = recent.length ? recent.reduce((sum, item) => sum + item.ratio, 0) / recent.length : undefined
      detector.lastDriftAt = lastDriftAt
      detector.lastDriftTurn = lastDriftTurn
      if (!recent.length) { detector.humanSummary = 'Waiting for measurements'; return }
      const lately = recent.slice(-NOW_WINDOW)
      detector.humanSummary = lately.some((item) => item.drifted)
        // Drifting now: grade by the worst of the last few, never below 'Drifting'.
        ? levelOf(Math.max(1, ...lately.map((item) => item.ratio)))
        : levelOf(detector.recentThresholdRatio)
    },
  }
}

// ---- Status mutations for detector/session events (E). They only touch the status object (and the
// running set / drift summary the caller owns), so the Host just wires them to the runtime.

/** Count one native session event the Host observed (the caller has already applied the off-gate). */
export function recordSessionEvent(status, seenSessions, sessionId, event) {
  seenSessions.add(sessionId)
  status.trajectory.sessionEvents += 1
  status.trajectory.sessionsObserved = seenSessions.size
  status.trajectory.lastEventAt = event.time
  status.trajectory.lastEventType = event.type
  status.trajectory.lastSessionId = sessionId
  if (event.type === 'assistant/message') status.trajectory.assistantMessages += 1
}

/** Detector subscribers that only mutate status: observation, evaluation start/finish and errors. */
export function createDetectorStatusHandlers({ status, running, driftSummary, noteDetectorError, recordError, now = Date.now }) {
  return {
    onObservation: ({ sessionId, baselineSize, baselineTarget, windowSize, windowTarget }) => {
      status.trajectory.state = 'observing'
      status.trajectory.lastSessionId = sessionId
      status.trajectory.baselineSize = baselineSize
      status.trajectory.baselineTarget = baselineTarget
      status.trajectory.windowSize = windowSize
      status.trajectory.windowTarget = windowTarget
    },
    onEvaluationStart: ({ sessionId }) => {
      running.add(sessionId)
      status.detector.state = 'running'
      status.detector.lastStartedAt = now()
    },
    onEvaluation: ({ sessionId, turn, singleTurn, result }) => {
      running.delete(sessionId)
      status.detector.state = running.size ? 'running' : 'idle'
      status.detector.evaluations += 1
      driftSummary.record({ turn, result, at: now() })
      driftSummary.applyTo(status.detector)
      status.detector.lastCompletedAt = now()
      status.detector.lastResult = {
        sessionId, turn, singleTurn,
        klDivergence: result.kl_divergence,
        threshold: result.threshold,
        driftDetected: result.drift_detected,
      }
    },
    onError: (error, details = {}) => {
      // A consumer error must not clear the running flag of a live evaluation (registry rule).
      noteDetectorError(details)
      recordError(error, details)
    },
  }
}
