// The Gentle Mentor ACTION seam (mentor-actions.mjs): Mentor decides, an action carries the decision out.
// New behaviour, tested first (RED before mentor-actions.mjs and the `actions` option existed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createReanchor, FIRST_DRIFT_MESSAGE, HUMAN_QUESTION, secondDriftReminder } from '../reanchor.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { createInjectAction, runActions, validateActions } from '../mentor-actions.mjs'
import { fixture, BASELINE } from './host-fixture.mjs'
import { opts, PY, REF, event, until, sleep } from './proof-helpers.mjs'

const planEvent = (text) => ({ type: 'user/message', data: { id: 'original', source: { kind: 'user' }, content: [{ type: 'text', text }] } })
const drifted = (extra = {}) => ({ drift_detected: true, turn: 7, kl_divergence: 0.5, threshold: 0.2, ...extra })
function mentorWith(options = {}) {
  const mentor = createReanchor({ inject: () => {}, escalate: () => {}, ...options })
  mentor.observe('s', planEvent('The mission is unchanged.'))
  mentor.observe('s', { type: 'turn/start', data: { turn: 7 } })
  return mentor
}

// ---- the list and the runner -------------------------------------------------------------------------------------
test('validateActions: a malformed list is refused at construction', () => {
  assert.throws(() => validateActions('x'), TypeError)
  assert.throws(() => validateActions([{ name: 'a' }]), TypeError)
  assert.throws(() => validateActions([{ run() {} }]), TypeError)
  assert.throws(() => validateActions([null]), TypeError)
  assert.deepEqual(validateActions([]), [])
})

test('runActions: actions start in list order; synchronous work is visible in that order', () => {
  const log = []
  runActions([{ name: 'a', run: () => { log.push('a') } }, { name: 'b', run: () => { log.push('b') } }, { name: 'c', run: () => { log.push('c') } }],
    { kind: 'reminder', attempt: 1, strikes: 1, respondsTo: { sessionId: 's', turn: 1 }, text: 't' })
  assert.deepEqual(log, ['a', 'b', 'c'])
})

test('runActions: a throwing action and a rejecting action stop neither the others nor the caller; each is reported by name', async () => {
  const log = [], errors = [], results = []
  const request = { kind: 'reminder', attempt: 2, strikes: 2, respondsTo: { sessionId: 's', turn: 4 }, text: 't' }
  runActions([
    { name: 'throws', run: () => { throw new Error('sync boom') } },
    { name: 'rejects', run: async () => { throw new Error('async boom') } },
    { name: 'healthy', run: () => { log.push('healthy'); return { ok: true } } },
    { name: 'declines', run: () => ({ ok: false, error: 'nothing to do' }) },
    { name: 'last', run: async () => { log.push('last') } },
  ], request, { reportError: (e, d) => errors.push([e.message, d]), onResult: (r) => results.push(r) })
  await sleep(10)
  assert.deepEqual(log, ['healthy', 'last'])
  assert.deepEqual(errors.map(([m]) => m).sort(), ['async boom', 'sync boom'])
  for (const [, details] of errors) assert.deepEqual({ ...details, consumer: undefined }, { sessionId: 's', turn: 4, phase: 'consumer', consumer: undefined })
  assert.deepEqual(errors.map(([, d]) => d.consumer).sort(), ['action:rejects', 'action:throws'])
  const by = Object.fromEntries(results.map((r) => [r.name, r]))
  assert.equal(by.throws.ok, false); assert.equal(by.throws.error, 'sync boom')
  assert.equal(by.rejects.ok, false); assert.equal(by.rejects.error, 'async boom')
  assert.equal(by.healthy.ok, true)
  assert.deepEqual([by.declines.ok, by.declines.error], [false, 'nothing to do'])
  assert.equal(by.last.ok, true)
  assert.deepEqual([by.healthy.kind, by.healthy.sessionId, by.healthy.turn, by.healthy.attempt], ['reminder', 's', 4, 2])
})

test('runActions: a throwing result or error callback cannot stop the loop', () => {
  const log = []
  runActions([{ name: 'a', run: () => { throw new Error('x') } }, { name: 'b', run: () => { log.push('b') } }],
    { kind: 'reminder', attempt: 1, strikes: 1, respondsTo: { sessionId: 's', turn: 1 }, text: 't' },
    { reportError: () => { throw new Error('report boom') }, onResult: () => { throw new Error('result boom') } })
  assert.deepEqual(log, ['b'])
})

