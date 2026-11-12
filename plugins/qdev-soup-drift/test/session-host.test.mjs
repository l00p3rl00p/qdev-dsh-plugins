import assert from 'node:assert/strict'
import { mkdtemp, realpath, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'

// Resolve the native hub through its declared consumer, not a hard-coded pnpm path.
const require = createRequire(import.meta.url)
const storageRequire = createRequire(require.resolve('@deepseek-ai/dsh-storage-domain'))
const { default: Storage } = await import(storageRequire.resolve('@deepseek-ai/dsh-storage'))
const HOST_URL = new URL('../dist/index.js', import.meta.url)
const PYTHON = process.env.SOUP_PYTHON || 'python3'
const API_PATH = '/api/qdev-soup/session-settings'
const STATUS_PATH = '/qdev-soup-drift/status'
const A = 'soup_feature2_A'
const B = 'soup_feature2_B'
const COLD = 'soup_feature2_cold'
const BASELINE = 'keep following the original implementation plan'
const DRIFT = 'different unrelated output topic'
const FIELDS = ['python', 'enabled', 'detectorEnabled', 'reanchoring', 'preset', 'baselineCount', 'windowCount']
const rootClosers = new Map()

async function temporaryRoot(t) {
  const parent = await realpath(tmpdir())
  const prefix = 'soup-feature2-native-'
  const created = await mkdtemp(join(parent, prefix))
  const exact = await realpath(created)
  assert.equal(exact, resolve(created))
  rootClosers.set(exact, [])
  t.after(async () => {
    // Explicitly close every context before deleting, independent of hook order.
    for (const close of rootClosers.get(exact).toReversed()) await close()
    rootClosers.delete(exact)
    // Never delete a computed/unverified path: require the exact mkdtemp result,
    // canonical parent, expected basename and unchanged realpath immediately before rm.
    assert.equal(resolve(created), exact)
    assert.equal(dirname(exact), parent)
    assert.ok(basename(exact).startsWith(prefix))
    assert.notEqual(basename(exact), prefix)
    assert.equal(await realpath(created), exact)
    await rm(exact, { recursive: true, force: false })
    await assert.rejects(stat(exact), { code: 'ENOENT' })
  })
  return exact
}

// Real Cordis, Loader, Session, native Connection registry/owner Peer and native
// storage hub/domain/JSON backend. Only external agents, BrowserAuth, questions,
// HTTP carrier and session existence metadata are substituted. No profile state,
// network listeners, credentials, model activation or stored transcript reads.
async function fixture(t, { root, config = {}, liveIds = [A, B], optional = true, mountHost = true } = {}) {
  root ??= await temporaryRoot(t)
  const ctx = new Context()
  const routes = new Map()
  const injected = []
  const questions = []
  const metadataReads = []
  const agentListReads = []
  const snapshotReads = []
  const changes = []
  const sessions = new Map(liveIds.map((id) => [id, Session.create(id)]))
  for (const [id, session] of sessions) {
    const snapshotEvents = session.snapshotEvents.bind(session)
    session.snapshotEvents = () => { snapshotReads.push(id); return snapshotEvents() }
  }
  const live = new Map([...sessions].map(([id, session]) => [id, {
    id, session, inject(message) { injected.push({ id, message }) },
  }]))
  const coldHeader = Session.create(COLD).header
  let disposed = false
  let connection, outsider, backend, facility, storage
  async function close() {
    if (disposed) return
    disposed = true
    await ctx.fiber.dispose()
    assert.equal(routes.size, 0, 'Host leaked an HTTP route')
    assert.equal(backend.open.size, 0, 'Host/native facility leaked an open JSON unit')
    assert.equal(backend.opening.size, 0, 'native backend left an opening unit')
    assert.equal(backend.closed, true)
    assert.deepEqual(storage.backend.names(), [], 'native backend registration leaked')
    for (const change of changes) assert.equal(facility.get(change.domain), undefined, 'domain was not released')
    if (connection) {
      assert.equal(connection.browserPeer.signal.aborted, true)
      assert.equal(outsider.signal.aborted, true)
      const response = await connection.createSharedFetchHandler('/api').fetch(
        new Request(`http://localhost${API_PATH}?sessionId=${A}`), connection.browserPeer)
      assert.equal(response.status, 404, 'native exact Fetch route outlived its Host fiber')
    }
    for (const item of questions) {
      if (!item.settled) assert.equal(item.request.signal.aborted, true, 'pending question outlived its Host')
    }
    for (const name of ['agent/created', 'agent/disposed', 'session/event']) {
      assert.equal((ctx.events._hooks[name] ?? []).length, 0, `native listener leaked: ${name}`)
    }
  }
  assert.ok(rootClosers.has(root), 'fixture root must be an exact registered mkdtemp result')
  rootClosers.get(root).push(close)
  t.after(close)
  ctx.provide('agents', {
    list: () => { agentListReads.push(Date.now()); return [...live.values()] },
    get() { assert.fail('settings must not activate or resolve a model agent') },
    create() { assert.fail('settings must not create a model agent') },
  })
  ctx.provide('webServer', {
    host: '127.0.0.1', protocol: 'http:',
    register(route) {
      assert.equal(routes.has(route.path), false, 'duplicate HTTP route')
      routes.set(route.path, route)
      return () => { assert.equal(routes.delete(route.path), true) }
    },
  })
  ctx.provide('userQuestions', {
    ask(request) {
      // Deliberately permit completion after cancellation to test stale guards.
      return new Promise((resolve, reject) => {
        const item = { request, settled: false,
          resolve(answer) { item.settled = true; resolve(answer) },
          reject(error) { item.settled = true; reject(error) } }
        questions.push(item)
      })
    },
  })
  if (optional) {
    ctx.provide('sessionPersistence', {
      async stat(id) {
        metadataReads.push(id)
        return id === COLD ? { header: coldHeader, revision: 'synthetic-metadata', eventCount: 0 } : undefined
      },
      open() { assert.fail('settings must not read a stored transcript') },
      list() { assert.fail('settings must not enumerate real sessions') },
      create() { assert.fail('settings must not create stored sessions') },
    })
    // BrowserAuth is external. It admits only an explicit synthetic request marker,
    // never reads credentials, and does not open sockets. Connection itself is real.
    connection = new HostConnectionService(ctx, [], {
      isAuthenticated(request) { return request.headers.get('x-synthetic-owner') === 'yes' },
      authenticateApi() { return undefined },
    })
    outsider = connection.createPeer({ principal: { kind: 'agent', id: 'synthetic-nonowner' } })
  }
  await ctx.plugin(Storage)
  storage = ctx.storage
  await ctx.plugin(StorageJson, { root })
  backend = storage.backend.get('json')
  await ctx.plugin(StorageDomain, { backend: 'json' })
  facility = ctx.storageDomain
  ctx.on('domain/changed', (change) => changes.push(structuredClone(change)))
  let raw = { python: PYTHON, enabled: true, detectorEnabled: true, reanchoring: true,
    preset: 2, baselineCount: 1, windowCount: 1, ...config }
  let entry, fiber, loader
  if (mountHost) {
    await ctx.plugin(Loader, { baseUrl: HOST_URL.href })
    loader = ctx.loader
    await loader.create({ id: 'soup-feature2-test', name: HOST_URL.href, config: raw })
    await loader.await()
    entry = loader.resolve('soup-feature2-test')
    await entry.fiber.await()
    fiber = entry.fiber
    assert.equal(fiber.state, 2, 'real Loader did not activate built Host')
    assert.ok(routes.has(STATUS_PATH), 'built Host status route missing')
  }
  async function api({ method = 'GET', sessionId = A, body, auth = 'owner', headers = {}, rawBody } = {}) {
    assert.ok(connection, 'this fixture intentionally lacks optional Connection')
    const request = new Request(`http://localhost${API_PATH}${method === 'GET' ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`, {
      method,
      headers: { host: 'localhost', origin: 'http://localhost',
        ...(auth === 'owner' ? { 'x-synthetic-owner': 'yes' } : {}),
        ...(method === 'POST' ? { 'content-type': 'application/json', 'x-qdev-soup-action': 'session-settings' } : {}),
        ...headers },
      ...(method === 'POST' ? { body: rawBody ?? JSON.stringify(body) } : {}),
    })
    const admission = connection.admit(request)
    if (auth === 'anonymous') {
      assert.deepEqual(admission, { rejection: 401 })
      return { code: admission.rejection }
    }
    if (auth !== 'nonowner') assert.ok('peer' in admission, 'synthetic owner was not admitted')
    const response = await connection.createSharedFetchHandler('/api').fetch(request,
      auth === 'nonowner' ? outsider : admission.peer)
    const text = await response.text()
    return { code: response.status, headers: response.headers, text,
      body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : undefined }
  }
  async function settings(id = A) {
    const response = await api({ sessionId: id })
    assert.equal(response.code, 200, response.text)
    assert.equal(response.body.ok, true)
    return response.body.settings
  }
  async function mutate(id, field, value, op = 'set') {
    const before = await settings(id)
    const response = await api({ method: 'POST', body: { sessionId: id, expectedRevision: before.revision,
      op, field, ...(op === 'set' ? { value } : {}) } })
    assert.equal(response.code, 200, response.text)
    assert.equal(response.body.ok, true)
    return response.body.settings
  }
  async function status({ allowErrors = false } = {}) {
    const route = routes.get(STATUS_PATH)
    assert.ok(route)
    let text
    const response = { statusCode: 0, setHeader() {}, end(value) { text = value } }
    await route.handler({ method: 'GET', headers: {} }, response)
    assert.equal(response.statusCode, 200)
    const result = JSON.parse(text)
    if (!allowErrors) assert.deepEqual(result.errors, [], 'Host unexpectedly contained a runtime failure')
    return result
  }
  async function resetRequest({ auth = 'owner', body = { action: 'reset-drift-count', reset: true, sessionId: A } } = {}) {
    const route = routes.get(STATUS_PATH)
    assert.ok(route)
    const payload = JSON.stringify(body)
    const values = {
      host: 'localhost', origin: 'http://localhost',
      'x-qdev-soup-action': 'reset-drift-count',
      ...(auth === 'owner' ? { 'x-synthetic-owner': 'yes' } : {}),
    }
    const headers = {
      ...values,
      get(name) { return values[String(name).toLowerCase()] ?? null },
    }
    let text
    const response = { statusCode: 0, setHeader() {}, end(value) { text = value } }
    await route.handler({ method: 'POST', headers, async *[Symbol.asyncIterator]() { yield payload } }, response)
    return { code: response.statusCode, body: JSON.parse(text) }
  }
  async function update(patch) {
    raw = { ...raw, ...patch }
    await loader.update('soup-feature2-test', { config: raw })
    await loader.await()
    assert.equal(entry.fiber, fiber, 'volatile native settings save remounted Host')
    assert.equal(fiber.state, 2)
  }
  function append(id, type, data) {
    const session = sessions.get(id)
    assert.ok(session)
    const event = ['user/message', 'assistant/message'].includes(type)
      ? session.append(type, data, { surfaceOp: 'append' }) : session.append(type, data)
    ctx.emit('session/event', session, event)
    return event
  }
  async function replaceAgent(id, whileClosed = async () => {}) {
    const previous = live.get(id)
    assert.ok(previous, 'cannot replace an absent synthetic agent')
    live.delete(id)
    ctx.emit('agent/disposed', { agent: previous })
    await whileClosed(previous)
    const received = []
    const replacement = { id, session: previous.session, received,
      inject(message) { received.push(message); injected.push({ id, message }) } }
    live.set(id, replacement)
    ctx.emit('agent/created', { agent: replacement })
    return replacement
  }
  function start(id, turn = 1) {
    append(id, 'user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Implement the original plan, without unrelated work.' }] }))
    append(id, 'turn/start', { turn })
  }
  let step = 0
  function assistant(id, text = DRIFT, turn = 1) {
    return append(id, 'assistant/message', { turn, step: ++step,
      message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text }] }), stream: [] })
  }
  async function until(predicate, message, options) {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const current = await status(options)
      if (predicate(current)) return current
      await delay(20)
    }
    assert.fail(`${message}: ${JSON.stringify(await status(options))}`)
  }
  async function evaluate(id, count = 1, turn = 1) {
    const before = (await status()).detector.evaluations
    for (let i = 0; i < count; i += 1) assistant(id, DRIFT, turn)
    const s = await until((s) => s.detector.evaluations === before + 1, `real Python worker did not finish ${id}`)
    assert.equal(s.detector.lastResult.sessionId, id)
    return s
  }
  return { root, ctx, routes, live, sessions, injected, questions, metadataReads, agentListReads, snapshotReads, changes,
    connection, outsider, backend, facility, storage, entry, fiber, api, settings, mutate, status,
    resetRequest, update, append, replaceAgent, start, assistant, until, evaluate, close }
}

