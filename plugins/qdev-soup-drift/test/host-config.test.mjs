import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'

// Cordis's FiberState is a TypeScript const enum, erased from JavaScript exports.
const ACTIVE = 2
const HOST_URL = new URL('../dist/index.js', import.meta.url)
const PYTHON = process.env.SOUP_PYTHON || 'python3'
const STATUS_PATH = '/qdev-soup-drift/status'
const BASELINE = 'keep following the original implementation plan'
const DRIFT = 'different unrelated output topic'

// Only external Host services are substituted. Config validation, Volatile refs,
// fiber-scoped dispatch, Loader create/update, Host and SOUP workers are real.
async function fixture(t, config = {}, saved = {}) {
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    assert.equal(routes.size, 0, 'native teardown leaked the Host route')
    assert.equal(calls.close, calls.open, 'native teardown leaked the storage domain')
    assert.equal(calls.unregister, calls.register)
  })
  const session = Session.create('synthetic-soup-loader-chat')
  const injected = []
  const agent = { id: session.id, session, inject(message) { injected.push(message) } }
  const live = new Map([[agent.id, agent]])
  const values = new Map(Object.entries(saved))
  const writes = []
  const routes = new Map()
  const questions = []
  const calls = { open: 0, close: 0, register: 0, unregister: 0 }
  ctx.provide('agents', { list: () => [...live.values()] })
  ctx.provide('storageDomain', {
    async open(spec) {
      calls.open += 1
      const records = spec.name === 'qdev_soup_drift_state' ? values : new Map()
      return {
        table(name) {
          assert.equal(name, 'sessions')
          return {
            entries: () => records.entries(),
            get: id => records.get(id),
            async put(id, value) {
              if (spec.name === 'qdev_soup_drift_state') writes.push({ id, value: structuredClone(value) })
              records.set(id, structuredClone(value))
            },
          }
        },
        async close() { calls.close += 1 },
      }
    },
  })
  ctx.provide('webServer', {
    register(route) {
      assert.equal(routes.has(route.path), false, 'Host registered a duplicate route')
      routes.set(route.path, route)
      calls.register += 1
      return () => { calls.unregister += 1; routes.delete(route.path) }
    },
  })
  ctx.provide('userQuestions', {
    ask(request) {
      // A manually settled answer deliberately permits a reply after abort. The
      // Host must guard stale continuations as well as cancelling native asks.
      return new Promise((resolve, reject) => questions.push({ request, resolve, reject }))
    },
  })
  await ctx.plugin(Loader, { baseUrl: HOST_URL.href })
  const loader = ctx.loader
  let raw = {
    python: PYTHON, enabled: true, detectorEnabled: true, reanchoring: true,
    preset: 2, baselineCount: 1, windowCount: 1, ...config,
  }
  const id = await loader.create({ id: 'soup-under-test', name: HOST_URL.href, config: raw })
  await loader.await()
  const entry = loader.resolve(id)
  await entry.fiber.await()
  assert.equal(entry.fiber.state, ACTIVE)
  assert.ok(routes.has(STATUS_PATH), 'built Host did not mount')
  const fiber = entry.fiber
  const refs = { ...fiber.config }
  const volatileEvents = []
  const rootEvents = []
  ctx.on('loader/volatile-update', (paths) => rootEvents.push(paths))
  fiber.ctx.on('loader/volatile-update', (paths) => {
    volatileEvents.push({ paths, values: Object.fromEntries(
      Object.entries(fiber.config).map(([key, value]) => [key, value?.get ? value.get() : value]),
    ) })
  })
  const hooks = () => Object.fromEntries(['agent/created', 'agent/disposed', 'session/event']
    .map((name) => [name, (ctx.events._hooks[name] ?? []).filter((hook) => hook.ctx.fiber === fiber).length]))
  const initialHooks = hooks()
  assert.deepEqual(initialHooks, { 'agent/created': 1, 'agent/disposed': 1, 'session/event': 1 })

  async function request(method = 'GET', body) {
    const route = routes.get(STATUS_PATH)
    assert.ok(route, 'Host route was unexpectedly disposed')
    const payload = body === undefined ? '' : JSON.stringify(body)
    const req = {
      method,
      headers: { 'x-qdev-soup-action': 'reset-drift-count' },
      async *[Symbol.asyncIterator]() { if (payload) yield payload },
    }
    let text
    const response = { statusCode: 0, setHeader() {}, end(value) { text = value } }
    await route.handler(req, response)
    return { code: response.statusCode, body: JSON.parse(text) }
  }
  const status = async () => {
    const response = await request()
    assert.equal(response.code, 200)
    assert.deepEqual(response.body.errors, [], 'Host must not silently contain configuration errors')
    return response.body
  }
  const startedAt = (await status()).lifecycle.startedAt
  async function update(patch) {
    raw = { ...raw, ...patch }
    await loader.update(id, { config: raw })
    await loader.await()
    assert.equal(entry.fiber, fiber, 'volatile save replaced the native fiber')
    assert.equal(fiber.state, ACTIVE)
    for (const [key, ref] of Object.entries(refs)) {
      assert.equal(fiber.config[key], ref, `configuration reference replaced: ${key}`)
    }
    assert.equal((await status()).lifecycle.startedAt, startedAt, 'Host remounted inside the same fiber')
    assert.equal(calls.open, 2)
    assert.equal(calls.close, 0)
    assert.equal(calls.register, 1)
    assert.equal(calls.unregister, 0)
    assert.deepEqual(hooks(), initialHooks, 'save multiplied native event subscriptions')
    assert.deepEqual(rootEvents, [], 'Loader volatile notification escaped its owning fiber')
  }
  function append(type, data) {
    const event = ['user/message', 'assistant/message'].includes(type)
      ? session.append(type, data, { surfaceOp: 'append' })
      : session.append(type, data)
    ctx.emit('session/event', session, event)
    return event
  }
  const start = (turn = 1) => {
    append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Implement the original plan, without unrelated work.' }] }))
    append('turn/start', { turn })
  }
  let step = 0
  const assistant = (text = DRIFT, turn = 1) => append('assistant/message', {
    turn, step: ++step,
    message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text }] }),
    stream: [],
  })
  async function until(predicate, message) {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const current = await status()
      if (predicate(current)) return current
      await delay(20)
    }
    assert.fail(`${message}: ${JSON.stringify(await status())}`)
  }
  async function evaluate(count = 1, turn = 1) {
    const before = (await status()).detector.evaluations
    for (let i = 0; i < count; i += 1) assistant(DRIFT, turn)
    return until((s) => s.detector.evaluations === before + 1, 'real SOUP worker did not finish exactly one window')
  }
  return { ctx, agent, live, session, injected, questions, writes, values, calls, entry, fiber,
    request, status, update, append, start, assistant, until, evaluate, volatileEvents }
}

