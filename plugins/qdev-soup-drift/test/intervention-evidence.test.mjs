// Item 3 - DERIVED evidence. Evidence -> Consumers -> Derived evidence -> Consumers:
// drift evidence -> Gentle Mentor -> intervention evidence -> a second consumer (status).
// Real SOUP worker; skipped visibly without SOUP_PYTHON.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as contract from '../soup-core.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import * as statusModule from '../status.mjs'
const { createStatus } = statusModule
import { fixture } from './host-fixture.mjs'
import { PY, opts, event, REF, LIVE, until, sleep } from './proof-helpers.mjs'

const userMsg = { type: 'user/message', data: { id: '1', source: { kind: 'user' }, content: [{ type: 'text', text: 'Stay with the plan' }] } }

// One chat, window of 1: every LIVE message is a real, drifting measurement in turn 1.
function rig(extra = {}) {
  const log = { evals: [], injected: [], escalated: [], interventions: [], errors: [] }
  const runtime = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    inject: (x) => log.injected.push(x), escalate: (x) => log.escalated.push(x),
    onEvaluation: (r) => log.evals.push(r), onError: (e, d) => log.errors.push({ e, ...d }), ...extra })
  runtime.subscribe('intervention', (x) => log.interventions.push(x), 'second-consumer')
  runtime.observe('s', { type: 'turn/start', data: { turn: 1 } }); runtime.observe('s', userMsg)
  runtime.observe('s', event(REF))
  const drift = async () => { const n = log.evals.length; runtime.observe('s', event(LIVE)); await until(() => log.evals.length === n + 1) }
  return { runtime, log, drift }
}

test('contract: intervention evidence has a version, an event name, an action vocabulary and a validator', () => {
  assert.equal(contract.INTERVENTION_EVIDENCE_VERSION, 1)
  assert.equal(contract.INTERVENTION_EVIDENCE_EVENT, 'qdev-soup/intervention-evidence/v1')
  assert.deepEqual(contract.INTERVENTION_ACTIONS, ['reminder', 'escalation', 'reset', 'carry'])
  const ref = { sessionId: 's', turn: 1, kl_divergence: 1, threshold: 0.05 }
  const good = { sessionId: 's', turn: 1, action: 'reminder', attempt: 1, strikes: 1, carry: 0, respondsTo: ref }
  assert.deepEqual(contract.validateInterventionEvidence(good), { ok: true })
  for (const bad of [null, { ...good, action: 'shout' }, { ...good, attempt: null }, { ...good, strikes: -1 }, { ...good, respondsTo: null }, { ...good, respondsTo: { ...ref, kl_divergence: 'x' } }]) {
    assert.equal(contract.validateInterventionEvidence(bad).ok, false, JSON.stringify(bad))
  }
  assert.deepEqual(contract.validateInterventionEvidence({ ...good, action: 'reset', attempt: null, strikes: 0, respondsTo: null }), { ok: true })
})

test('real loop: drift evidence -> Mentor -> intervention evidence -> a second consumer receives each action', opts, async () => {
  const { runtime, log, drift } = rig()
  await drift(); await drift(); await drift()
  await until(() => log.interventions.length === 3)
  assert.deepEqual(log.interventions.map((x) => [x.action, x.attempt, x.strikes]), [['reminder', 1, 1], ['reminder', 2, 2], ['escalation', null, 3]])
  for (const [i, evidence] of log.interventions.entries()) {
    assert.deepEqual(contract.validateInterventionEvidence(evidence), { ok: true })
    assert.equal(Object.isFrozen(evidence), true)
    // It REFERENCES the drift evidence it answered: same session, turn and measured numbers.
    const answered = log.evals[i]
    assert.deepEqual(contract.validateDriftEvidence(answered), { ok: true })
    assert.deepEqual(evidence.respondsTo, { sessionId: answered.sessionId, turn: answered.turn, kl_divergence: answered.result.kl_divergence, threshold: answered.result.threshold })
    assert.equal(evidence.sessionId, 's'); assert.equal(evidence.turn, 1)
  }
  // Human decision: reset publishes derived evidence that still points at the escalating drift.
  assert.equal(runtime.decideDriftReset('s', true).accepted, true)
  const reset = log.interventions.at(-1)
  assert.deepEqual([reset.action, reset.strikes, reset.carry], ['reset', 0, 0])
  assert.deepEqual(reset.respondsTo, log.interventions[2].respondsTo)
  assert.deepEqual(log.errors, [])
  runtime.dispose()
})