async function documents(root) {
  const result = []
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) await visit(path)
      else result.push({ path, text: await readFile(path, 'utf8') })
    }
  }
  await visit(root)
  return result
}

test('native fixture uses public Connection constructor and actual storage plugins without live state', async (t) => {
  const f = await fixture(t, { mountHost: false })
  const dispose = f.ctx.connection.fetch.register({ path: API_PATH, methods: ['GET'],
    fetch: () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }) })
  assert.equal((await f.api()).code, 200)
  assert.equal((await f.api({ auth: 'anonymous' })).code, 401)
  assert.equal((await f.api({ auth: 'nonowner' })).code, 403)
  assert.deepEqual(f.storage.backend.names(), ['json'])
  assert.equal(f.storage.domain, f.facility)
  dispose()
  assert.equal((await f.api()).code, 404)
})

test('Host mount is inert until the first real session event activates one chat', async (t) => {
  const f = await fixture(t)
  const mounted = await f.status()
  assert.deepEqual(f.agentListReads, [], 'Host mount enumerated retained agents')
  assert.deepEqual(f.snapshotReads, [], 'Host mount replayed retained transcripts')
  assert.equal(mounted.lifecycle.liveAgents, 0)
  assert.equal(mounted.trajectory.replayedEvents, 0)

  await f.update({ preset: 3 })
  assert.deepEqual(f.agentListReads, [], 'volatile settings activated an idle chat')
  assert.deepEqual(f.snapshotReads, [], 'volatile settings replayed an idle chat')

  f.start(A, 1)
  assert.equal(f.agentListReads.length, 1, 'first event did not resolve its receiving agent lazily')
  assert.deepEqual(f.snapshotReads, [A], 'first event did not replay exactly its own chat')
  const active = await f.status()
  assert.equal(active.lifecycle.liveAgents, 1)
  assert.equal(active.trajectory.replayedEvents, 0, 'activation replay included the triggering event twice')
  assert.equal(f.snapshotReads.includes(B), false, 'activating A replayed unrelated chat B')
})

