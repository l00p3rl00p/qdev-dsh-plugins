import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionSettings, SessionSettingsError, SessionSettingsRecord } from '../session-settings.mjs'

const defaults = () => ({
  python: '/synthetic/python', enabled: true, detectorEnabled: true, reanchoring: true,
  preset: 2, baselineCount: 4, windowCount: 4,
})
const set = (field, value, expectedRevision = 0) => ({ expectedRevision, op: 'set', field, value })
const unset = (field, expectedRevision = 0) => ({ expectedRevision, op: 'unset', field })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

// Native KvTable contract: get returns the stored immutable-by-convention object;
// put resolves only after durable success and never publishes a rejected write.
function harness({ persisted = new Map(), beforePut = async () => {}, onCommitted } = {}) {
  let global = defaults()
  const records = new Map([...persisted].map(([id, value]) => [id, structuredClone(value)]))
  const puts = [], commits = [], order = []
  const table = {
    get: (id) => records.get(id),
    async put(id, value) {
      puts.push({ id, value })
      order.push(`put:${id}:${value.revision}`)
      await beforePut(id, value)
      persisted.set(id, structuredClone(value))
      records.set(id, value)
      order.push(`durable:${id}:${value.revision}`)
    },
  }
  const options = {
    table, getGlobal: () => global,
    onCommitted(id, snapshot) {
      order.push(`commit:${id}:${snapshot.revision}`)
      commits.push({ id, snapshot })
      onCommitted?.(id, snapshot)
    },
  }
  return { store: createSessionSettings(options), options, table, persisted, records, puts, commits, order,
    global: (value) => { global = { ...global, ...value } } }
}
const code = (expected) => (error) => {
  assert.ok(error instanceof SessionSettingsError)
  assert.equal(error.code, expected)
  return true
}

test('native record schema is strict and sparse for all seven settings', () => {
  assert.deepEqual(SessionSettingsRecord.parse({ revision: 0, overrides: {} }), { revision: 0, overrides: {} })
  assert.equal(SessionSettingsRecord.safeParse({ revision: 1, overrides: defaults() }).success, true)
  const invalid = [
    { revision: -1, overrides: {} }, { revision: 0.5, overrides: {} },
    { revision: Number.MAX_SAFE_INTEGER + 1, overrides: {} },
    { revision: 0, overrides: { unknown: true } }, { revision: 0, overrides: { enabled: undefined } },
    { revision: 0, overrides: { enabled: null } }, { revision: 0, overrides: { preset: 1.5 } },
    { revision: 0, overrides: { python: '  ' } }, { revision: 0, overrides: {}, extra: 1 },
  ]
  for (const value of invalid) assert.equal(SessionSettingsRecord.safeParse(value).success, false)
})

test('only own sparse keys establish override intent, never inherited prototype values', async () => {
  const overrides = Object.assign(Object.create({ enabled: false, baselineCount: 10 }), { preset: 0 })
  assert.deepEqual(SessionSettingsRecord.parse({ revision: 1, overrides }), { revision: 1, overrides: { preset: 0 } })
  const h = harness()
  h.records.set('A', { revision: 1, overrides })
  const s = h.store.read('A')
  assert.deepEqual(s.overrides, { preset: 0 })
  assert.equal(s.effective.enabled, true)
  assert.equal(s.effective.baselineCount, 4)
  assert.equal(s.sources.enabled, 'global')
  const inheritedRevision = Object.assign(Object.create({ expectedRevision: 1 }), { op: 'set', field: 'enabled', value: false })
  await assert.rejects(h.store.mutate('A', inheritedRevision), code('invalid-settings'))
  assert.equal(h.puts.length, 0)
})