test('native Loader commits master/count/threshold saves into the mounted Host and real worker', async (t) => {
  const f = await fixture(t, { enabled: false, baselineCount: 2, windowCount: 2 })
  f.start()
  f.assistant(BASELINE)
  let s = await f.status()
  assert.equal(s.trajectory.state, 'disabled')
  assert.equal(s.trajectory.sessionEvents, 0)
  assert.equal(s.trajectory.assistantMessages, 0)
  assert.equal(s.detector.evaluations, 0)
  assert.equal(f.writes.length, 0)
  await f.update({ enabled: true, preset: 0 })
  s = await f.status()
  assert.equal(s.configuration.enabled, true)
  assert.equal(s.configuration.threshold, 0.05)
  assert.equal(s.configuration.baselineCount, 2)
  assert.equal(s.configuration.windowCount, 2)
  assert.equal(s.trajectory.baselineTarget, 2)
  assert.equal(s.trajectory.windowTarget, 2)
  assert.equal(s.trajectory.baselineSize, 0, 'ON activated an idle chat before its next event')
  f.assistant(BASELINE)
  f.assistant()
  s = await f.status()
  assert.equal(s.trajectory.baselineSize, 2)
  assert.equal(s.trajectory.windowSize, 1)
  assert.equal(s.detector.evaluations, 0, 'new live window size was ignored')
  s = await f.evaluate()
  assert.equal(s.detector.lastResult.threshold, 0.05, 'worker used stale threshold')
  assert.equal(s.detector.lastResult.driftDetected, true)
  assert.equal(f.injected.length, 1)

  await f.update({ preset: 4, baselineCount: 3, windowCount: 1 })
  s = await f.status()
  assert.equal(s.configuration.threshold, 0.4)
  assert.equal(s.configuration.baselineCount, 3)
  assert.equal(s.configuration.windowCount, 1)
  assert.equal(s.trajectory.baselineSize, 3, 'replacement detector did not seed the saved baseline count')
  assert.equal(s.trajectory.baselineTarget, 3)
  assert.equal(s.trajectory.windowTarget, 1)
  s = await f.evaluate()
  assert.equal(s.detector.lastResult.threshold, 0.4)
  assert.equal(f.injected.length, 2)
  assert.equal(f.injected[1].source.attempt, 2, 'saving detector settings erased this turn\'s first strike')
  const changed = f.volatileEvents.at(-1)
  assert.deepEqual(changed.paths.map((path) => path.join('.')).sort(), ['baselineCount', 'preset', 'windowCount'])
  assert.equal(changed.values.preset, 4)
  assert.equal(changed.values.baselineCount, 3)
  assert.equal(changed.values.windowCount, 1)
  const count = f.volatileEvents.length
  await f.update({ preset: 4, baselineCount: 3, windowCount: 1 })
  assert.equal(f.volatileEvents.length, count, 'no-op save emitted a change')
  const before = (await f.status()).trajectory.sessionEvents
  f.assistant('', 1)
  assert.equal((await f.status()).trajectory.sessionEvents, before + 1, 'one event was counted more than once')
})