// ---- Mentor hands each decision to the actions -------------------------------------------------------------------
test('Mentor: every decision reaches the actions as a request {kind, attempt, strikes, respondsTo, text}', () => {
  const seen = []
  const mentor = mentorWith({ actions: [{ name: 'record', run: (r) => { seen.push(r) } }] })
  assert.equal(mentor.drift('s', drifted()), 'injected')
  assert.equal(mentor.drift('s', drifted()), 'injected')
  assert.equal(mentor.drift('s', drifted()), 'human')
  assert.deepEqual(seen.map((r) => [r.kind, r.attempt, r.strikes]), [['reminder', 1, 1], ['reminder', 2, 2], ['escalation', null, 3]])
  assert.deepEqual(seen.map((r) => r.text), [FIRST_DRIFT_MESSAGE, secondDriftReminder({ plan: 'The mission is unchanged.', amendments: [] }), HUMAN_QUESTION])
  const ref = { sessionId: 's', turn: 7, kl_divergence: 0.5, threshold: 0.2 }
  for (const r of seen) assert.deepEqual(r.respondsTo, ref)
  assert.ok(seen.every((r) => Object.isFrozen(r)), 'a request must not be editable by an action')
  assert.deepEqual(Object.keys(seen[0]).sort(), ['attempt', 'kind', 'respondsTo', 'strikes', 'text'])
})

test('Mentor: actions run before the evidence is published, in list order, and the bypass path uses them too', () => {
  const order = []
  const mentor = mentorWith({
    actions: [{ name: 'one', run: () => { order.push('one') } }, { name: 'two', run: () => { order.push('two') } }],
    publish: (e) => order.push(`evidence:${e.action}`),
    bypassFor: () => true,
  })
  mentor.drift('s', drifted())
  assert.deepEqual(order, ['one', 'two', 'evidence:reminder'])
})

test('Mentor: a throwing action cannot stop the other actions, the evidence, or the strike count', () => {
  const log = [], published = [], errors = []
  const mentor = mentorWith({
    actions: [{ name: 'bad', run: () => { throw new Error('boom') } }, { name: 'good', run: (r) => { log.push(r.attempt) } }],
    publish: (e) => published.push(e.action),
    reportActionError: (e, d) => errors.push([e.message, d.consumer]),
  })
  assert.equal(mentor.drift('s', drifted()), 'injected')
  assert.equal(mentor.drift('s', drifted()), 'injected')
  assert.deepEqual(log, [1, 2])
  assert.deepEqual(published, ['reminder', 'reminder'])
  assert.deepEqual(errors, [['boom', 'action:bad'], ['boom', 'action:bad']])
  assert.equal(mentor.snapshot('s').driftCount, 2)
})

test('Mentor: action results are reported by name', async () => {
  const results = []
  const mentor = mentorWith({ actions: [{ name: 'ok', run: () => {} }, { name: 'no', run: () => ({ ok: false, error: 'declined' }) }], onActionResult: (r) => results.push(r) })
  mentor.drift('s', drifted())
  assert.deepEqual(results.map((r) => [r.name, r.ok, r.kind, r.attempt]), [['ok', true, 'reminder', 1], ['no', false, 'reminder', 1]])
})

test('Mentor: when actions are supplied they REPLACE the old inject/escalate callbacks, so nothing injects twice', () => {
  const legacy = [], acted = []
  const mentor = mentorWith({ inject: (x) => legacy.push(x), escalate: (x) => legacy.push(x), actions: [{ name: 'a', run: (r) => { acted.push(r.kind) } }] })
  mentor.drift('s', drifted()); mentor.drift('s', drifted()); mentor.drift('s', drifted())
  assert.deepEqual(legacy, [])
  assert.deepEqual(acted, ['reminder', 'reminder', 'escalation'])
})

test('Mentor: with no actions the old callbacks behave exactly as before; neither present is still an error', () => {
  const legacy = []
  const mentor = mentorWith({ inject: (x) => legacy.push(x.attempt) })
  mentor.drift('s', drifted())
  assert.deepEqual(legacy, [1])
  assert.throws(() => createReanchor({}), /Callbacks required/)
  assert.doesNotThrow(() => createReanchor({ actions: [{ name: 'a', run() {} }] }))
  assert.throws(() => createReanchor({ inject() {}, escalate() {}, actions: [{ name: 'a' }] }), TypeError)
})

// ---- the inject action, with a small adapter -----------------------------------------------------------------------
// The Host cannot reach these two failure branches (a disabled runtime never calls Mentor, and a runtime exists only
// after its agent resolved), so they are pinned here at the action level only, with a small adapter.
function adapterFor({ agent, enabled = true, askService } = {}) {
  const sent = [], tracked = [], logs = [], missing = []
  const mentor = { state: 'ready', reminders: [] }
  const liveRecord = {}
  return {
    sent, tracked, logs, missing, mentor, liveRecord,
    adapter: {
      enabled: () => enabled, agentFor: () => agent, live: () => liveRecord, mentor,
      makeMessage: (m) => ({ id: `msg-${sent.length + 1}`, ...m }), track: (r) => tracked.push(r), send: (a, m) => sent.push(m),
      warn: (t) => logs.push(t), abort() {}, interventions: new Map(), questions: () => askService, noteMissing: (s) => missing.push(s),
      decide() {}, recordError() {},
    },
  }
}
const reminderRequest = { kind: 'reminder', attempt: 1, strikes: 1, respondsTo: { sessionId: 'c', turn: 3, kl_divergence: 0.4, threshold: 0.2 }, text: FIRST_DRIFT_MESSAGE }

