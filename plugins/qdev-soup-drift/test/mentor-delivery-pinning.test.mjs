// PINNING tests for how Gentle Mentor carries out its decisions in the real Host (what it hands to the agent, the
// escalation dialog, live markers, the bypass register, the older qdev-soup/signal publication).
//
// SCOPE: these pin the Host's OWN behaviour against a recording stand-in for the agent (host-fixture.mjs). `f.injected`
// is the list of messages the Host handed over, and every "splice" below is an `agent/inbox/spliced` event emitted by
// the test itself. Nothing here shows that a real Harness agent received, queued, spliced or displayed a message;
// that is NOT-PROVEN (see the skipped test at the end of this file).
// They are GUARDS, not RED tests: they describe today's behaviour and pass on the code before the action seam exists.
// They must keep passing, unchanged, after the refactor. Real Cordis, Loader, Session, built dist/index.js, real SOUP worker.
//
// Already pinned elsewhere (not repeated here): the reminder/escalation sequence and attempt numbers
// (host-config.test.mjs 'master OFF cancels intervention...', 'global reanchoring OFF...', 'reset Yes/No...'),
// the abort of a live question on OFF (same file), intervention evidence contents (native-seam.test.mjs,
// intervention-evidence.test.mjs), signal-channel isolation (native-seam.test.mjs).
//
// NOT reachable through the Host (so pinned at the action level in mentor-actions.test.mjs instead): the "no live
// receiving agent" and "intervention disabled for this chat" failure branches of delivery. The Host disables a runtime
// when its agent leaves, and a disabled runtime never calls Mentor, so those branches cannot be entered from here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, BASELINE } from './host-fixture.mjs'
import { opts } from './proof-helpers.mjs'
import { FIRST_DRIFT_MESSAGE, HUMAN_QUESTION, secondDriftReminder } from '../reanchor.mjs'

const PLAN = 'Implement the original plan, without unrelated work.'
const CHAT = 'synthetic-soup-loader-chat'
const LIVE_ROW = 'qdev_soup_live_history'
const REGISTER = 'qdev_soup_register'
const CONTEXT = 'qdev_soup_mentor_context'
const SIGNAL = 'qdev-soup/signal'

const textOf = (message) => message.content.map((block) => block.text).join('\n')
// What the inbox event looks like when DSH confirms that a queued message was spliced into the chat.
const splice = (f, message) => f.append('agent/inbox/spliced', { inserted: [{ id: message.id, source: message.source }] })
const markerKinds = (f) => f.tables.get(LIVE_ROW).get(CHAT).markers.map((marker) => marker.kind)

test('pin: the exact reminder and escalation messages, and the source each one carries', opts, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  const first = await f.evaluate()
  const second = await f.evaluate()
  const third = await f.evaluate()
  assert.equal(f.injected.length, 3)
  assert.deepEqual(f.injected.map(textOf), [
    FIRST_DRIFT_MESSAGE,
    secondDriftReminder({ plan: PLAN, amendments: [] }),
    `SOUP measured repeated trajectory drift and paused automatic reanchoring. ${HUMAN_QUESTION}`,
  ])
  // reminder: attempt, measured KL and threshold ride on the message source; escalation carries no attempt.
  assert.deepEqual(f.injected[0].source, { kind: 'qdev-trajectory-drift-soup', form: 'reminder', attempt: 1, kl: first.detector.lastResult.klDivergence, threshold: 0.2 })
  assert.deepEqual(f.injected[1].source, { kind: 'qdev-trajectory-drift-soup', form: 'reminder', attempt: 2, kl: second.detector.lastResult.klDivergence, threshold: 0.2 })
  assert.deepEqual(f.injected[2].source, { kind: 'qdev-trajectory-drift-soup', form: 'escalation', kl: third.detector.lastResult.klDivergence, threshold: 0.2 })
})