for (const completion of ['late answer', 'late rejection']) {
test(`master OFF cancels intervention and preserves three-count guard on ON (${completion})`, async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  await f.evaluate()
  await f.evaluate()
  let s = await f.evaluate()
  assert.equal(s.detector.drifts, 3)
  assert.equal(f.injected.length, 3, 'expected two reminders and one escalation')
  assert.deepEqual(f.injected.map((message) => message.source.form), ['reminder', 'reminder', 'escalation'])
  assert.equal(f.questions.length, 1)
  const pending = f.questions[0]
  assert.equal(pending.request.signal.aborted, false)
  assert.equal(s.mentor.driftCount, 3)
  assert.equal(s.mentor.carriedDrifts, 3)
  assert.equal(s.mentor.resetDecision.required, true)

  await f.update({ enabled: false })
  assert.equal(pending.request.signal.aborted, true, 'OFF did not cancel the live native question')
  const disabled = await f.status()
  assert.equal(disabled.mentor.escalation.state, 'failed', 'cancelled escalation still appears pending')
  const writes = f.writes.length
  const injections = f.injected.length
  f.assistant()
  f.append('turn/start', { turn: 2 })
  f.assistant(DRIFT, 2)
  const rejected = await f.request('POST', { action: 'reset-drift-count', sessionId: f.session.id, reset: true })
  assert.equal(rejected.code, 409)
  assert.equal(rejected.body.ok, false)
  assert.equal(rejected.body.error, 'soup-disabled')
  s = await f.status()
  assert.deepEqual(s.trajectory, disabled.trajectory, 'OFF still observed native session events')
  assert.equal(s.detector.state, 'disabled')
  assert.equal(s.mentor.state, 'disabled')
  assert.equal(s.detector.evaluations, disabled.detector.evaluations)
  assert.equal(f.writes.length, writes, 'OFF wrote mentor state')
  assert.equal(f.injected.length, injections, 'OFF delivered an intervention')

  await f.update({ enabled: true })
  if (completion === 'late answer') {
    pending.resolve({ answers: [
      { id: 'trajectory-clarification', selected: [], custom: 'Late reply must not be delivered.' },
      { id: 'reset-drift-count', selected: ['Yes — reset to 0'] },
    ] })
  } else {
    pending.reject(new Error('Synthetic answerer finished cancellation after ON'))
  }
  await delay(0)
  s = await f.status()
  assert.equal(f.injected.length, injections, 'an aborted answer became active again after ON')
  assert.equal(f.writes.length, writes, 'an aborted answer reset the count after ON')
  assert.equal(s.mentor.carriedDrifts, 3)
  assert.equal(s.mentor.resetDecision.required, true)
  await f.evaluate(1, 2)
  assert.equal(f.injected.length, injections, 'pending reset decision gained a new reminder allowance')
  assert.equal(f.questions.length, 1)
  const reset = await f.request('POST', { action: 'reset-drift-count', sessionId: f.session.id, reset: true })
  assert.equal(reset.code, 200)
  assert.equal(reset.body.result.carry, 0)
  s = await f.evaluate(1, 2)
  assert.equal(f.injected.length, injections + 1, 'ON did not restore intervention after an explicit human reset')
  assert.equal(f.injected.at(-1).source.attempt, 1)
  assert.equal(s.detector.drifts, 5)
  assert.equal(s.trajectory.sessionEvents, disabled.trajectory.sessionEvents + 2, 'ON multiplied event subscriptions')
})
}

