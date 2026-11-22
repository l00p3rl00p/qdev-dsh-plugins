// P1: detection is separable from Mentor/notify. The detector core only EMITS to subscribers.
// Real SOUP worker (no mocks, no fake spawn). Proof is by behaviour, not by grepping source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, sleep, until } from './proof-helpers.mjs'

test('P1a: detector with ZERO subscribers and no Mentor measures with the real worker', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1 })
  d.observe('s', event(REF)); d.observe('s', event(LIVE))
  await until(() => d.lastReport('s'))
  const report = d.lastReport('s')   // read before dispose(): dispose clears detector state
  d.dispose()
  assert.ok(report, 'no measurement reported without subscribers')
  assert.equal(typeof report.result.kl_divergence, 'number')
  assert.equal(report.result.threshold, 0.05)
  assert.equal(report.result.drift_detected, true)
})

test('P1b: two drift subscribers get the same report; one throwing does not stop the other', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1 })
  const a = [], b = [], errors = []
  d.subscribe('error', (_e, details) => errors.push(details))
  d.subscribe('drift', (report) => { a.push(report); throw new Error('subscriber a boom') }, 'a')
  d.subscribe('drift', (report) => { b.push(report) }, 'b')
  d.observe('s', event(REF)); d.observe('s', event(LIVE))
  await until(() => b.length >= 1); await sleep(200)
  d.dispose()
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
  assert.equal(a[0], b[0], 'both subscribers must receive the same report')
  assert.equal(errors.filter((e) => e.phase === 'parse').length, 0)
  assert.deepEqual(errors.map((e) => [e.phase, e.consumer]), [['consumer', 'a']])
})

async function runRuntime(extra) {
  const log = { injected: 0, notices: [], results: [], thirdParty: [] }
  const p = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    inject: () => { log.injected++ }, escalate: () => {}, notify: (r) => log.notices.push(r),
    onEvaluation: (r) => log.results.push(r.result), ...extra })
  p.subscribe('drift', (report) => log.thirdParty.push(report), 'third-party')
  p.observe('s', { type: 'turn/start', data: { turn: 1 } })
  p.observe('s', { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Stay with the plan' }] } })
  p.observe('s', event(REF)); p.observe('s', event(LIVE))
  await until(() => log.results.length >= 1); await sleep(300)
  p.dispose()
  return log
}

test('P1c: reanchoring:false leaves the measurement identical and Mentor never invoked; subscribers are the wiring', opts, async () => {
  const withMentor = await runRuntime({})
  const without = await runRuntime({ reanchoring: false })
  assert.equal(withMentor.results.length, 1)
  assert.deepEqual(without.results, withMentor.results)
  assert.equal(withMentor.injected, 1, 'Mentor should have been invoked once when enabled')
  assert.equal(without.injected, 0, 'Mentor must never be invoked when reanchoring is off')
  assert.equal(without.notices.length, 1, 'notify still fires')
  assert.equal(without.thirdParty.length, 1, 'a subscriber registered on the runtime receives the same drift report')
  assert.equal(without.thirdParty[0].result.kl_divergence, without.results[0].kl_divergence)
})
