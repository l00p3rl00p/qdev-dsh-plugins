#!/usr/bin/env node
// Run the SOUP drift monitor on a session event log (JSONL, one event per line; stdin or a file).
//   node monitor-cli.mjs [--python PY] [--preset 0-4] [--baseline N] [--window N] [session.jsonl]
// Prints one JSON drift signal per evaluation, then a one-line summary on stderr. Exit 0 = monitor ran.
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { createDriftMonitor, PRESETS } from './monitor.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args.splice(i, 2)[1] }
const python = opt('python', process.env.SOUP_PYTHON ?? 'python3')
const preset = Number(opt('preset', 2))
const baselineCount = Number(opt('baseline', 4))
const windowCount = Number(opt('window', 4))
const file = args[0]

let evaluations = 0, drifts = 0, errors = 0
const state = { pending: false, windowSize: 0 }
const monitor = createDriftMonitor({ python, preset, baselineCount, windowCount })
monitor.subscribe({
  observation: (o) => { state.pending = o.pending; state.windowSize = o.windowSize },
  evaluation: (signal) => { evaluations += 1; if (signal.driftDetected) drifts += 1; console.log(JSON.stringify(signal)) },
  error: ({ error, phase }) => { errors += 1; console.error(`monitor error (${phase ?? 'unknown'}): ${error.message}`) },
})

const lines = createInterface({ input: file ? createReadStream(file) : process.stdin })
const session = file ?? 'stdin'
for await (const line of lines) {
  if (!line.trim()) continue
  let event
  try { event = JSON.parse(line) } catch { continue }
  monitor.observe(session, event)
}
// Evaluations run in worker processes: wait until nothing is pending and no full window is waiting.
await new Promise((resolve) => {
  const check = () => (state.pending || state.windowSize >= windowCount ? setTimeout(check, 100) : resolve())
  check()
})
console.error(`threshold=${PRESETS[preset]} evaluations=${evaluations} drifts=${drifts} errors=${errors}`)
monitor.dispose()
process.exit(errors && !evaluations ? 1 : 0)
