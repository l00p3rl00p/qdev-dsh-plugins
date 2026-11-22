// SOUP drift monitor: the deliverable. Session events in -> drift values out.
// Needs only Node and a Python with official soup-cli. No mentor, settings, storage, HTTP or UI.
// Everything else in this package is a CONSUMER: it calls subscribe() and may fail, be absent or be off
// without affecting the measurement or its delivery to the other consumers.
import { createDetector, PRESETS } from './drift.mjs'

export { PRESETS }

// The one value this module produces (camelCase mirror of the SOUP worker result + where it came from).
export const toSignal = ({ sessionId, turn, singleTurn, result }, at = Date.now()) => Object.freeze({
  sessionId, turn, singleTurn,
  driftDetected: result.drift_detected === true,
  klDivergence: result.kl_divergence,
  threshold: result.threshold,
  nReference: result.n_reference,
  nLive: result.n_live,
  at,
})

// Consumer topics: observation | evaluationStart | evaluation | drift | error. Each consumer is a plain object of
// optional handlers. A throwing handler is reported to the other consumers' `error` handlers and never propagates.
export function createDriftMonitor({ onSignal, ...detectorOptions } = {}) {
  const consumers = new Set()
  const latest = new Map()

  const emit = (topic, payload) => {
    for (const consumer of [...consumers]) {
      const handler = consumer[topic]
      if (typeof handler !== 'function') continue
      try {
        handler(payload)
      } catch (error) {
        if (topic !== 'error') emit('error', { error, phase: `consumer:${topic}` })
      }
    }
  }
  if (typeof onSignal === 'function') consumers.add({ evaluation: onSignal })

  const detector = createDetector({
    ...detectorOptions,
    onObservation: (value) => emit('observation', value),
    onEvaluationStart: (value) => emit('evaluationStart', value),
    onEvaluation: (report) => {
      const signal = toSignal(report)
      latest.set(String(signal.sessionId), signal)
      emit('evaluation', signal)
    },
    onDrift: (report) => emit('drift', toSignal(report)),
    onError: (error, context = {}) => emit('error', { error, ...context }),
  })

  return {
    observe: detector.observe,
    seed: detector.seed,
    latest: (sessionId) => latest.get(String(sessionId)),
    subscribe(consumer) {
      consumers.add(consumer)
      return () => consumers.delete(consumer)
    },
    dispose() {
      detector.dispose()
      consumers.clear()
      latest.clear()
    },
  }
}