test('pin (recording agent, hand-emitted splice event): reminder bookkeeping goes pending, then delivered, on the splice event', opts, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  assert.deepEqual((await f.status()).mentor.reminders, [])
  const s1 = await f.evaluate()
  // Step 1: queued in the agent inbox, not yet confirmed.
  assert.equal(f.injected.length, 1)
  assert.equal(s1.mentor.state, 'reminding')
  assert.equal(s1.mentor.reminders.length, 1)
  const record = s1.mentor.reminders[0]
  assert.deepEqual(Object.keys(record).sort(), ['attempt', 'kind', 'messageId', 'requestedAt', 'sessionId', 'state', 'turn'])
  assert.equal(record.kind, 'reminder')
  assert.equal(record.attempt, 1)
  assert.equal(record.sessionId, CHAT)
  assert.equal(record.turn, 1)
  assert.equal(record.state, 'pending')
  assert.equal(record.messageId, String(f.injected[0].id))
  assert.equal(s1.mentor.lastOutcome, undefined)
  // A splice that is not ours (another source kind) is ignored; the record stays pending.
  f.append('agent/inbox/spliced', { inserted: [{ id: f.injected[0].id, source: { kind: 'user' } }] })
  assert.equal((await f.status()).mentor.reminders[0].state, 'pending')
  // Step 2: the native inbox event confirms it.
  const event = splice(f, f.injected[0])
  const s2 = await f.status()
  assert.equal(s2.mentor.reminders[0].state, 'delivered')
  assert.equal(s2.mentor.reminders[0].eventSeq, Number(event.seq))
  assert.equal(s2.mentor.reminders[0].deliveredAt, event.time)
  assert.equal(s2.mentor.lastOutcome, `reminder delivered in native agent inbox event ${String(event.seq)}.`)
  // The same confirmation twice changes nothing (the pending entry is consumed).
  splice(f, f.injected[0])
  assert.equal((await f.status()).mentor.lastOutcome, s2.mentor.lastOutcome)
  // Step 3: the next reminder is a second pending record beside the delivered one.
  const s3 = await f.evaluate()
  assert.deepEqual(s3.mentor.reminders.map((item) => [item.attempt, item.state]), [[1, 'delivered'], [2, 'pending']])
})

test('pin (recording agent): the escalation record, the human dialog, and the clarification handed to the agent', opts, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  await f.evaluate()
  await f.evaluate()
  const s = await f.evaluate()
  assert.equal(s.mentor.state, 'escalated')
  assert.equal(s.mentor.escalation.kind, 'escalation')
  assert.equal(s.mentor.escalation.state, 'pending')
  assert.equal(s.mentor.escalation.messageId, String(f.injected[2].id))
  assert.equal('attempt' in s.mentor.escalation, false)
  assert.equal(s.mentor.reminders.length, 2, 'the escalation is not a reminder entry')
  assert.equal(f.questions.length, 1)
  const { request } = f.questions[0]
  assert.equal(request.agent, f.agent)
  assert.equal(request.signal.aborted, false)
  const kl = s.detector.lastResult.klDivergence.toFixed(4)
  assert.deepEqual(request.questions, [{
    id: 'trajectory-clarification', header: 'Trajectory drift', question: HUMAN_QUESTION,
    detail: `SOUP detected a third qualifying drift window (KL ${kl}, threshold 0.2). Your response will be delivered to the agent.`,
  }, {
    id: 'reset-drift-count', header: 'Drift accountability', question: 'Reset the accumulated qualifying-drift count?',
    detail: 'Reset starts the reminder policy from zero. Keep carries the three strikes forward, so the next qualifying drift escalates immediately.',
    options: [
      { label: 'Yes — reset to 0', description: 'Give the corrected trajectory a fresh two-reminder allowance.' },
      { label: 'No — carry 3 forward', description: 'Keep accountability across turns; the next qualifying drift escalates.' },
    ],
  }])
  f.questions[0].resolve({ answers: [
    { id: 'trajectory-clarification', selected: [], custom: '  Use the plan in the first message.  ' },
    { id: 'reset-drift-count', selected: ['Yes — reset to 0'] },
  ] })
  const after = await f.until((x) => x.mentor.escalation?.state === 'answered', 'the answer never reached the escalation record')
  assert.equal(f.injected.length, 4)
  assert.equal(textOf(f.injected[3]), 'Human clarification after SOUP escalation:\n\nUse the plan in the first message.')
  assert.deepEqual(f.injected[3].source, { kind: 'qdev-trajectory-drift-soup', form: 'clarification' })
  assert.equal(after.mentor.lastOutcome, 'Human clarification delivered; drift count reset to 0.')
  assert.equal(after.mentor.driftCount, 0)
  assert.equal(after.mentor.resetDecision, undefined)
  const event = splice(f, f.injected[3])
  assert.equal(markerKinds(f).at(-1), 'clarification')
  assert.equal((await f.status()).mentor.lastOutcome, `clarification delivered in native agent inbox event ${String(event.seq)}.`)
})