test('A/B/C inherit current globals independently; equal-default, false and zero stay explicit overrides', async () => {
  const h = harness()
  const initial = h.store.read('A')
  assert.equal(initial.revision, 0)
  assert.deepEqual(initial.overrides, {})
  assert.deepEqual(initial.base, defaults())
  assert.deepEqual(initial.effective, defaults())
  assert.equal(initial.threshold, 0.2)
  assert.ok(Object.values(initial.sources).every((source) => source === 'global'))
  let a = await h.store.mutate('A', set('baselineCount', 4))
  a = await h.store.mutate('A', set('detectorEnabled', false, a.revision))
  a = await h.store.mutate('A', set('preset', 0, a.revision))
  await h.store.mutate('B', set('enabled', false))
  h.global({ baselineCount: 9, windowCount: 8, preset: 4, detectorEnabled: true })
  a = h.store.read('A')
  assert.equal(a.effective.baselineCount, 4, 'equal-default override was discarded')
  assert.equal(a.base.baselineCount, 9)
  assert.equal(a.effective.detectorEnabled, false)
  assert.equal(a.effective.preset, 0)
  assert.equal(a.threshold, 0.05)
  assert.equal(a.effective.windowCount, 8)
  assert.equal(a.sources.baselineCount, 'chat')
  assert.equal(a.sources.windowCount, 'global')
  const b = h.store.read('B')
  assert.equal(b.effective.enabled, false)
  assert.equal(b.sources.enabled, 'chat')
  assert.equal(b.effective.baselineCount, 9)
  const c = h.store.read('C')
  assert.deepEqual(c.overrides, {})
  assert.equal(c.effective.preset, 4)
  assert.equal(c.threshold, 0.4)
  assert.equal(c.effective.enabled, true)
  assert.equal(c.revision, 0)
  assert.equal(h.puts.length, 4, 'reads or global changes wrote per-chat records')
})

test('individual Use global removes presence and tracks later globals without resetting other fields', async () => {
  const h = harness()
  let s = await h.store.mutate('A', set('baselineCount', 4))
  s = await h.store.mutate('A', set('windowCount', 7, s.revision))
  h.global({ baselineCount: 6 })
  s = await h.store.mutate('A', unset('baselineCount', s.revision))
  assert.deepEqual(s.overrides, { windowCount: 7 })
  assert.equal(s.effective.baselineCount, 6)
  assert.equal(s.sources.baselineCount, 'global')
  assert.equal(s.sources.windowCount, 'chat')
  h.global({ baselineCount: 10, windowCount: 2 })
  assert.equal(h.store.read('A').effective.baselineCount, 10)
  assert.equal(h.store.read('A').effective.windowCount, 7)
  const before = h.puts.length
  const again = await h.store.mutate('A', unset('baselineCount', s.revision))
  assert.equal(again.revision, s.revision)
  assert.equal(h.puts.length, before)
  assert.equal(h.commits.length, before)
})

test('global master OFF hard-caps chat ON but preserves override intent for later recovery', async () => {
  const h = harness()
  await h.store.mutate('A', set('enabled', true))
  await h.store.mutate('B', set('enabled', false))
  h.global({ enabled: false })
  for (const id of ['A', 'B', 'C']) {
    const s = h.store.read(id)
    assert.equal(s.masterEnabled, false)
    assert.equal(s.effective.enabled, false)
    assert.equal(s.sources.enabled, 'global-master')
  }
  assert.deepEqual(h.store.read('A').overrides, { enabled: true })
  h.global({ enabled: true })
  assert.equal(h.store.read('A').effective.enabled, true)
  assert.equal(h.store.read('A').sources.enabled, 'chat')
  assert.equal(h.store.read('B').effective.enabled, false)
  assert.equal(h.store.read('C').effective.enabled, true)
})