test('native owner-only settings route validates revisions, existence, sparse presence and durable cold reopen', async (t) => {
  const root = await temporaryRoot(t)
  const f = await fixture(t, { root })
  assert.equal((await f.api({ auth: 'anonymous' })).code, 401)
  const denied = await f.api({ auth: 'nonowner' })
  assert.equal(denied.code, 403)
  assert.equal(denied.text, 'forbidden')
  const forbiddenWrite = { sessionId: COLD, expectedRevision: 0, op: 'set', field: 'preset', value: 4 }
  assert.equal((await f.api({ method: 'POST', auth: 'anonymous', body: forbiddenWrite })).code, 401)
  assert.equal((await f.api({ method: 'POST', auth: 'nonowner', body: forbiddenWrite })).code, 403)
  const deniedReset = await f.resetRequest({ auth: 'anonymous' })
  assert.equal(deniedReset.code, 401)
  assert.equal(deniedReset.body.error, 'unauthorized')
  const ownerReset = await f.resetRequest()
  assert.equal(ownerReset.code, 409, 'authenticated owner should reach the reset operation')
  assert.equal(f.changes.length, 0, 'rejected callers changed native storage')
  assert.deepEqual(f.metadataReads, [], 'rejected callers reached settings/session metadata')
  let s = await f.settings()
  assert.equal(s.sessionId, A)
  assert.equal(s.revision, 0)
  assert.deepEqual(s.overrides, {})
  assert.deepEqual(Object.keys(s.base).sort(), [...FIELDS].sort())
  assert.deepEqual(s.effective, s.base)
  assert.ok(Object.values(s.sources).every((source) => source === 'global'))
  assert.equal(s.threshold, 0.2)
  assert.equal(s.masterEnabled, true)
  assert.equal(s.writable, true)
  assert.deepEqual(f.metadataReads, [], 'live agent existence needlessly read persistence')
  const missing = await f.api({ sessionId: 'soup_feature2_missing' })
  assert.equal(missing.code, 404)
  assert.equal(missing.body.error, 'session-not-found')
  const missingWrite = await f.api({ method: 'POST', body: { ...forbiddenWrite, sessionId: 'soup_feature2_missing' } })
  assert.equal(missingWrite.code, 404)
  assert.equal(missingWrite.body.error, 'session-not-found')
  const unsafe = await f.api({ sessionId: '../unsafe-session' })
  assert.equal(unsafe.code, 400)
  assert.equal(unsafe.body.error, 'invalid-settings')
  assert.equal(f.changes.length, 0, 'unknown/unsafe session created a settings record')
  const cold = await f.settings(COLD)
  assert.equal(cold.sessionId, COLD)
  assert.ok(f.metadataReads.includes(COLD))
  assert.equal(f.live.has(COLD), false)
  assert.equal(f.injected.length, 0)
  s = await f.mutate(COLD, 'preset', 0)
  assert.equal(s.overrides.preset, 0, 'zero must be an explicit override')
  assert.equal(s.threshold, 0.05)
  s = await f.mutate(COLD, 'reanchoring', false)
  assert.equal(s.overrides.reanchoring, false, 'false must be an explicit override')
  s = await f.mutate(COLD, 'windowCount', s.base.windowCount)
  assert.equal(s.sources.windowCount, 'chat', 'equal-default override lost presence')
  const saved = structuredClone(s)
  const stale = await f.api({ method: 'POST', body: { sessionId: COLD, expectedRevision: 0, op: 'set', field: 'preset', value: 4 } })
  assert.equal(stale.code, 409)
  assert.equal(stale.body.error, 'revision-conflict')
  assert.deepEqual(stale.body.settings, saved)
  const before = f.changes.length
  for (const command of [
    { op: 'set', field: 'preset', value: 5 }, { op: 'set', field: 'preset', value: '0' },
    { op: 'set', field: 'enabled', value: 0 }, { op: 'set', field: 'python', value: '' },
    { op: 'set', field: 'baselineCount', value: 0 }, { op: 'set', field: 'windowCount', value: 101 },
    { op: 'set', field: 'windowCount', value: 1.5 }, { op: 'set', field: 'unknown', value: true },
  ]) {
    const response = await f.api({ method: 'POST', body: { sessionId: COLD, expectedRevision: saved.revision, ...command } })
    assert.equal(response.code, 400, JSON.stringify(command))
    assert.equal(response.body.error, 'invalid-settings')
  }
  const malformed = await f.api({ method: 'POST', rawBody: '{' })
  assert.equal(malformed.code, 400)
  assert.equal(malformed.body.error, 'invalid-settings')
  const noAction = await f.api({ method: 'POST', headers: { 'x-qdev-soup-action': '' },
    body: { sessionId: COLD, expectedRevision: saved.revision, op: 'set', field: 'preset', value: 4 } })
  assert.equal(noAction.code, 403)
  assert.equal(f.changes.length, before, 'invalid/stale/unmarked requests wrote native storage')
  assert.deepEqual(await f.settings(COLD), saved)
  const racing = await Promise.all([1, 4].map((value) => f.api({ method: 'POST',
    body: { sessionId: A, expectedRevision: 0, op: 'set', field: 'preset', value } })))
  assert.deepEqual(racing.map((r) => r.code).sort(), [200, 409], 'concurrent stale owner writes both committed')
  const winner = racing.find((r) => r.code === 200).body.settings
  assert.equal(winner.revision, 1)
  assert.deepEqual(racing.find((r) => r.code === 409).body.settings, winner)
  assert.equal(f.changes.length, before + 1)
  const stored = await documents(root)
  assert.ok(stored.length > 0, 'native JSON backend persisted nothing')
  const savedPath = join(root, 'qdev_soup_session_settings', 'sessions', `${COLD}.json`)
  const durable = JSON.parse(await readFile(savedPath, 'utf8'))
  assert.deepEqual(durable, { version: 1, record: { revision: saved.revision, overrides: saved.overrides } },
    'successful response preceded sparse native JSON durability')
  assert.equal((await stat(savedPath)).mode & 0o777, 0o600, 'native backend record permissions changed')
  for (const { text } of stored) {
    assert.equal(text.includes('Implement the original plan'), false)
    assert.equal(text.includes('assistant/message'), false)
    assert.equal(text.includes('provider'), false)
  }
  await f.close()
  const reopened = await fixture(t, { root, liveIds: [] })
  assert.deepEqual(await reopened.settings(COLD), saved, 'new Host/context failed native durable reopen')
  assert.equal(reopened.live.size, 0)
  assert.equal(reopened.injected.length, 0)
  assert.equal((await reopened.status()).detector.evaluations, 0)
  assert.equal(reopened.questions.length, 0)
})

