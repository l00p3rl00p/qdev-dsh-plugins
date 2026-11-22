// Shared real-Host fixture for the A/B/C decision tests. Copied from host-config.test.mjs (which stays untouched):
// real Cordis, Loader, Session, built dist/index.js and SOUP worker; only external Host services are supplied.
//
// WHAT THIS FIXTURE IS NOT: it has no real Harness agent. The `agent` below is a recording stand-in: its inject()
// only appends the message to `injected`, and tests that need a splice confirmation emit the
// `agent/inbox/spliced` session event by hand. So a test using this fixture can prove what the real Host hands to
// the agent boundary and how it does its own bookkeeping, but it can NOT prove that a real agent received,
// queued, spliced or displayed a message. That end-to-end delivery is NOT-PROVEN here (it needs a live Harness).
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'

// Cordis's FiberState is a TypeScript const enum, erased from JavaScript exports.
const ACTIVE = 2
const HOST_URL = new URL('../dist/index.js', import.meta.url)
// Configured interpreter only: the worker needs an interpreter that has soup-cli, not whatever python3 is on PATH.
// No machine-specific fallback: tests using this fixture pass `opts` (proof-helpers.mjs) and skip visibly without
// SOUP_PYTHON; a caller that reaches fixture() without it gets an explicit, actionable error instead.
const PYTHON = process.env.SOUP_PYTHON
const STATUS_PATH = '/qdev-soup-drift/status'
export const BASELINE = 'keep following the original implementation plan'
export const DRIFT = 'different unrelated output topic'

// Only external Host services are substituted. Config validation, Volatile refs,
// fiber-scoped dispatch, Loader create/update, Host and SOUP workers are real.
// WHY the 4th argument (additive, defaults unchanged): the Mentor delivery pinning tests need to read the rows the Host
// wrote (live markers, bypass register), seed rows it reads at mount (per-chat Mentor context, live history), and run
// without the optional userQuestions service. Every existing caller passes three or fewer arguments and is unaffected.
export async function fixture(t, config = {}, saved = {}, { seeds = {}, userQuestions = true } = {}) {
  if (!PYTHON) throw new Error('SOUP_PYTHON must name an interpreter that has soup_cli; set it (or skip this test with `opts` from proof-helpers.mjs)')
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    assert.equal(routes.size, 0, 'native teardown leaked the Host route')
    assert.equal(calls.close, calls.open, 'native teardown leaked the storage domain')
    assert.equal(calls.unregister, calls.register)
  })
  const session = Session.create('synthetic-soup-loader-chat')
  const injected = []
  // Recording stand-in, NOT a Harness agent (see the header): inject() only records what the Host handed over.
  const agent = { id: session.id, session, inject(message) { injected.push(message) } }
  const live = new Map([[agent.id, agent]])
  const values = new Map(Object.entries(saved))
  const writes = []
  const routes = new Map()
  const questions = []
  const calls = { open: 0, close: 0, register: 0, unregister: 0 }
  const tables = new Map()
  ctx.provide('agents', { list: () => [...live.values()], get: (id) => live.get(String(id)) })
  ctx.provide('storageDomain', {
    async open(spec) {
      calls.open += 1
      const records = spec.name === 'qdev_soup_drift_state' ? values : new Map(Object.entries(seeds[spec.name] ?? {}))
      tables.set(spec.name, records)
      return {
        table(name) {
          assert.equal(name, spec.name === 'qdev_soup_register' ? 'entries' : 'sessions')
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
  if (userQuestions) ctx.provide('userQuestions', {
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
  // WHY effectiveConfig: Cordis 4.1 (DSH 0.2.2) made fiber.config the RAW input and moved the object the plugin
  // receives (volatile references) to fiber.effectiveConfig; Cordis 4.0.5 (DSH 0.2.1) has only fiber.config.
  // Same assertion (reference identity survives a volatile save), now valid on both.
  const refs = { ...(fiber.effectiveConfig ?? fiber.config) }
  const volatileEvents = []
  const rootEvents = []
  ctx.on('loader/volatile-update', (paths) => rootEvents.push(paths))
  fiber.ctx.on('loader/volatile-update', (paths) => {
    volatileEvents.push({ paths, values: Object.fromEntries(
      Object.entries((fiber.effectiveConfig ?? fiber.config)).map(([key, value]) => [key, value?.get ? value.get() : value]),
    ) })
  })
  // WHY ctx equality: Cordis 4.1 returns a different Fiber object from ctx.fiber than from entry.fiber (same uid),
  // so "hook.ctx.fiber === fiber" counted 0; the owning Context (fiber.ctx) is identical on 4.0.5 and 4.1.
  const hooks = () => Object.fromEntries(['agent/created', 'agent/disposed', 'session/event']
    .map((name) => [name, (ctx.events._hooks[name] ?? []).filter((hook) => hook.ctx === fiber.ctx).length]))
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
      assert.equal((fiber.effectiveConfig ?? fiber.config)[key], ref, `configuration reference replaced: ${key}`)
    }
    assert.equal((await status()).lifecycle.startedAt, startedAt, 'Host remounted inside the same fiber')
    assert.equal(calls.open, 5)
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
  return { ctx, agent, live, session, injected, questions, writes, values, calls, entry, fiber, tables,
    request, status, update, append, start, assistant, until, evaluate, volatileEvents }
}
