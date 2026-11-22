// P2/P3/P4: pure host decisions live in host-independent modules (no DSH, no cordis, no zod):
//   status.mjs (status object, recordError, operational state, drift summary)
//   session-registry.mjs (session -> runtime, running set, drop accounting)
// Imports are dynamic so each test fails on its own if a module is missing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, sleep, until } from './proof-helpers.mjs'

const resolved = { python: 'python3', enabled: true, detectorEnabled: true, reanchoring: true, preset: 2, baselineCount: 4, windowCount: 4 }
const identity = { name: 'n', version: 'v', description: 'd', source: 's' }
const loadStatus = () => import('../status.mjs')
const loadRegistry = () => import('../session-registry.mjs')

// ---- P2: status + registry decisions -------------------------------------------------
test('P2a: recordError keeps only the newest 8', async () => {
  const { createStatus, recordError } = await loadStatus()
  const status = createStatus({ identity, resolved, threshold: 0.2 })
  for (let i = 0; i < 12; i++) recordError(status, new Error(`e${i}`), { phase: 'worker', sessionId: 's' })
  assert.equal(status.errors.length, 8)
  assert.equal(status.errors[0].message, 'e11')
  assert.equal(status.errors[7].message, 'e4')
})

test('P2b: consumer errors do not set detector.state=error; measurement errors do; disabled stays disabled', async () => {
  const { createStatus, recordError } = await loadStatus()
  const status = createStatus({ identity, resolved, threshold: 0.2 })
  assert.equal(status.detector.state, 'idle')
  recordError(status, new Error('x'), { phase: 'consumer', sessionId: 's' })
  assert.equal(status.detector.state, 'idle')
  recordError(status, new Error('x'), { phase: 'worker', sessionId: 's' })
  assert.equal(status.detector.state, 'error')
  const off = createStatus({ identity, resolved: { ...resolved, enabled: false }, threshold: 0.2 })
  assert.equal(off.detector.state, 'disabled')
  recordError(off, new Error('x'), { phase: 'worker' })
  assert.equal(off.detector.state, 'disabled')
})

test('P2c: running set -> running/idle; disabled stays disabled', async () => {
  const { deriveOperationalState } = await loadStatus()
  const base = { resolved, configurations: [], runningCount: 0, trajectoryState: 'waiting', resetRequired: false }
  assert.equal(deriveOperationalState(base).detector, 'idle')
  assert.equal(deriveOperationalState({ ...base, runningCount: 2 }).detector, 'running')
  const off = deriveOperationalState({ ...base, resolved: { ...resolved, enabled: false }, runningCount: 2 })
  assert.equal(off.detector, 'disabled'); assert.equal(off.trajectory, 'disabled')
  const perChat = deriveOperationalState({ ...base, configurations: [{ enabled: true, detectorEnabled: false, reanchoring: true }], runningCount: 1 })
  assert.equal(perChat.detector, 'disabled'); assert.equal(perChat.mentor, 'ready')
})

test('P2d: registry detector errors: consumer errors keep the running flag; measurement errors clear it', async () => {
  const { createSessionRegistry } = await loadRegistry()
  const reg = createSessionRegistry({ resolveAgent: () => undefined, attachAgent: () => {}, replay: () => {}, report: () => {} })
  reg.running.add('s')
  reg.noteDetectorError({ phase: 'consumer', sessionId: 's' })
  assert.equal(reg.running.has('s'), true)
  reg.noteDetectorError({ phase: 'worker', sessionId: 's' })
  assert.equal(reg.running.has('s'), false)
})