test('A-only native overrides reach Python batching/threshold while B inherits live global settings', async (t) => {
  const f = await fixture(t, { config: { reanchoring: false } })
  await f.mutate(A, 'preset', 0)
  await f.mutate(A, 'baselineCount', 2)
  await f.mutate(A, 'windowCount', 2)
  f.start(A)
  f.start(B)
  f.assistant(A, BASELINE)
  let s = await f.status()
  assert.equal(s.trajectory.baselineSize, 1)
  assert.equal(s.trajectory.baselineTarget, 2)
  assert.equal(s.detector.evaluations, 0)
  f.assistant(A, BASELINE)
  f.assistant(B, BASELINE)
  f.assistant(A)
  assert.equal((await f.status()).detector.evaluations, 0, 'A ignored its two-message window')
  s = await f.evaluate(B)
  assert.equal(s.detector.lastResult.threshold, 0.2, 'A override leaked into B worker')
  s = await f.evaluate(A)
  assert.equal(s.detector.lastResult.threshold, 0.05)
  assert.equal(s.trajectory.windowTarget, 2)
  assert.equal(s.detector.lastResult.driftDetected, true)
  f.assistant(A)
  assert.equal((await f.status()).trajectory.windowSize, 1)
  await f.update({ preset: 4, windowCount: 3 })
  assert.equal((await f.settings(A)).effective.preset, 0)
  assert.equal((await f.settings(A)).effective.windowCount, 2)
  assert.equal((await f.settings(B)).effective.preset, 4)
  assert.equal((await f.settings(B)).effective.windowCount, 3)
  s = await f.evaluate(A)
  assert.equal(s.detector.lastResult.threshold, 0.05, 'fully shadowed global save reset A pending window')
  s = await f.evaluate(B, 3)
  assert.equal(s.detector.lastResult.threshold, 0.4)
  assert.equal(s.trajectory.windowTarget, 3)
  await f.mutate(A, 'preset', undefined, 'unset')
  await f.mutate(A, 'windowCount', undefined, 'unset')
  assert.equal((await f.settings(A)).sources.preset, 'global')
  s = await f.evaluate(A, 3)
  assert.equal(s.detector.lastResult.threshold, 0.4, 'unset did not follow latest global')
  await f.update({ preset: 1, windowCount: 1 })
  s = await f.evaluate(A)
  assert.equal(s.detector.lastResult.threshold, 0.1)
  s = await f.evaluate(B)
  assert.equal(s.detector.lastResult.threshold, 0.1)
  assert.equal(f.injected.length, 0)
  assert.equal(f.questions.length, 0)
})