test('master OFF invalidates an in-flight real SOUP worker across immediate OFF/ON saves', async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  f.assistant()
  assert.equal((await f.status()).detector.state, 'running')
  await f.update({ enabled: false })
  const disabled = await f.status()
  assert.equal(disabled.detector.state, 'disabled')
  await f.update({ enabled: true, preset: 1 })
  const s = await f.evaluate()
  assert.equal(s.detector.lastResult.threshold, 0.1)
  // The killed process may close after its replacement; neither its result nor
  // its final observation may mutate the new detector or mentor generation.
  await delay(100)
  const settled = await f.status()
  assert.equal(settled.detector.evaluations, 1)
  assert.equal(settled.detector.drifts, 1)
  assert.equal(settled.detector.state, 'idle')
  assert.equal(f.injected.length, 1)
  assert.equal(f.injected[0].source.attempt, 1)
  assert.equal(f.questions.length, 0)
})

test('all five sensitivity positions reach the real SOUP worker and fixture settings restore', async (t) => {
  const f = await fixture(t, { reanchoring: false })
  const original = (await f.status()).configuration
  f.start()
  f.assistant(BASELINE)
  const thresholds = [0.05, 0.1, 0.2, 0.3, 0.4]
  for (const [preset, threshold] of thresholds.entries()) {
    await f.update({ preset })
    const s = await f.evaluate()
    assert.equal(f.fiber.config.preset.get(), preset)
    assert.equal(s.configuration.preset, preset)
    assert.equal(s.configuration.threshold, threshold)
    assert.equal(s.detector.lastResult.threshold, threshold, `preset ${preset} did not reach Python`)
    assert.equal(s.detector.lastResult.driftDetected, true)
    assert.equal(f.injected.length, 0)
  }
  await f.update({ preset: original.preset })
  assert.deepEqual((await f.status()).configuration, original)
})