test('real loop: keeping the count publishes a carry action', opts, async () => {
  const { runtime, log, drift } = rig()
  await drift(); await drift(); await drift()
  await until(() => log.interventions.length === 3)
  runtime.decideDriftReset('s', false)
  const carry = log.interventions.at(-1)
  assert.deepEqual([carry.action, carry.strikes, carry.carry], ['carry', 3, 3])
  assert.deepEqual(contract.validateInterventionEvidence(carry), { ok: true })
  runtime.dispose()
})

test('a throwing second consumer affects neither Mentor nor SOUP, and a healthy peer still receives', opts, async () => {
  const { runtime, log, drift } = rig()
  runtime.subscribe('intervention', () => { throw new Error('second consumer boom') }, 'thrower')
  const late = []
  runtime.subscribe('intervention', (x) => late.push(x), 'after-the-thrower')
  await drift(); await drift()
  await until(() => log.interventions.length === 2 && late.length === 2)
  assert.equal(log.injected.length, 2, 'Mentor was affected by a consumer of its evidence')
  assert.equal(log.evals.length, 2, 'SOUP measurement was affected')
  assert.equal(log.errors.filter((e) => e.phase === 'consumer' && e.consumer === 'thrower').length, 2)
  assert.equal(log.errors.filter((e) => e.phase === 'parse').length, 0)
  await drift()                                   // still measuring, still escalating
  assert.equal(log.escalated.length, 1)
  runtime.dispose()
})

test('Mentor off publishes no intervention evidence', opts, async () => {
  const { runtime, log, drift } = rig({ reanchoring: false })
  await drift(); await sleep(200)
  assert.equal(log.interventions.length, 0)
  runtime.dispose()
})

test('status consumer counts interventions from the evidence contract alone', () => {
  const status = createStatus({ identity: {}, resolved: { enabled: true, detectorEnabled: true, reanchoring: true, baselineCount: 1, windowCount: 1 }, threshold: 0.05 })
  assert.deepEqual(status.interventions, { total: 0, reminders: 0, escalations: 0, resets: 0, carries: 0 })
  assert.equal(typeof statusModule.createInterventionStatusHandler, 'function', 'status.mjs must export createInterventionStatusHandler')
  const consume = statusModule.createInterventionStatusHandler({ status, now: () => 42 })
  const ref = { sessionId: 's', turn: 1, kl_divergence: 1, threshold: 0.05 }
  consume(contract.createInterventionEvidence({ sessionId: 's', turn: 1, action: 'reminder', attempt: 1, strikes: 1, carry: 0, respondsTo: ref }))
  consume(contract.createInterventionEvidence({ sessionId: 's', turn: 1, action: 'escalation', strikes: 3, carry: 3, respondsTo: ref }))
  consume(contract.createInterventionEvidence({ sessionId: 's', turn: 1, action: 'reset', strikes: 0, carry: 0, respondsTo: ref }))
  assert.deepEqual(status.interventions, { total: 3, reminders: 1, escalations: 1, resets: 1, carries: 0, lastAt: 42, last: { sessionId: 's', turn: 1, action: 'reset', attempt: null, strikes: 0 } })
  assert.throws(() => consume({ action: 'reminder' }), /Invalid intervention evidence/, 'a malformed evidence must be rejected, not counted')
  assert.equal(status.interventions.total, 3)
})

test('real Host: the status panel counts the interventions the Mentor published (the loop, end to end)', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0 })
  f.start(); f.assistant(REF)
  assert.equal((await f.status()).interventions.total, 0)
  await f.evaluate(); await f.evaluate()
  const s = await f.until((x) => x.interventions?.reminders === 2, 'status never counted the two reminders')
  assert.equal(s.interventions.total, 2)
  assert.equal(s.interventions.last.action, 'reminder')
  assert.equal(s.interventions.last.strikes, 2)
  await f.evaluate()
  const e = await f.until((x) => x.interventions?.escalations === 1, 'status never counted the escalation')
  assert.equal(e.interventions.total, 3)
})