test('hard global master freezes both chats and rejects mutations without changing durable overrides', async (t) => {
  const f = await fixture(t, { config: { reanchoring: false } })
  await f.mutate(A, 'enabled', true)
  await f.mutate(A, 'preset', 0)
  f.start(A)
  f.start(B)
  f.assistant(A, BASELINE)
  f.assistant(B, BASELINE)
  await f.evaluate(A)
  await f.evaluate(B)
  const saved = (await f.settings(A)).overrides
  // A real pending process exists when master OFF invalidates the generation.
  f.assistant(A)
  assert.equal((await f.status()).detector.state, 'running')
  await f.update({ enabled: false })
  const disabled = await f.status()
  const changes = f.changes.length
  for (const id of [A, B]) {
    const snapshot = await f.settings(id)
    assert.equal(snapshot.masterEnabled, false)
    assert.equal(snapshot.effective.enabled, false)
    assert.equal(snapshot.sources.enabled, 'global-master')
    assert.equal(snapshot.writable, false)
    const rejected = await f.api({ method: 'POST', body: { sessionId: id, expectedRevision: snapshot.revision,
      op: 'set', field: 'enabled', value: true } })
    assert.equal(rejected.code, 409)
    assert.equal(rejected.body.error, 'soup-disabled')
    f.assistant(id)
    f.append(id, 'turn/start', { turn: 2 })
    f.assistant(id, DRIFT, 2)
  }
  await delay(100)
  sames(await f.status(), disabled)
  assert.equal(f.changes.length, changes, 'OFF wrote settings or mentor state')
  assert.deepEqual((await f.settings(A)).overrides, saved)
  assert.equal(f.injected.length, 0)
  assert.equal(f.questions.length, 0)
  await f.update({ enabled: true })
  assert.equal((await f.settings(A)).effective.enabled, true)
  assert.equal((await f.settings(B)).effective.enabled, true)
  const a = await f.evaluate(A, 1, 2)
  assert.equal(a.detector.lastResult.threshold, 0.05)
  const b = await f.evaluate(B, 1, 2)
  assert.equal(b.detector.lastResult.threshold, 0.2)
  function sames(current, previous) {
    assert.deepEqual(current.trajectory, previous.trajectory, 'OFF still observed native events')
    assert.equal(current.detector.evaluations, previous.detector.evaluations, 'cancelled worker changed OFF counters')
    assert.equal(current.detector.drifts, previous.detector.drifts)
    assert.equal(current.detector.state, 'disabled')
    assert.deepEqual(current.detector.lastResult, previous.detector.lastResult)
  }
})