test('detector OFF pauses calculations, not session observation; ON resumes without extra strikes or subscriptions', async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  await f.evaluate()
  assert.equal(f.injected[0].source.attempt, 1)
  await f.update({ detectorEnabled: false })
  const paused = await f.status()
  assert.equal(paused.configuration.enabled, true)
  assert.equal(paused.configuration.detectorEnabled, false)
  assert.equal(paused.detector.state, 'disabled')
  for (let i = 0; i < 6; i += 1) f.assistant()
  await delay(100)
  let s = await f.status()
  assert.equal(s.trajectory.sessionEvents, paused.trajectory.sessionEvents + 6)
  assert.equal(s.trajectory.assistantMessages, paused.trajectory.assistantMessages + 6)
  assert.equal(s.detector.evaluations, paused.detector.evaluations)
  assert.equal(s.detector.drifts, paused.detector.drifts)
  assert.deepEqual(s.detector.lastResult, paused.detector.lastResult)
  assert.equal(f.injected.length, 1)
  assert.equal(f.questions.length, 0)
  await f.update({ detectorEnabled: true })
  s = await f.evaluate()
  assert.equal(s.configuration.detectorEnabled, true)
  assert.equal(s.detector.state, 'idle')
  assert.equal(s.detector.evaluations, paused.detector.evaluations + 1)
  assert.equal(f.injected.length, 2)
  assert.equal(f.injected.at(-1).source.attempt, 2, 'detector toggle reset mentor allowance')
  assert.equal(s.trajectory.sessionEvents, paused.trajectory.sessionEvents + 7)
})

test('global reanchoring OFF records real detections without interventions; ON retains the two-reminder guard', async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  await f.evaluate()
  await f.update({ reanchoring: false })
  const paused = await f.status()
  assert.equal(paused.configuration.reanchoring, false)
  assert.equal(paused.mentor.state, 'disabled')
  await f.evaluate()
  let s = await f.evaluate()
  assert.equal(s.trajectory.sessionEvents, paused.trajectory.sessionEvents + 2)
  assert.equal(s.detector.evaluations, paused.detector.evaluations + 2)
  assert.equal(s.detector.drifts, paused.detector.drifts + 2)
  assert.equal(s.detector.lastResult.driftDetected, true)
  assert.equal(f.injected.length, 1, 'reanchoring OFF still injected a reminder')
  assert.equal(f.questions.length, 0)
  await f.update({ reanchoring: true })
  s = await f.evaluate()
  assert.equal(s.configuration.reanchoring, true)
  assert.equal(f.injected.length, 2)
  assert.equal(f.injected.at(-1).source.attempt, 2, 'reanchoring toggle reset mentor allowance')
  s = await f.evaluate()
  assert.equal(s.mentor.driftCount, 3)
  assert.equal(s.mentor.resetDecision.required, true)
  assert.equal(f.injected.at(-1).source.form, 'escalation')
  assert.equal(f.questions.length, 1)
})

for (const reset of [true, false]) {
  test(`reset ${reset ? 'Yes' : 'No'} writes durable accountability state and controls the next turn`, async (t) => {
    const id = 'synthetic-soup-loader-chat'
    const f = await fixture(t, {}, { [id]: { carry: 3, decisionPending: true } })
    f.start()
    f.assistant(BASELINE)
    const response = await f.request('POST', { action: 'reset-drift-count', sessionId: id, reset })
    assert.equal(response.code, 200)
    assert.equal(response.body.ok, true)
    assert.equal(response.body.result.reset, reset)
    const carry = reset ? 0 : 3
    assert.equal(response.body.result.carry, carry)
    assert.deepEqual(f.values.get(id), { carry, decisionPending: false })
    assert.deepEqual(f.writes.at(-1), { id, value: { carry, decisionPending: false } })
    const savedWrites = f.writes.length
    const duplicate = await f.request('POST', { action: 'reset-drift-count', sessionId: id, reset })
    assert.equal(duplicate.code, 409)
    assert.equal(duplicate.body.result.reason, 'no-pending-decision')
    assert.equal(f.writes.length, savedWrites, 'duplicate decision rewrote durable state')
    const decided = await f.status()
    assert.equal(decided.mentor.carriedDrifts, carry)
    assert.equal(decided.mentor.resetDecision, undefined)
    f.append('turn/start', { turn: 2 })
    const s = await f.evaluate(1, 2)
    assert.equal(f.injected.length, 1)
    if (reset) {
      assert.equal(f.injected[0].source.form, 'reminder')
      assert.equal(f.injected[0].source.attempt, 1)
      assert.equal(f.questions.length, 0)
    } else {
      assert.equal(f.injected[0].source.form, 'escalation')
      assert.equal(f.questions.length, 1, 'No granted a fresh reminder allowance')
      assert.equal(s.mentor.driftCount, 4)
      assert.equal(s.mentor.carriedDrifts, 4)
      assert.deepEqual(f.values.get(id), { carry: 4, decisionPending: true })
    }
  })
}