test('all setting bounds and five presets validate; malformed commands never write or commit', async () => {
  const h = harness()
  let revision = 0
  for (const [field, values] of Object.entries({
    python: ['/another/python'], enabled: [false, true], detectorEnabled: [false, true], reanchoring: [false, true],
    preset: [0, 1, 2, 3, 4], baselineCount: [1, 100], windowCount: [1, 100],
  })) {
    for (const value of values) {
      const s = await h.store.mutate('A', set(field, value, revision))
      revision = s.revision
      assert.equal(s.effective[field], value)
      if (field === 'preset') assert.equal(s.threshold, [0.05, 0.1, 0.2, 0.3, 0.4][value])
    }
  }
  const invalid = [
    null, undefined, {}, { op: 'set', field: 'enabled', value: false },
    set('unknown', 1, revision), set('__proto__', true, revision), set('python', '', revision), set('python', '  ', revision),
    set('preset', -1, revision), set('preset', 5, revision), set('preset', 1.5, revision),
    set('baselineCount', 0, revision), set('baselineCount', 101, revision), set('baselineCount', 2.5, revision),
    set('windowCount', 0, revision), set('windowCount', 101, revision), set('windowCount', '4', revision),
    set('enabled', 'false', revision), set('detectorEnabled', null, revision), set('reanchoring', undefined, revision),
    { expectedRevision: revision, op: 'set', field: 'enabled' },
    { ...set('enabled', false, revision), extra: true },
    { ...unset('enabled', revision), value: false },
    set('enabled', false, -1), set('enabled', false, 0.5), set('enabled', false, Number.MAX_SAFE_INTEGER + 1),
    { ...set('enabled', false, revision), op: 'delete' },
  ]
  const before = h.store.read('A')
  const writes = h.puts.length
  for (const input of invalid) await assert.rejects(h.store.mutate('A', input), code('invalid-settings'))
  assert.deepEqual(h.store.read('A'), before)
  assert.equal(h.puts.length, writes)
  assert.equal(h.commits.length, writes)
})

test('native per-record safe identifiers are enforced before reads and writes', async () => {
  const h = harness()
  for (const id of ['', '.', '..', '../A', 'A/B', 'A\\B', 'A:B', 'A.B', 'A%2fB', ' A', 'A ', 'A\n', 'é', 'A'.repeat(257), null, 123]) {
    assert.throws(() => h.store.read(id), code('invalid-settings'))
    await assert.rejects(h.store.mutate(id, set('enabled', false)), code('invalid-settings'))
  }
  for (const id of ['A', 'session-0000_1111', 'a'.repeat(256)]) assert.equal(h.store.read(id).sessionId, id)
  assert.equal(h.puts.length, 0)
})

test('durability precedes publication and callback; globals stay current across a pending write', async () => {
  const gate = deferred()
  const h = harness({ beforePut: () => gate.promise })
  const pending = h.store.mutate('A', set('preset', 0))
  await tick()
  assert.equal(h.puts.length, 1)
  assert.equal(h.store.read('A').revision, 0)
  assert.equal(h.store.read('A').threshold, 0.2)
  assert.equal(h.commits.length, 0)
  h.global({ windowCount: 9 })
  gate.resolve()
  const s = await pending
  assert.equal(s.revision, 1)
  assert.equal(s.effective.windowCount, 9)
  assert.deepEqual(h.order, ['put:A:1', 'durable:A:1', 'commit:A:1'])
  assert.deepEqual(h.commits[0].snapshot, s)
})

test('same-chat concurrent stale revisions serialize through durable commit, including recreated handles', async () => {
  const gate = deferred()
  const h = harness({ beforePut: () => gate.promise })
  const other = createSessionSettings(h.options)
  const first = h.store.mutate('A', set('enabled', false))
  const second = other.mutate('A', set('preset', 0))
  const secondRejected = assert.rejects(second, (error) => {
    code('revision-conflict')(error)
    assert.equal(error.settings.revision, 1)
    assert.equal(error.settings.effective.enabled, false)
    error.settings.overrides.enabled = true
    return true
  })
  await tick()
  assert.equal(h.puts.length, 1)
  gate.resolve()
  await first
  await secondRejected
  assert.deepEqual(h.order, ['put:A:1', 'durable:A:1', 'commit:A:1'])
  assert.equal(h.store.read('A').effective.enabled, false)
  await assert.rejects(h.store.mutate('A', unset('enabled', 0)), code('revision-conflict'))
  assert.equal(h.puts.length, 1)
})