test('per-chat cancellation fences late answers but preserves B worker/question and A third-strike guard', async (t) => {
  const f = await fixture(t)
  for (const id of [A, B]) {
    f.start(id)
    f.assistant(id, BASELINE)
    await f.evaluate(id)
    await f.evaluate(id)
    await f.evaluate(id)
  }
  assert.equal(f.questions.length, 2)
  const a = f.questions.find((q) => q.request.agent.id === A)
  const b = f.questions.find((q) => q.request.agent.id === B)
  assert.ok(a && b)
  assert.equal(a.request.signal.aborted, false)
  assert.equal(b.request.signal.aborted, false)
  const evaluations = (await f.status()).detector.evaluations
  f.assistant(B)
  assert.equal((await f.status()).detector.state, 'running')
  await f.mutate(A, 'reanchoring', false)
  assert.equal(a.request.signal.aborted, true, 'A setting did not cancel A question')
  assert.equal(b.request.signal.aborted, false, 'A setting cancelled unrelated B question')
  const s = await f.until((s) => s.detector.evaluations === evaluations + 1, 'A change killed B in-flight Python worker')
  assert.equal(s.detector.lastResult.sessionId, B)
  assert.equal(s.detector.lastResult.threshold, 0.2)
  const aDeliveries = f.injected.filter(({ id }) => id === A).length
  a.resolve({ answers: [{ id: 'trajectory-clarification', selected: [], custom: 'late cancelled A reply' },
    { id: 'reset-drift-count', selected: ['Yes — reset to 0'] }] })
  await delay(20)
  assert.equal(f.injected.filter(({ id }) => id === A).length, aDeliveries, 'cancelled A answer delivered or reset guard')
  assert.equal(b.request.signal.aborted, false)
  await f.mutate(A, 'reanchoring', true)
  await f.evaluate(A)
  assert.equal(f.injected.filter(({ id }) => id === A).length, 3, 'settings granted A a fresh reminder allowance')
  assert.equal(f.questions.length, 2, 'settings recreated A escalation before a reset decision')
  // B answer still settles normally after A settings changed.
  b.resolve({ answers: [{ id: 'trajectory-clarification', selected: [], custom: 'B remains independently answerable' },
    { id: 'reset-drift-count', selected: ['No — carry 3 forward'] }] })
  await f.until(() => f.injected.some(({ id, message }) => id === B && message.source.form === 'clarification'),
    'B question continuation was invalidated by A settings')
  // Native mentor table confirms the late A Yes could not erase its third strike.
  const mentor = f.facility.get('qdev_soup_drift_state').table('sessions')
  await f.until(() => mentor.get(B)?.decisionPending === false, 'B answer did not reach native durable mentor table')
  assert.deepEqual(mentor.get(A), { carry: 3, decisionPending: true })
  assert.deepEqual(mentor.get(B), { carry: 3, decisionPending: false })
})