test('baseline/window valid bounds affect actual worker batching and restore to the original settings', async (t) => {
  const f = await fixture(t, { reanchoring: false })
  const original = (await f.status()).configuration
  f.start()
  await f.update({ baselineCount: 100, windowCount: 100 })
  for (let i = 0; i < 99; i += 1) f.assistant(BASELINE)
  let s = await f.status()
  assert.equal(s.trajectory.baselineSize, 99)
  assert.equal(s.trajectory.windowSize, 0)
  assert.equal(s.detector.evaluations, 0)
  f.assistant(BASELINE)
  for (let i = 0; i < 99; i += 1) f.assistant()
  s = await f.status()
  assert.equal(s.configuration.baselineCount, 100)
  assert.equal(s.configuration.windowCount, 100)
  assert.equal(s.trajectory.baselineSize, 100)
  assert.equal(s.trajectory.windowSize, 99)
  assert.equal(s.detector.evaluations, 0, 'upper bound did not control batching')
  s = await f.evaluate()
  assert.equal(s.detector.lastResult.driftDetected, true)
  assert.equal(s.trajectory.windowSize, 0)
  await f.update({ baselineCount: 1, windowCount: 1 })
  s = await f.evaluate()
  assert.equal(s.trajectory.baselineSize, 1)
  assert.equal(s.trajectory.baselineTarget, 1)
  assert.equal(s.trajectory.windowTarget, 1)
  assert.equal(s.detector.evaluations, 2)
  assert.deepEqual(s.configuration, original)
})

test('invalid native volatile candidates retain prior effective references and running configuration atomically', async (t) => {
  const f = await fixture(t)
  f.start()
  f.assistant(BASELINE)
  const good = { enabled: true, detectorEnabled: true, reanchoring: true, preset: 2, baselineCount: 1, windowCount: 1 }
  const invalid = [
    { baselineCount: 0 }, { baselineCount: 101 }, { windowCount: 0 }, { windowCount: 101 },
    { baselineCount: 1.5 }, { windowCount: 2.5 }, { preset: 1.5 },
    { baselineCount: '4' }, { windowCount: '4' }, { preset: -1 }, { preset: 5 }, { preset: '2' },
    { enabled: 'false' }, { detectorEnabled: 'false' }, { reanchoring: 'false' },
    { enabled: false, baselineCount: 0 },
  ]
  for (const candidate of invalid) {
    const before = await f.status()
    const commits = f.volatileEvents.length
    await f.update(candidate)
    assert.deepEqual((await f.status()).configuration, before.configuration, `invalid candidate became effective: ${JSON.stringify(candidate)}`)
    assert.equal(f.volatileEvents.length, commits, 'invalid candidate dispatched a runtime update')
    for (const [key, value] of Object.entries(good)) assert.equal(f.fiber.config[key].get(), value)
    await f.update(good)
  }
  const s = await f.evaluate()
  assert.equal(s.detector.lastResult.threshold, 0.2, 'invalid saved candidates damaged the running detector')
  assert.equal(f.injected[0].source.attempt, 1)
})
