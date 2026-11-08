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
  const detector = createDetector({
    python,
    preset,
    enabled: enabled && detectorEnabled,
    baselineCount,
    windowCount,
    workerTimeoutMs,
    spawnProcess,
    onObservation,
    onEvaluationStart,
    onEvaluation,
    onDrift: ({ sessionId, turn, singleTurn, result }) => {
      notify({ sessionId, turn, singleTurn, result })
      if (enabled && reanchoring) mentor.drift(sessionId, { ...result, turn, singleTurn })
    },
    onError,
  })
  return {
    observe(id, event) {
      if (!enabled) return
      mentor.observe(id, event)
      detector.observe(id, event)
    },
    replay(id, events) {
      if (!enabled) return
      for (const event of events ?? []) mentor.observe(id, event)
      detector.seed(id, events)
    },
    decideDriftReset(id, reset) {
      return mentor.decide(id, reset)
    },
    mentorState(id) {
      return mentor.snapshot(id)
    },
    dispose() {
      detector.dispose()
      mentor.dispose()
    },
  }
}