test('chat master and detector overrides affect only A observation and real worker execution', async (t) => {
  const f = await fixture(t, { config: { reanchoring: false } })
  await f.mutate(A, 'enabled', false)
  const before = await f.status()
  f.start(A)
  f.assistant(A, BASELINE)
  f.assistant(A)
  assert.deepEqual((await f.status()).trajectory, before.trajectory, 'chat OFF still observed A events')
  f.start(B)
  f.assistant(B, BASELINE)
  await f.evaluate(B)
  await f.mutate(A, 'enabled', undefined, 'unset')
  let s = await f.evaluate(A)
  assert.equal(s.detector.lastResult.threshold, 0.2)
  await f.mutate(A, 'detectorEnabled', false)
  const paused = await f.status()
  f.assistant(A)
  f.assistant(A)
  s = await f.status()
  assert.equal(s.trajectory.sessionEvents, paused.trajectory.sessionEvents + 2, 'detector OFF incorrectly disabled observation')
  assert.equal(s.detector.evaluations, paused.detector.evaluations)
  await f.evaluate(B)
  await f.mutate(A, 'detectorEnabled', undefined, 'unset')
  await f.evaluate(A)
  assert.equal(f.injected.length, 0)
})

test('chat Python override selects actual executable and unset recovers without remounting or affecting B', async (t) => {
  const f = await fixture(t, { config: { reanchoring: false } })
  const missingPython = join(f.root, 'synthetic-missing-python')
  await assert.rejects(stat(missingPython), { code: 'ENOENT' })
  const fiber = f.entry.fiber
  await f.mutate(A, 'python', missingPython)
  for (const id of [A, B]) { f.start(id); f.assistant(id, BASELINE) }
  f.assistant(A)
  let s = await f.until((s) => s.errors.some((error) => error.sessionId === A && error.message.includes('ENOENT')),
    'A did not use its actual Python executable override', { allowErrors: true })
  assert.equal(s.detector.evaluations, 0)
  assert.ok(s.errors.every((error) => error.sessionId === A))
  f.assistant(B)
  s = await f.until((s) => s.detector.evaluations === 1, 'A Python failure disabled B worker', { allowErrors: true })
  assert.equal(s.detector.lastResult.sessionId, B)
  assert.equal(s.detector.lastResult.threshold, 0.2)
  await f.mutate(A, 'python', undefined, 'unset')
  assert.equal((await f.settings(A)).effective.python, PYTHON)
  assert.equal((await f.settings(A)).sources.python, 'global')
  assert.equal(f.entry.fiber, fiber, 'chat Python save remounted native Host')
  f.assistant(A)
  s = await f.until((s) => s.detector.evaluations === 2, 'unset Python did not recover official worker', { allowErrors: true })
  assert.equal(s.detector.lastResult.sessionId, A)
  assert.equal(s.detector.lastResult.threshold, 0.2)
  assert.equal(s.errors.length, 1, 'chat Python failure leaked or recurred after recovery')
})