test('inject action (action level only): no live receiving agent marks the reminder failed and says so', () => {
  const h = adapterFor({ agent: undefined })
  const result = createInjectAction(h.adapter).run(reminderRequest)
  assert.deepEqual(result, { ok: false, error: 'No live receiving agent' })
  assert.equal(h.mentor.reminders[0].state, 'failed')
  assert.equal(h.mentor.reminders[0].error, 'No live receiving agent')
  assert.equal(h.mentor.state, 'error')
  assert.equal(h.liveRecord.mentorActivity, 'error')
  assert.deepEqual(h.sent, [])
  assert.deepEqual(h.logs, ['SOUP reminder could not be injected: no agent session=c'])
})

test('inject action (action level only): a chat with intervention disabled gets nothing sent and a failed record', () => {
  const h = adapterFor({ agent: { id: 'c' }, enabled: false })
  const result = createInjectAction(h.adapter).run(reminderRequest)
  assert.deepEqual(result, { ok: false, error: 'Intervention disabled for this chat' })
  assert.deepEqual(h.sent, [])
  assert.equal(h.mentor.reminders[0].state, 'failed')
  assert.equal(h.mentor.state, 'reminding', 'the former code left the state at reminding here; kept')
})

test('inject action (recording adapter, not a real agent): a reminder handed to the adapter is queued once, tracked by message id, and keeps only the last six records', () => {
  const h = adapterFor({ agent: { id: 'c' } })
  const action = createInjectAction(h.adapter)
  for (let i = 1; i <= 8; i += 1) assert.deepEqual(action.run({ ...reminderRequest, attempt: i }), { ok: true })
  assert.equal(h.sent.length, 8)
  assert.deepEqual(h.sent[0], { id: 'msg-1', text: FIRST_DRIFT_MESSAGE, form: 'reminder', attempt: 1, kl: 0.4, threshold: 0.2 })
  assert.deepEqual(h.mentor.reminders.map((r) => r.attempt), [3, 4, 5, 6, 7, 8])
  assert.equal(h.tracked.at(-1).messageId, 'msg-8')
  assert.equal(h.liveRecord.mentorActivity, 'reminding')
})

test('inject action: an escalation without the question service still sends the message and records the failure', () => {
  const h = adapterFor({ agent: { id: 'c' } })
  const result = createInjectAction(h.adapter).run({ kind: 'escalation', attempt: null, strikes: 3, respondsTo: reminderRequest.respondsTo, text: HUMAN_QUESTION })
  assert.deepEqual(result, { ok: false, error: 'User questions service unavailable' })
  assert.equal(h.sent.length, 1)
  assert.deepEqual(h.missing, ['userQuestions'])
  assert.equal(h.mentor.escalation.state, 'failed')
  assert.equal(h.mentor.state, 'error')
})

// ---- real runtime and Host ----------------------------------------------------------------------------------------
test('adding a second action needs no change to detector code (static) and the detector/core never name actions', () => {
  for (const file of ['../drift.mjs', '../soup-core.mjs', '../monitor.mjs']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(/mentor-actions|reanchor|createInjectAction|runActions/.test(text), false, `${file} must not know about Mentor actions`)
  }
})

test('real runtime + real worker: two actions both receive each decision; the detector is built the same either way', opts, async () => {
  const a = [], b = []
  const p = createPluginRuntime({
    python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    actions: [{ name: 'a', run: (r) => { a.push(r) } }, { name: 'b', run: async (r) => { b.push(r) } }],
  })
  p.observe('s', { type: 'turn/start', data: { turn: 1 } })
  p.observe('s', { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'plan' }] } })
  p.observe('s', event(REF)); p.observe('s', event('different unrelated output topic'))
  await until(() => a.length >= 1 && b.length >= 1)
  p.dispose()
  assert.deepEqual([a.length, b.length], [1, 1])
  assert.equal(a[0].kind, 'reminder')
  assert.deepEqual(a[0], b[0])
})

test('real Host: the inject action is the only action and its result is recorded in status beside the unchanged fields', opts, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  const s = await f.evaluate()
  assert.equal(f.injected.length, 1)
  assert.deepEqual(s.mentor.actionResults.map((r) => [r.name, r.kind, r.sessionId, r.attempt, r.ok]), [['inject', 'reminder', 'synthetic-soup-loader-chat', 1, true]])
  assert.equal(s.mentor.reminders[0].state, 'pending')
  await f.evaluate(); await f.evaluate()
  const e = await f.status()
  assert.deepEqual(e.mentor.actionResults.map((r) => [r.kind, r.attempt, r.ok]), [['reminder', 1, true], ['reminder', 2, true], ['escalation', null, true]])
})
