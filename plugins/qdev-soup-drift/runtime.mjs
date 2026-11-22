import { createDetector, PRESETS } from './drift.mjs'
import { createReanchor } from './reanchor.mjs'

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
  const mentor = createReanchor({
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
  // Consumers (mentor, notify, status callbacks) must never be able to stop the SOUP core:
  // a throwing consumer is reported through onError and the core carries on.
  const isolate = (consumer, phase, fn) => {
    try { return fn() } catch (error) { try { onError(error, { phase: `consumer:${consumer}:${phase}` }) } catch {} }
  }
  let settings = { python, preset, enabled, detectorEnabled, reanchoring, baselineCount, windowCount }
  let generation = 0
  let disposed = false
  function createCurrentDetector(next) {
    const epoch = generation + 1
    // A killed worker may still close later, even after monitoring has been re-enabled.
    const current = (callback) => (...args) => {
      if (!disposed && settings.enabled && epoch === generation) callback(...args)
    }
    return createDetector({
      ...next,
      enabled: next.enabled && next.detectorEnabled,
      workerTimeoutMs,
      spawnProcess,
      onObservation: current((v) => isolate('status', 'observation', () => onObservation(v))),
      onEvaluationStart: current((v) => isolate('status', 'evaluationStart', () => onEvaluationStart(v))),
      onEvaluation: current((v) => isolate('status', 'evaluation', () => onEvaluation(v))),
      onDrift: current(({ sessionId, turn, singleTurn, result }) => {
        isolate('notify', 'drift', () => notify({ sessionId, turn, singleTurn, result }))
        if (settings.reanchoring) isolate('mentor', 'drift', () => mentor.drift(sessionId, { ...result, turn, singleTurn }))
      }),
      onError: current(onError),
    })
  }
  let detector = createCurrentDetector(settings)
  generation += 1
  return {
    configure(patch) {
      if (disposed) return false
      const next = { ...settings, ...patch }
      const reset = ['python', 'enabled', 'detectorEnabled', 'preset', 'baselineCount', 'windowCount']
        .some((key) => next[key] !== settings[key])
      // Construct/validate before invalidating the current detector; mentor state stays intact.
      const replacement = reset ? createCurrentDetector(next) : null
      settings = next
      if (replacement) {
        generation += 1
        detector.dispose()
        detector = replacement
      }
      return reset
    },
    observe(id, event) {
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
    mentorState(id) {
      return mentor.snapshot(id)
    },
    originalPlan(id) {
      return mentor.plan(id)
    },
    dispose() {
      disposed = true
      generation += 1
      detector.dispose()
      mentor.dispose()
    },
  }
}