test('same-id agent disposal fences the old worker and resume retains two strikes for the fresh worker', async (t) => {
  const f = await fixture(t, { liveIds: [A] })
  f.start(A)
  f.assistant(A, BASELINE)
  await f.evaluate(A)
  const before = await f.evaluate(A)
  assert.deepEqual(f.injected.map(({ message }) => message.source.attempt), [1, 2])
  assert.equal(f.questions.length, 0)
  const writes = f.changes.length
  const oldAgent = f.live.get(A)
  const fiber = f.entry.fiber
  f.assistant(A)
  assert.equal((await f.status()).detector.state, 'running', 'old real Python worker was not pending')
  // Native lifecycle events run synchronously before the child can report. Resume
  // the same Session/turn through a different receiving agent, not a new intent.
  const replacement = await f.replaceAgent(A, async () => {
    assert.equal((await f.status()).lifecycle.liveAgents, 0)
    // A global save while detached must not pre-enable the retained runtime and
    // make the subsequent attach skip detector replay of this Session's history.
    await f.update({ preset: 3 })
  })
  assert.notEqual(replacement, oldAgent)
  assert.equal(replacement.session, oldAgent.session)
  assert.equal(f.entry.fiber, fiber)
  const resumed = await f.status()
  assert.equal(resumed.lifecycle.liveAgents, 1)
  assert.equal(resumed.mentor.driftCount, 2, 'resume reset the existing Mentor strikes')
  assert.equal(resumed.trajectory.baselineSize, 1, 'closed-chat global save prevented history replay on attach')
  assert.equal(resumed.trajectory.baselineTarget, 1)
  assert.equal(resumed.trajectory.windowSize, 0)
  assert.ok(resumed.trajectory.replayedEvents > before.trajectory.replayedEvents)
  assert.equal(resumed.detector.state, 'idle', 'disposed worker remained marked running')
  // The terminated child closes asynchronously; neither that late close nor an
  // already queued result may advance counters, deliver or persist strike three.
  await delay(150)
  const settled = await f.status()
  assert.equal(settled.detector.evaluations, before.detector.evaluations)
  assert.equal(settled.detector.drifts, before.detector.drifts)
  assert.deepEqual(settled.detector.lastResult, before.detector.lastResult)
  assert.equal(f.injected.length, 2)
  assert.equal(replacement.received.length, 0, 'old generation injected into the resumed agent')
  assert.equal(f.questions.length, 0)
  assert.equal(f.changes.length, writes, 'old generation persisted an escalation into the resumed session')
  const fresh = await f.evaluate(A)
  assert.equal(fresh.detector.evaluations, before.detector.evaluations + 1)
  assert.equal(fresh.detector.lastResult.threshold, 0.3, 'resumed worker ignored closed-chat global save')
  assert.equal(replacement.received.length, 1, 'fresh worker did not reach the new receiving agent')
  assert.equal(replacement.received[0].source.form, 'escalation', 'resume granted a new reminder allowance')
  assert.equal(f.injected.length, 3)
  assert.equal(f.questions.length, 1)
  assert.equal(f.questions[0].request.agent, replacement)
  const mentor = f.facility.get('qdev_soup_drift_state').table('sessions')
  await f.until(() => mentor.get(A)?.decisionPending === true, 'fresh third strike was not durably recorded')
  assert.deepEqual(mentor.get(A), { carry: 3, decisionPending: true })
})

test('accepted reset retires Q1 so a late answer cannot reset Q2 guard after master OFF/ON', async (t) => {
  const f = await fixture(t, { liveIds: [A] })
  f.start(A)
  f.assistant(A, BASELINE)
  for (let i = 0; i < 3; i += 1) await f.evaluate(A)
  assert.equal(f.questions.length, 1)
  const q1 = f.questions[0]
  const accepted = await f.resetRequest()
  assert.equal(accepted.code, 200)
  assert.equal(accepted.body.result.accepted, true)
  assert.equal(accepted.body.result.reset, true)
  assert.equal(q1.request.signal.aborted, true, 'accepted native reset left the prior question live')
  for (let i = 0; i < 3; i += 1) await f.evaluate(A)
  assert.equal(f.questions.length, 2)
  const q2 = f.questions[1]
  assert.equal(q2.request.signal.aborted, false)
  const mentor = f.facility.get('qdev_soup_drift_state').table('sessions')
  await f.until(() => mentor.get(A)?.decisionPending === true && mentor.get(A)?.carry === 3,
    'new third strike did not establish Q2 durable guard')
  await f.update({ enabled: false })
  assert.equal(q2.request.signal.aborted, true)
  await f.update({ enabled: true })
  const before = await f.status()
  const writes = f.changes.length
  const deliveries = f.injected.length
  q1.resolve({ answers: [{ id: 'trajectory-clarification', selected: [], custom: 'obsolete Q1 answer' },
    { id: 'reset-drift-count', selected: ['Yes — reset to 0'] }] })
  await delay(50)
  assert.equal(f.injected.length, deliveries, 'late retired Q1 delivered clarification after re-enable')
  assert.equal(f.changes.length, writes, 'late retired Q1 reset the newer durable guard')
  assert.deepEqual(mentor.get(A), { carry: 3, decisionPending: true })
  assert.equal((await f.status()).mentor.driftCount, before.mentor.driftCount)
  await f.evaluate(A)
  assert.equal(f.injected.length, deliveries, 'late retired Q1 granted another reminder allowance')
  assert.equal(f.questions.length, 2, 'late retired Q1 permitted a duplicate escalation')
})

test('Host core boots without optional Connection and sessionPersistence', async (t) => {
  const f = await fixture(t, { optional: false, liveIds: [A], config: { reanchoring: false } })
  assert.equal(f.ctx.get('connection'), undefined)
  assert.equal(f.ctx.get('sessionPersistence'), undefined)
  f.start(A)
  f.assistant(A, BASELINE)
  const s = await f.evaluate(A)
  assert.equal(s.detector.lastResult.threshold, 0.2)
  assert.equal(s.detector.lastResult.driftDetected, true)
})