test('pin: the choice to carry the count forward is reported with its own outcome text', opts, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  await f.evaluate(); await f.evaluate(); await f.evaluate()
  f.questions[0].resolve({ answers: [
    { id: 'trajectory-clarification', selected: ['Stay on plan'] },
    { id: 'reset-drift-count', selected: ['No — carry 3 forward'] },
  ] })
  const after = await f.until((x) => x.mentor.escalation?.state === 'answered', 'no answer recorded')
  assert.equal(textOf(f.injected[3]), 'Human clarification after SOUP escalation:\n\nStay on plan')
  assert.equal(after.mentor.lastOutcome, 'Human clarification delivered; three qualifying drifts carried forward.')
  assert.equal(after.mentor.carriedDrifts, 3)
})

test('pin (recording agent): without the user-questions service the escalation message is still handed over and the failure is recorded', opts, async (t) => {
  const f = await fixture(t, {}, {}, { userQuestions: false })
  f.start()
  f.assistant(BASELINE)
  await f.evaluate(); await f.evaluate()
  const s = await f.evaluate()
  assert.equal(f.injected.length, 3)
  assert.equal(f.injected[2].source.form, 'escalation')
  assert.equal(s.mentor.escalation.state, 'failed')
  assert.equal(s.mentor.escalation.error, 'User questions service unavailable')
  assert.equal(s.mentor.state, 'error')
  assert.ok(s.lifecycle.degraded.includes('userQuestions'))
  assert.equal(s.mentor.resetDecision.required, true)
  assert.equal(s.mentor.driftCount, 3)
})

test('pin (hand-emitted splice events): live markers appear (crossing, then each splice confirmation)', opts, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  await f.evaluate()
  assert.deepEqual(markerKinds(f), ['crossing'], 'a measured crossing is marked before anything is confirmed')
  splice(f, f.injected[0])
  assert.deepEqual(markerKinds(f), ['crossing', 'reminder'])
  await f.evaluate(); await f.evaluate()
  assert.deepEqual(markerKinds(f), ['crossing', 'reminder', 'crossing', 'crossing'], 'queued but unconfirmed messages are not marked')
  splice(f, f.injected[2])
  assert.deepEqual(markerKinds(f), ['crossing', 'reminder', 'crossing', 'crossing', 'escalation'])
  for (const marker of f.tables.get(LIVE_ROW).get(CHAT).markers) assert.equal(typeof marker.at, 'number')
})

test('pin: markers are capped at fifty, dropping the oldest', opts, async (t) => {
  const seeded = Array.from({ length: 49 }, (_, i) => ({ at: i + 1, kind: 'crossing' }))
  const f = await fixture(t, {}, {}, { seeds: { [LIVE_ROW]: { [CHAT]: { history: [], markers: seeded } } } })
  f.start()
  f.assistant(BASELINE)
  await f.evaluate()
  assert.equal(f.tables.get(LIVE_ROW).get(CHAT).markers.length, 50)
  assert.equal(f.tables.get(LIVE_ROW).get(CHAT).markers[0].at, 1)
  splice(f, f.injected[0])
  const markers = f.tables.get(LIVE_ROW).get(CHAT).markers
  assert.equal(markers.length, 50)
  assert.equal(markers[0].at, 2, 'the oldest marker was not dropped')
  assert.equal(markers.at(-1).kind, 'reminder')
})