test('different chats are independent while a slow same-chat durability boundary is pending', async () => {
  const gate = deferred()
  const h = harness({ beforePut: (id) => id === 'A' ? gate.promise : undefined })
  const a = h.store.mutate('A', set('enabled', false))
  const b = await h.store.mutate('B', set('preset', 4))
  assert.equal(b.revision, 1)
  assert.equal(h.store.read('A').revision, 0)
  assert.equal(h.commits[0].id, 'B')
  gate.resolve()
  await a
  assert.equal(h.store.read('A').effective.enabled, false)
  assert.equal(h.store.read('B').effective.enabled, true)
})

test('backend failure never advances effective state/revision/callback and queued recovery still succeeds', async () => {
  const gate = deferred()
  let attempts = 0
  const h = harness({ beforePut: async () => { if (++attempts === 1) await gate.promise } })
  const failed = h.store.mutate('A', set('enabled', false))
  const rejected = assert.rejects(failed, code('storage-failed'))
  const recovered = h.store.mutate('A', set('preset', 0))
  await tick()
  assert.equal(h.puts.length, 1)
  gate.reject(new Error('Synthetic backend unavailable'))
  await rejected
  const s = await recovered
  assert.equal(s.revision, 1)
  assert.deepEqual(s.overrides, { preset: 0 })
  assert.equal(s.effective.enabled, true)
  assert.equal(h.commits.length, 1)
  assert.equal(h.persisted.get('A').revision, 1)
  assert.deepEqual(h.order, ['put:A:1', 'put:A:1', 'durable:A:1', 'commit:A:1'])
})

test('snapshots, callback values and command inputs cannot mutate native stored records', async () => {
  const h = harness({ onCommitted: (_id, value) => { value.overrides.enabled = true; value.base.preset = 4 } })
  const command = set('enabled', false)
  const pending = h.store.mutate('A', command)
  command.value = true
  const s = await pending
  assert.equal(s.effective.enabled, false)
  assert.equal(s.overrides.enabled, false)
  s.overrides.enabled = true
  s.effective.enabled = true
  s.base.preset = 0
  s.sources.enabled = 'global'
  assert.equal(h.store.read('A').overrides.enabled, false)
  assert.equal(h.store.read('A').effective.enabled, false)
  assert.equal(h.store.read('A').base.preset, 2)
  assert.equal(h.store.read('A').sources.enabled, 'chat')
  assert.deepEqual(h.table.get('A'), { revision: 1, overrides: { enabled: false } })
})

test('native table and settings handle recreation retains sparse records, not stale global snapshots', async () => {
  const persisted = new Map()
  const first = harness({ persisted })
  await first.store.mutate('A', set('preset', 0))
  await first.store.mutate('B', set('enabled', false))
  const next = harness({ persisted })
  next.global({ baselineCount: 12, preset: 4 })
  assert.equal(next.store.read('A').revision, 1)
  assert.deepEqual(next.store.read('A').overrides, { preset: 0 })
  assert.equal(next.store.read('A').effective.baselineCount, 12)
  assert.equal(next.store.read('A').threshold, 0.05)
  assert.equal(next.store.read('B').effective.enabled, false)
  assert.equal(next.store.read('C').threshold, 0.4)
  await next.store.mutate('A', unset('preset', 1))
  assert.equal(next.store.read('A').revision, 2)
  assert.equal(next.store.read('A').threshold, 0.4)
})

test('corrupt persisted/global settings fail closed without runtime commit or write', async () => {
  const h = harness({ persisted: new Map([['A', { revision: -1, overrides: {} }]]) })
  assert.throws(() => h.store.read('A'), code('invalid-settings'))
  await assert.rejects(h.store.mutate('A', set('enabled', false)), code('invalid-settings'))
  h.global({ windowCount: 0 })
  assert.throws(() => h.store.read('B'), code('invalid-settings'))
  await assert.rejects(h.store.mutate('B', set('preset', 0)), code('invalid-settings'))
  assert.equal(h.puts.length, 0)
  assert.equal(h.commits.length, 0)
})
