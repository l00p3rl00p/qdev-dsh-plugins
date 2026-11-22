// Item 4 - host-native publication. Cordis already provides named events between plugins
// (ctx.on / ctx.emit / ctx.parallel), so drift and intervention evidence are ALSO published through
// it, IN ADDITION to the in-process subscribe seam. Real Cordis Host + built dist + real SOUP worker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as contract from '../soup-core.mjs'
import { fixture } from './host-fixture.mjs'
import { opts, REF, until, sleep } from './proof-helpers.mjs'

const DRIFT = 'qdev-soup/drift-evidence/v1'
const INTERVENTION = 'qdev-soup/intervention-evidence/v1'

test('native: another plugin receives validated drift and intervention evidence with ctx.on only', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0 })
  // A peer that knows only the published event names and the contract: no SOUP import beyond the validator.
  const drifts = [], interventions = []
  f.ctx.on(DRIFT, (evidence) => { drifts.push(evidence) })
  f.ctx.on(INTERVENTION, (evidence) => { interventions.push(evidence) })
  f.start(); f.assistant(REF)
  await f.evaluate(); await f.evaluate()
  await until(() => drifts.length === 2 && interventions.length === 2)
  assert.equal(contract.DRIFT_EVIDENCE_EVENT, DRIFT)
  assert.equal(contract.INTERVENTION_EVIDENCE_EVENT, INTERVENTION)
  for (const evidence of drifts) assert.deepEqual(contract.validateDriftEvidence(evidence), { ok: true })
  for (const evidence of interventions) assert.deepEqual(contract.validateInterventionEvidence(evidence), { ok: true })
  assert.deepEqual(interventions.map((x) => [x.action, x.attempt]), [['reminder', 1], ['reminder', 2]])
  assert.deepEqual(interventions[0].respondsTo, { sessionId: drifts[0].sessionId, turn: drifts[0].turn, kl_divergence: drifts[0].result.kl_divergence, threshold: drifts[0].result.threshold })
  assert.equal(f.injected.length, 2)
})

test('native: a throwing peer cannot hide evidence from other peers or affect SOUP and Mentor', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0 })
  const before = [], after = []
  f.ctx.on(DRIFT, () => { throw new Error('native peer boom') })
  f.ctx.on(DRIFT, (x) => { after.push(x) })
  f.ctx.on(INTERVENTION, () => { throw new Error('native peer boom 2') })
  f.ctx.on(INTERVENTION, (x) => { before.push(x) })
  f.start(); f.assistant(REF)
  // f.evaluate()/f.status() assert errors === [], which is exactly what this test makes non-empty.
  const evaluations = async () => (await f.request()).body.detector.evaluations
  for (let n = 1; n <= 3; n += 1) {
    f.assistant()
    const end = Date.now() + 15000
    while ((await evaluations()) < n && Date.now() < end) await sleep(20)
    assert.equal(await evaluations(), n)
  }
  await until(() => after.length === 3 && before.length === 3)
  assert.equal(f.injected.length, 3, 'Mentor was affected by a native peer')
  assert.equal(f.questions.length, 1)
  const response = await f.request()               // not f.status(): that asserts errors === [] and these are expected
  const status = response.body
  assert.equal(status.detector.evaluations, 3)
  assert.equal(status.interventions.total, 3, 'the in-process status consumer was affected')
  assert.notEqual(status.detector.state, 'error', 'a peer failure flipped the detector to error')
  assert.ok(status.errors.length >= 1, 'the peer failure was not recorded')
  assert.ok(status.errors.every((e) => e.phase === 'consumer'), JSON.stringify(status.errors))
})
