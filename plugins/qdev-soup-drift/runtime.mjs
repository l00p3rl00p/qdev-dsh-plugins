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
  spawnProcess,
} = {}) {
  const mentor = createReanchor({
    inject,
    escalate,
    reportMissing,
    reportStale,
    initialState: initialMentorState,
    onStateChange: onMentorStateChange,
  })
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
      onObservation: current(onObservation),
      onEvaluationStart: current(onEvaluationStart),
      onEvaluation: current(onEvaluation),
      onDrift: current(({ sessionId, turn, singleTurn, result }) => {
        notify({ sessionId, turn, singleTurn, result })
        if (settings.reanchoring) mentor.drift(sessionId, { ...result, turn, singleTurn })
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
      mentor.observe(id, event)
      detector.observe(id, event)
    },
    replay(id, events) {
      if (disposed || !settings.enabled) return
      // Re-seeding a detector must not replay old turn boundaries and erase this turn's strikes.
      const firstIntent = events?.find((event) => event.type === 'user/message' && event.data?.source?.kind === 'user')
      const latestTurn = events?.findLast((event) => event.type === 'turn/start')
      if (firstIntent) mentor.observe(id, firstIntent)
      if (latestTurn) mentor.observe(id, latestTurn)
      detector.seed(id, events)
    },
    decideDriftReset(id, reset) {
      if (disposed || !settings.enabled) return { accepted: false, reason: 'disabled' }
      return mentor.decide(id, reset)
    },
    mentorState(id) {
      return mentor.snapshot(id)
    },
    dispose() {
      disposed = true
      generation += 1
      detector.dispose()
      mentor.dispose()
    },
  }
}