test('pin: the bypass register is honoured when the global and the chat switch are both on', opts, async (t) => {
  const f = await fixture(t, { escalationBypass: true }, {}, { seeds: { [CONTEXT]: { [CHAT]: { escalationBypass: true } } } })
  f.start()
  f.assistant(BASELINE)
  for (let i = 0; i < 10; i += 1) await f.evaluate()
  assert.equal(f.questions.length, 0)
  assert.deepEqual(f.injected.map((message) => message.source.form), Array(10).fill('reminder'))
  assert.deepEqual(f.injected.map((message) => message.source.attempt), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(f.injected.slice(0, 9).map(textOf), Array(9).fill(FIRST_DRIFT_MESSAGE))
  assert.equal(textOf(f.injected[9]), secondDriftReminder({ plan: PLAN, amendments: [] }))
  const entries = [...f.tables.get(REGISTER).values()].sort((a, b) => a.drift - b.drift)
  assert.deepEqual(entries.map((entry) => [entry.id, entry.turn, entry.drift, entry.sent]),
    Array.from({ length: 10 }, (_, i) => [CHAT, 1, i + 1, i === 9 ? 'full' : 'first']))
  const s = await f.status()
  assert.deepEqual(s.mentor.reminders.map((item) => item.attempt), [5, 6, 7, 8, 9, 10], 'status keeps only the latest six')
  assert.equal(s.mentor.escalation, undefined)
  assert.equal(s.mentor.resetDecision, undefined)
})

test('pin: bypass needs BOTH switches; the chat switch alone still escalates on the third drift', opts, async (t) => {
  const f = await fixture(t, { escalationBypass: false }, {}, { seeds: { [CONTEXT]: { [CHAT]: { escalationBypass: true } } } })
  f.start()
  f.assistant(BASELINE)
  await f.evaluate(); await f.evaluate(); await f.evaluate()
  assert.deepEqual(f.injected.map((message) => message.source.form), ['reminder', 'reminder', 'escalation'])
  assert.equal(f.questions.length, 1)
  const entries = [...f.tables.get(REGISTER).values()].sort((a, b) => a.drift - b.drift)
  assert.deepEqual(entries.map((entry) => [entry.drift, entry.sent]), [[1, 'first'], [2, 'full']])
})

test('pin: the older qdev-soup/signal event carries the monitor signal, once per calculation, before Mentor acts', opts, async (t) => {
  const f = await fixture(t)
  const order = []
  const signals = []
  f.ctx.on(SIGNAL, (signal) => { signals.push(signal); order.push('signal') })
  f.ctx.on('qdev-soup/drift-evidence/v1', () => { order.push('drift-evidence') })
  f.ctx.on('qdev-soup/intervention-evidence/v1', () => { order.push('intervention-evidence') })
  const realInject = f.agent.inject
  f.agent.inject = (message) => { order.push('inbox'); realInject(message) }
  f.start()
  f.assistant(BASELINE)
  const s = await f.evaluate()
  await f.until(() => order.includes('intervention-evidence'), 'intervention evidence never published')
  assert.equal(signals.length, 1)
  const signal = signals[0]
  assert.deepEqual(Object.keys(signal).sort(), ['at', 'driftDetected', 'klDivergence', 'nLive', 'nReference', 'sessionId', 'singleTurn', 'threshold', 'turn'])
  assert.equal(signal.sessionId, CHAT)
  assert.equal(signal.turn, 1)
  assert.equal(signal.driftDetected, true)
  assert.equal(signal.klDivergence, s.detector.lastResult.klDivergence)
  assert.equal(signal.threshold, 0.2)
  assert.equal(signal.singleTurn, s.detector.lastResult.singleTurn)
  assert.equal(typeof signal.at, 'number')
  // The order in which the Host's consumers acted on one drift (observed on the pre-refactor code).
  assert.deepEqual(order, ['signal', 'drift-evidence', 'inbox', 'intervention-evidence'])
})

// Not run: this is the claim the tests above deliberately do NOT make. Shown as skipped so it stays visible.
test('end-to-end: a real Harness agent receives a Mentor reminder and the chat shows it', { skip: 'NOT-PROVEN: needs a live Harness agent loop with a model; no real-agent test exists in this suite' }, () => {})
