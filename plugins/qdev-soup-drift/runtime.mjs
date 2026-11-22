import { createDetector, PRESETS } from './drift.mjs'
import { createReanchor } from './reanchor.mjs'
import { toObservations } from './soup-core.mjs'
import { detectorSettings } from './detector-settings.mjs'
import { mentorSettings } from './mentor-settings.mjs'

export { PRESETS }

export function createPluginRuntime({
  python,
  preset = 2,
  enabled = true,
  detectorEnabled = true,
  reanchoring = true,
  baselineCount = 4,
  windowCount = 4,
  workerTimeoutMs = 30000,
  inject = () => {},
  escalate = () => {},
  notify = () => {},
  reportMissing = () => {},
  reportStale = () => {},
  onObservation = () => {},
  onEvaluationStart = () => {},
  onEvaluation = () => {},
  onError = () => {},
  initialMentorState = {},
  onMentorStateChange = () => {},
  contextFor = () => ({}),
  bypassFor = () => false,
  onRegister = () => {},
  spawnProcess,
} = {}) {
  // Intervention evidence seam (same thin, in-process shape as the detector's subscribe): Mentor publishes, any
  // number of consumers listen, each isolated. Mentor does not know who they are.
  const interventionListeners = []
  let reportConsumerError = () => {}
  const publishIntervention = (evidence) => {
    for (const { fn, name } of [...interventionListeners]) {
      const details = { sessionId: evidence.sessionId, turn: evidence.turn, phase: 'consumer', consumer: name }
      // M1: a consumer that returns a thenable is isolated too; its rejection is a named consumer failure.
      try {
        const returned = fn(evidence)
        if (typeof returned?.then === 'function') returned.then(undefined, (error) => reportConsumerError(error, details))
      } catch (error) { reportConsumerError(error, details) }
    }
  }
  const mentor = createReanchor({
    publish: publishIntervention,
    reportEvidenceError: (error, details) => reportConsumerError(error, details),
    inject,
    escalate,
    reportMissing,
    reportStale,
    initialState: initialMentorState,
    onStateChange: onMentorStateChange,
    contextFor,
    bypassFor,
    onRegister,
  })
  // Status callbacks and Mentor's own observation must never be able to stop the SOUP core: a throwing
  // one is reported through onError (phase consumer:<name>:<topic>) and the core carries on.
  const isolate = (consumer, phase, fn) => {
    try { return fn() } catch (error) { try { onError(error, { phase: `consumer:${consumer}:${phase}` }) } catch {} }
  }
  let settings = { python, preset, enabled, detectorEnabled, reanchoring, baselineCount, windowCount }
  let disposed = false
  // A late callback must not act after dispose or while the master switch is off. Stale worker results
  // from before a configuration change are rejected inside the detector (epoch fence).
  const fence = (callback) => (...args) => {
    if (!disposed && settings.enabled) return callback(...args)
  }
  // The detector's configuration comes from the DETECTOR's settings only; no Mentor key reaches it.
  const detectorConfig = detectorSettings.toDetectorConfig
  // P1: the detector core is built with NO consumers. Everything below is a subscriber wired from here;
  // the core never imports or calls Mentor, so it can be used and tested alone.
  const detector = createDetector({ ...detectorSettings.toDetectorConfig(settings), workerTimeoutMs, spawnProcess })
  detector.subscribe('observation', fence((v) => isolate('status', 'observation', () => onObservation(v))), 'observation')
  detector.subscribe('evaluationStart', fence((v) => isolate('status', 'evaluationStart', () => onEvaluationStart(v))), 'evaluationStart')
  detector.subscribe('evaluation', fence((v) => isolate('status', 'evaluation', () => onEvaluation(v))), 'evaluation')
  // notify and Mentor are independent subscribers of the same completed drift report; the detector
  // isolates each, so one failing never hides the other or the measurement.
  detector.subscribe('drift', fence(({ sessionId, turn, singleTurn, result }) => notify({ sessionId, turn, singleTurn, result })), 'notify')
  detector.subscribe('drift', fence(({ sessionId, turn, singleTurn, result }) => {
    if (mentorSettings.isActive(settings)) mentor.drift(sessionId, { ...result, turn, singleTurn })
  }), 'mentor')
  detector.subscribe('error', fence(onError), 'error')
  // A failing consumer is reported like the detector's own consumer failures (never as a worker failure).
  reportConsumerError = fence((error, details) => { try { onError(error, details) } catch { /* nothing further can be reported */ } })
  return {
    // `history` ((id) => DSH events) lets a baseline GROWTH refill its new slots from the earliest session
    // history instead of the next arriving events (decision C). Omit it when no history is available.
    configure(patch, { history } = {}) {
      if (disposed) return false
      const next = { ...settings, ...patch }
      // "reset" only reports a resume/suspend transition (the host replays history on resume); a threshold
      // or window-size change keeps every window, so it is not a reset.
      const reset = ['python', 'enabled', 'detectorEnabled'].some((key) => next[key] !== settings[key])
      // Commit the new settings BEFORE reconfiguring: re-enabling can publish evaluationStart / observation
      // synchronously, and the fence must already see enabled=true. Restore on throw.
      const previous = settings
      settings = next
      try {
        // P5: the detector is reconfigured in place, so collected baseline/live windows survive. A
        // Mentor-only change yields an identical detector config, so reconfigure() is a no-op.
        detector.reconfigure(detectorSettings.toDetectorConfig(next), history ? { history: (id) => toObservations(history(id)) } : {})
      } catch (error) {
        settings = previous
        throw error
      }
      return reset
    },
    // Attach another subscriber (e.g. a status panel) to the detector.
    // kind: observation | evaluationStart | evaluation | drift | error (detector evidence)
    //       intervention (Mentor's derived evidence, see soup-core.mjs)
    subscribe(kind, fn, name = kind) {
      if (kind !== 'intervention') return detector.subscribe(kind, fence(fn), name)
      if (typeof fn !== 'function') throw new TypeError('Subscriber must be a function')
      const entry = { fn: fence(fn), name }
      interventionListeners.push(entry)
      return () => { const at = interventionListeners.indexOf(entry); if (at >= 0) interventionListeners.splice(at, 1) }
    },
    observe(id, event) {
      // Decision A ("Off is off"): a disabled/suspended runtime intentionally ignores events silently
      // (no count, no diagnostic, no measurement). Do not add a counter here.
      if (disposed || !settings.enabled) return
      // Core first: measurement never waits on, or fails with, the mentor.
      detector.observe(id, event)
      isolate('mentor', 'observe', () => mentor.observe(id, event))
    },
    replay(id, events) {
      if (disposed || !settings.enabled) return
      // Re-seeding a detector must not replay old turn boundaries and erase this turn's strikes.
      const firstIntent = events?.find((event) => event.type === 'user/message' && event.data?.source?.kind === 'user')
      const latestTurn = events?.findLast((event) => event.type === 'turn/start')
      detector.seed(id, events)
      if (firstIntent) isolate('mentor', 'replay', () => mentor.observe(id, firstIntent))
      if (latestTurn) isolate('mentor', 'replay', () => mentor.observe(id, latestTurn))
    },
    decideDriftReset(id, reset) {
      if (disposed || !settings.enabled) return { accepted: false, reason: 'disabled' }
      return mentor.decide(id, reset)
    },
    // True while a worker measurement for this session is in flight.
    isEvaluating(id) {
      return detector.counts(id).pending
    },
    mentorState(id) {
      return mentor.snapshot(id)
    },
    originalPlan(id) {
      return mentor.plan(id)
    },
    dispose() {
      disposed = true
      detector.dispose()
      mentor.dispose()
    },
  }
}
