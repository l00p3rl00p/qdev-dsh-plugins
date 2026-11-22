// Item 1 - the drift EVIDENCE CONTRACT. A consumer reads the contract only (evidence.mjs): no Mentor,
// no runtime, no DSH, no Cordis. Real SOUP worker output; skipped visibly without SOUP_PYTHON.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createDetector } from '../drift.mjs'
import * as contract from '../soup-core.mjs'
import { PY, opts, event, REF, LIVE, until, sleep } from './proof-helpers.mjs'

// A producer-side run that touches nothing but the detector and the contract module.
async function measure(extra = {}) {
  const seen = { evaluation: [], drift: [], errors: [] }
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, onError: (e, det) => seen.errors.push({ e, ...det }), ...extra })
  d.subscribe('evaluation', (x) => seen.evaluation.push(x), 'contract-reader')
  d.subscribe('drift', (x) => seen.drift.push(x), 'contract-reader')
  d.observe('s', event(REF)); d.observe('s', event(LIVE))
  await until(() => seen.evaluation.length >= 1); await sleep(100)
  const last = d.lastReport('s')
  d.dispose()
  return { seen, last }
}

test('contract: module defines a version, an event name and a validator', () => {
  assert.equal(contract.DRIFT_EVIDENCE_VERSION, 1)
  assert.equal(contract.DRIFT_EVIDENCE_EVENT, 'qdev-soup/drift-evidence/v1')
  assert.equal(typeof contract.validateDriftEvidence, 'function')
  assert.equal(typeof contract.createDriftEvidence, 'function')
})

test('contract: validator rejects every malformed shape with a reason', () => {
  const good = { sessionId: 's', turn: 1, singleTurn: true, result: { drift_detected: true, kl_divergence: 0.5, threshold: 0.05, n_reference: 1, n_live: 1 } }
  assert.deepEqual(contract.validateDriftEvidence(good), { ok: true })
  const bad = [
    [null], [[]], [{ ...good, sessionId: '' }], [{ ...good, turn: 1.5 }], [{ ...good, singleTurn: 'yes' }],
    [{ ...good, result: null }], [{ ...good, result: { ...good.result, drift_detected: 1 } }],
    [{ ...good, result: { ...good.result, kl_divergence: NaN } }], [{ ...good, result: { ...good.result, threshold: 0 } }],
    [{ ...good, result: { ...good.result, n_live: -1 } }],
  ]
  for (const [value] of bad) {
    const check = contract.validateDriftEvidence(value)
    assert.equal(check.ok, false, JSON.stringify(value))
    assert.ok(check.errors.length >= 1)
  }
  assert.deepEqual(contract.validateDriftEvidence({ ...good, turn: null }), { ok: true }, 'a multi-turn window has turn null')
  assert.deepEqual(contract.validateDriftEvidence({ ...good, result: { ...good.result, extra: 1 } }), { ok: true }, 'additive result fields are allowed')
})

test('producer: real worker output is emitted as validated drift evidence, to a contract-only consumer', opts, async () => {
  const { seen, last } = await measure()
  assert.equal(seen.errors.length, 0)
  assert.equal(seen.evaluation.length, 1)
  assert.equal(seen.drift.length, 1)
  for (const evidence of [seen.evaluation[0], seen.drift[0], last]) {
    assert.deepEqual(contract.validateDriftEvidence(evidence), { ok: true })
    assert.deepEqual(Object.keys(evidence).sort(), ['result', 'sessionId', 'singleTurn', 'turn'], 'exactly the contract fields')
  }
  assert.equal(seen.evaluation[0].result.drift_detected, true)
  assert.equal(seen.evaluation[0].result.n_reference, 1)
  assert.equal(seen.evaluation[0].result.n_live, 1)
})

test('producer: the evidence handed to consumers is frozen, so one consumer cannot alter what a peer sees', opts, async () => {
  const { seen } = await measure()
  const evidence = seen.evaluation[0]
  assert.equal(Object.isFrozen(evidence), true)
  assert.equal(Object.isFrozen(evidence.result), true)
  assert.throws(() => { 'use strict'; evidence.result.kl_divergence = 0 }, TypeError)
})

test('producer: a malformed worker result is a parse failure, never delivered as evidence', opts, async () => {
  // Stand-in process: a REAL child that prints a JSON object violating the contract (the real worker
  // cannot be made to emit one). Everything else is the production path.
  const spawnProcess = (_python, _args, options) => spawn(process.execPath, ['-e', 'process.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({drift_detected:"maybe"})))'], options)
  const seen = { evaluation: [], errors: [] }
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, spawnProcess,
    onEvaluation: (x) => seen.evaluation.push(x), onError: (e, det) => seen.errors.push(det) })
  d.observe('s', event(REF)); d.observe('s', event(LIVE))
  await until(() => seen.errors.length >= 1); await sleep(100)
  d.dispose()
  assert.equal(seen.evaluation.length, 0, 'an invalid result reached a consumer')
  assert.equal(seen.errors[0].phase, 'parse')
})
