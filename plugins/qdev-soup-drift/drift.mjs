import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const PRESETS = Object.freeze([0.05, 0.1, 0.2, 0.3, 0.4])
const WORKER = fileURLToPath(new URL('./soup_worker.py', import.meta.url))

export function assistantText(event) {
  if (event?.type !== 'assistant/message' || event.data?.interrupted) return ''
  return (event.data?.message?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
    .slice(0, 100000)
}

export function createDetector({
  python,
  preset = 2,
  enabled = true,
  baselineCount = 4,
  windowCount = 4,
  workerTimeoutMs = 30000,
  onObservation = () => {},
  onEvaluationStart = () => {},
  onEvaluation = () => {},
  onDrift = () => {},
  onError = () => {},
  spawnProcess = spawn,
} = {}) {
  if (typeof python !== 'string' || !python) throw new Error('Python executable required')
  if (!Number.isInteger(preset) || preset < 0 || preset > 4) throw new Error('Invalid sensitivity preset')
  if (![baselineCount, windowCount].every((value) => Number.isInteger(value) && value > 0 && value <= 100)) {
    throw new Error('Invalid window')
  }
  if (!Number.isInteger(workerTimeoutMs) || workerTimeoutMs < 1000) throw new Error('Invalid worker timeout')

  const states = new Map()
  const children = new Set()
  let disposed = false

  function stateOf(id) {
    const key = String(id)
    let state = states.get(key)
    if (!state) {
      state = { base: [], live: [], pending: false }
      states.set(key, state)
    }
    return [key, state]
  }

  function publishObservation(sessionId, state, turn) {
    onObservation({
      sessionId,
      turn,
      baselineSize: state.base.length,
      baselineTarget: baselineCount,
      windowSize: state.live.length,
      windowTarget: windowCount,
      pending: state.pending,
    })
  }

  function seed(id, events) {
    if (!enabled || disposed) return
    const [key, state] = stateOf(id)
    for (const event of events ?? []) {
      const text = assistantText(event)
      if (!text) continue
      const turn = Number.isInteger(event.data?.turn) ? event.data.turn : null
      if (state.base.length < baselineCount) state.base.push({ text, turn })
    }
    state.live.length = 0
    publishObservation(key, state, null)
  }

  function finish(sessionId, state) {
    state.pending = false
    publishObservation(sessionId, state, null)
    pump(sessionId, state)
  }

  function pump(sessionId, state) {
    if (disposed || state.pending || state.live.length < windowCount) return
    const window = state.live.splice(0, windowCount)
    const turns = [...new Set(window.map((item) => item.turn).filter(Number.isInteger))]
    const turn = turns.length === 1 ? turns[0] : null
    const singleTurn = turns.length === 1 && window.every((item) => item.turn === turn)
    state.pending = true
    onEvaluationStart({ sessionId, turn, singleTurn, baselineSize: state.base.length, windowSize: window.length })

    let child
    try {
      child = spawnProcess(python, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      finish(sessionId, state)
      onError(error, { sessionId, turn, phase: 'spawn' })
      return
    }
    children.add(child)
    let output = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    const timeout = setTimeout(() => {
      if (settled) return
      timedOut = true
      child.kill('SIGTERM')
      onError(new Error(`SOUP worker timed out after ${workerTimeoutMs}ms`), { sessionId, turn, phase: 'timeout' })
    }, workerTimeoutMs)

    const settle = () => {
      if (settled) return false
      settled = true
      clearTimeout(timeout)
      children.delete(child)
      return true
    }

    child.stdout.on('data', (bytes) => {
      output += bytes.toString()
      if (output.length > 16384) child.kill('SIGTERM')
    })
    child.stderr.on('data', (bytes) => {
      stderr += bytes.toString()
      if (stderr.length > 4096) child.kill('SIGTERM')
    })
    child.on('error', (error) => {
      if (!settle()) return
      finish(sessionId, state)
      if (!disposed) onError(error, { sessionId, turn, phase: 'process' })
    })
    child.on('close', (code) => {
      if (!settle()) return
      finish(sessionId, state)
      if (disposed || timedOut) return
      if (code !== 0) {
        onError(new Error(`SOUP worker exit ${code}: ${stderr.slice(0, 500)}`), { sessionId, turn, phase: 'worker' })
        return
      }
      try {
        const result = JSON.parse(output)
        const report = { sessionId, turn, singleTurn, result }
        onEvaluation(report)
        if (result.drift_detected) onDrift(report)
      } catch (error) {
        onError(error, { sessionId, turn, phase: 'parse' })
      }
    })
    child.stdin.end(JSON.stringify({
      reference: state.base.map((item) => item.text),
      live: window.map((item) => item.text),
      threshold: PRESETS[preset],
    }))
  }

  function observe(id, event) {
    if (!enabled || disposed) return
    const text = assistantText(event)
    if (!text) return
    const [key, state] = stateOf(id)
    const turn = Number.isInteger(event.data?.turn) ? event.data.turn : null
    if (state.base.length < baselineCount) state.base.push({ text, turn })
    else state.live.push({ text, turn })
    publishObservation(key, state, turn)
    pump(key, state)
  }

  return {
    observe,
    seed,
    dispose() {
      disposed = true
      for (const child of children) child.kill('SIGTERM')
      children.clear()
      states.clear()
    },
  }
}
