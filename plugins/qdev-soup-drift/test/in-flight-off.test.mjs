// Decision B: turning a chat OFF while a measurement is in flight must not lose that window. The worker
// is cancelled, the window returns to the FRONT of live in order, and it is measured once when the chat is
// turned back on (attributed once, stale worker output rejected). Events while off stay ignored (decision A).
// Real SOUP worker and the real built Host; nothing is mocked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, sleep, until } from './proof-helpers.mjs'
import { fixture, BASELINE, DRIFT } from './host-fixture.mjs'

test('B1: detector - disable with a window in flight keeps it in order, measures it once on re-enable', opts, async () => {
  const evals = []
  const starts = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 2,
    onEvaluationStart: (e) => starts.push(e), onEvaluation: (r) => evals.push(r) })
  d.observe('s', event(REF, 1)); d.observe('s', event(LIVE + ' one', 7)); d.observe('s', event(LIVE + ' two', 7))
  assert.equal(d.counts('s').pending, true, 'precondition: the window is in flight')
  d.reconfigure({ enabled: false })
  assert.deepEqual(d.counts('s'), { baseline: 1, live: 2, pending: false }, 'the in-flight window was discarded on disable')
  d.observe('s', event(LIVE + ' ignored while off', 7))
  assert.deepEqual(d.counts('s'), { baseline: 1, live: 2, pending: false }, 'events while off must still be ignored')
  await sleep(1500)   // the cancelled worker must not deliver anything while off
  assert.equal(evals.length, 0, 'a result for the cancelled worker was delivered')
  d.reconfigure({ enabled: true })
  assert.equal(starts.length, 2, 'the kept window was not measured again on re-enable')
  await until(() => evals.length >= 1); await sleep(1500)
  d.dispose()
  assert.equal(evals.length, 1, `window must be attributed exactly once, got ${evals.length}`)
  assert.equal(evals[0].turn, 7)
  assert.equal(evals[0].singleTurn, true)
})

test('B2: runtime - same through createPluginRuntime.configure (the path the Host uses)', opts, async () => {
  const evals = []
  const p = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, reanchoring: false,
    onEvaluation: (r) => evals.push(r.result) })
  p.observe('s', event(REF)); p.observe('s', event(LIVE))
  assert.equal(p.isEvaluating('s'), true)
  p.configure({ enabled: false })
  await sleep(1500)
  assert.equal(evals.length, 0)
  p.configure({ enabled: true })
  await until(() => evals.length >= 1); await sleep(1500)
  p.dispose()
  assert.equal(evals.length, 1, `expected exactly one evaluation, got ${evals.length}`)
})

test('B3: Host - agent leaves mid-measurement, comes back: that window is measured once, counted once', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0, reanchoring: false })
  f.start(); f.assistant(BASELINE)
  f.assistant(DRIFT)   // window in flight (real worker starting)
  assert.equal((await f.status()).detector.state, 'running', 'precondition: a measurement is in flight')
  f.live.delete(f.agent.id)
  f.ctx.emit('agent/disposed', { agent: f.agent })
  await sleep(1500)
  assert.equal((await f.status()).detector.evaluations, 0, 'cancelled worker result must not be counted while off')
  f.assistant(DRIFT)   // ignored while off (decision A)
  f.live.set(f.agent.id, f.agent)
  f.ctx.emit('agent/created', { agent: f.agent })
  // The kept window starts measuring synchronously on re-enable: the Host must show it as running.
  assert.equal((await f.status()).detector.state, 'running', 'Host cleared the running flag of the re-measured kept window')
  const s = await f.until((x) => x.detector.evaluations >= 1, 'kept window was never measured after turning back on')
  await sleep(1500)
  const end = await f.status()
  assert.equal(end.detector.evaluations, 1, `window counted ${end.detector.evaluations} times, expected exactly once`)
  assert.equal(end.detector.lastResult.turn, 1)
  assert.equal(s.detector.droppedEvents, 0)
})