// ---- P3: drops are never silent ---------------------------------------------------------
test('P3: unknown session -> counted + ONE drop diagnostic; processed normally once resolvable', opts, async () => {
  const { createSessionRegistry } = await loadRegistry()
  const evals = [], reports = []
  let known = false
  const history = []                        // what the session already holds (replay source)
  let runtime
  const reg = createSessionRegistry({
    resolveAgent: (id) => (known ? { id } : undefined),
    attachAgent: () => {},
    // Same shape as host replayAgent: create the real runtime lazily and seed it with prior events.
    replay: (agent, beforeSeq) => {
      runtime = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, reanchoring: false,
        onEvaluation: (r) => evals.push(r.result) })
      reg.runtimes.set(agent.id, runtime)
      runtime.replay(agent.id, history.filter((e) => e.seq < beforeSeq))
    },
    report: (error, details) => reports.push({ message: error.message, ...details }),
  })
  const e1 = { ...event(REF), seq: 1 }, e2 = { ...event(LIVE), seq: 2 }
  history.push(e1)
  assert.equal(reg.observe('s', e1), false)
  assert.equal(reg.droppedEvents, 1)
  assert.equal(reg.observe('s', { ...e1, seq: 1 }), false)
  assert.equal(reg.droppedEvents, 2)
  assert.equal(reports.filter((r) => r.phase === 'drop').length, 1, 'exactly one drop diagnostic per session')
  assert.equal(reports[0].sessionId, 's')
  assert.match(reports[0].message, /no agent/i)
  known = true; history.push(e2)
  assert.equal(reg.observe('s', e2), true)       // replays e1 (seq<2), then observes e2 normally
  await until(() => evals.length >= 1)
  runtime.dispose()
  assert.equal(evals.length, 1, 'the event was not processed once the session became resolvable')
  assert.equal(reg.droppedEvents, 2)
  assert.equal(reports.length, 1)
})

// ---- P4: recent drift must not be hidden by the cumulative average ------------------------
async function realResults() {
  // One healthy and one drifting result from the REAL worker (reused as data for the summary).
  // 4-message baseline/window at preset 4 gives a drift ratio low enough that 3 of 43 samples
  // leave the cumulative average below the old 'Stable' cut-off (0.5).
  const baseline = ['I will edit the file and run the tests', 'Now I am updating the module and checking the tests pass',
    'The tests pass so I will review the diff', 'I will edit the module and run the test suite again']
  const drifting = ['I will edit the file and run the tests', 'The tests pass so I will review the diff',
    'I will edit the module and run the test suite again', 'Let me summarize the result']
  const out = {}
  const run = (id, live) => { for (const t of [...baseline, ...live]) d.observe(id, event(t)) }
  const d = createDetector({ python: PY, preset: 4, baselineCount: 4, windowCount: 4,
    onEvaluation: (r) => { (out[r.result.drift_detected ? 'drift' : 'ok'] ??= r.result) } })
  run('a', baseline); run('b', drifting)
  await until(() => out.ok && out.drift, 30000)
  d.dispose()
  return out
}

test('P4a: 40 healthy then 3 drifting -> summary says drifting while the cumulative average stays separate', opts, async () => {
  const { createDriftSummary } = await loadStatus()
  const { ok, drift } = await realResults()
  assert.ok(ok && drift, 'real worker did not produce both a healthy and a drifting result')
  const sum = createDriftSummary()
  const det = {}
  for (let i = 0; i < 40; i++) sum.record({ sessionId: 's', turn: i, singleTurn: true, result: ok, at: 1000 + i })
  sum.applyTo(det)
  assert.equal(det.humanSummary, 'Stable')
  for (let i = 40; i < 43; i++) sum.record({ sessionId: 's', turn: i, singleTurn: true, result: drift, at: 1000 + i })
  sum.applyTo(det)
  const cumulative = det.averageThresholdRatio
  assert.ok(cumulative < 0.5, `precondition: the old cumulative rule would say Stable (${cumulative})`)
  assert.ok(['Drifting', 'Severe drift'].includes(det.humanSummary), `summary was ${det.humanSummary}`)
  assert.equal(det.lastDriftTurn, 42)
  assert.equal(det.lastDriftAt, 1042)
  assert.ok(det.recentThresholdRatio > cumulative)
  assert.equal(det.averageKlDivergence > 0, true)
})

test('P4b: healthy-only stays Stable; empty is Waiting for measurements', opts, async () => {
  const { createDriftSummary } = await loadStatus()
  const { ok } = await realResults()
  const sum = createDriftSummary(); const det = {}
  sum.applyTo(det); assert.equal(det.humanSummary, 'Waiting for measurements')
  for (let i = 0; i < 10; i++) sum.record({ sessionId: 's', turn: i, singleTurn: true, result: ok, at: i })
  sum.applyTo(det)
  assert.equal(det.humanSummary, 'Stable')
  assert.equal(det.lastDriftAt, undefined)
})
