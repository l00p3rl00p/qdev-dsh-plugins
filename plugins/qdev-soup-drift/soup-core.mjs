// SOUP Core: the whole contract is  input -> official SOUP calculation -> result.
// It knows nothing about sessions, mentors, settings, storage, HTTP or UI, and imports only Node built-ins.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const PRESETS = Object.freeze([0.05, 0.1, 0.2, 0.3, 0.4])
export const WORKER = fileURLToPath(new URL('./soup_worker.py', import.meta.url))

const tag = (error, phase) => Object.assign(error instanceof Error ? error : new Error(String(error)), { phase })

// Start one measurement; returns cancel(). `done(error, result)` is called exactly once, synchronously
// when the worker closes. result = { drift_detected, kl_divergence, threshold, n_reference, n_live };
// error carries .phase: spawn | process | timeout | worker | parse. cancel() kills the worker (done then
// reports phase 'worker' or 'timeout').
export function startMeasurement({
  python,
  reference,
  live,
  threshold,
  timeoutMs = 30000,
  spawnProcess = spawn,
}, done) {
  let child
  let kill = () => {}
  {
    const reject = (error) => done(error)
    const resolve = (result) => done(null, result)
    try {
      child = spawnProcess(python, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      reject(tag(error, 'spawn'))
      return () => {}
    }
    kill = () => child.kill('SIGTERM')
    let output = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    child.stdout.on('data', (bytes) => {
      output += bytes.toString()
      if (output.length > 16384) kill()
    })
    child.stderr.on('data', (bytes) => {
      stderr += bytes.toString()
      if (stderr.length > 4096) kill()
    })
    child.on('error', (error) => finish(reject, tag(error, 'process')))
    child.on('close', (code) => {
      if (timedOut) return finish(reject, tag(new Error(`SOUP worker timed out after ${timeoutMs}ms`), 'timeout'))
      if (code !== 0) return finish(reject, tag(new Error(`SOUP worker exit ${code}: ${stderr.slice(0, 500)}`), 'worker'))
      try {
        finish(resolve, JSON.parse(output))
      } catch (error) {
        finish(reject, tag(error, 'parse'))
      }
    })
    child.stdin.end(JSON.stringify({ reference, live, threshold }))
  }
  return () => kill()
}

// Convenience for callers that only want the answer.
export const measureDrift = (input) => new Promise((resolve, reject) => {
  startMeasurement(input, (error, result) => (error ? reject(error) : resolve(result)))
})
