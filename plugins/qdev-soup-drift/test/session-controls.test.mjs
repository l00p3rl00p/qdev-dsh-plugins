import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Execute the shipped ModuleLoader -> native conversation view -> React components
// -> control handlers. This small hook scheduler is NOT a browser render, layout
// measurement, or Host integration test. Only React hooks and fetch are stand-ins.
const script = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const clone = value => JSON.parse(JSON.stringify(value))
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const defaults = () => ({ python: '/fixture/python', enabled: true, detectorEnabled: true, reanchoring: true, preset: 2, baselineCount: 4, windowCount: 4 })
const fields = { enabled: 'Monitoring', detectorEnabled: 'Drift detector', reanchoring: 'Gentle Mentor', preset: 'Sensitivity', baselineCount: 'Baseline messages', windowCount: 'Comparison window' }
function snapshot(sessionId = 'chat-A', overrides = {}, base = defaults(), revision = 0) {
  const effective = { ...base, ...overrides }; effective.enabled = base.enabled && effective.enabled
  return { sessionId, revision, base: clone(base), overrides: clone(overrides), effective, sources: Object.fromEntries(Object.keys(base).map(field => [field, Object.hasOwn(overrides, field) ? 'chat' : 'global'])), threshold: [0.05, 0.1, 0.2, 0.3, 0.4][effective.preset], masterEnabled: base.enabled, writable: base.enabled }
}
function liveSnapshot(sessionId = 'chat-A') {
  return {
    sessionId, attached: true,
    effective: { enabled: true, detectorEnabled: true, reanchoring: true, threshold: 0.2, baselineTarget: 4, windowTarget: 4 },
    trajectory: { state: 'observing', sessionEvents: 7, assistantMessages: 5, baselineSize: 4, windowSize: 1, lastEventAt: 1700000000000, lastEventType: 'assistant/message' },
    detector: { state: 'idle', pending: false, evaluations: 1, drifts: 0, lastResult: { sessionId, turn: 2, singleTurn: true, klDivergence: 0.12, threshold: 0.2, driftDetected: false, completedAt: 1700000000000 } },
    mentor: { state: 'ready', turn: 2, driftCount: 0, carry: 0, decisionPending: false, escalated: false },
  }
}
function backend() {
  const base = defaults(), records = new Map()
  function read(id) { const item = records.get(id) ?? { overrides: {}, revision: 0 }; return snapshot(id, item.overrides, base, item.revision) }
  return { base, read, records, async fetch(url, options) {
    const parsed = new URL(url, 'http://fixture')
    if (options.method !== 'POST' && parsed.pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: liveSnapshot(parsed.searchParams.get('sessionId')) })
    if (options.method !== 'POST') return response({ ok: true, settings: read(parsed.searchParams.get('sessionId')) })
    const { sessionId, expectedRevision, op, field, value } = JSON.parse(options.body)
    const current = read(sessionId)
    if (expectedRevision !== current.revision) return response({ ok: false, error: 'revision-conflict', settings: current }, 409)
    const overrides = { ...current.overrides }
    if (op === 'set') overrides[field] = value
    else delete overrides[field]
    records.set(sessionId, { overrides, revision: current.revision + 1 })
    return response({ ok: true, settings: read(sessionId) })
  } }
}

function harness(fetch) {
  const instances = new Map(), registrations = [], requests = [], statusRequests = [], updatesAfterDispose = []
  let current, cursor, tree, dirty = false, props = { sessionId: 'chat-A' }, disposed = false, effects = [], visited, timerId = 0
  const timers = new Map()
  const hook = () => [current.hooks, cursor++]
  const React = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity).filter(value => value != null && value !== false) } } },
    useRef(value) { const [hooks, index] = hook(); return hooks[index] ??= { current: value } },
    useState(initial) { const [hooks, index] = hook(); if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], value => { if (disposed) { updatesAfterDispose.push(index); return } const next = typeof value === 'function' ? value(hooks[index]) : value; if (!Object.is(next, hooks[index])) { hooks[index] = next; dirty = true } }] },
    useEffect(effect, deps) { const [hooks, index] = hook(); const old = hooks[index]; if (old?.deps && deps && old.deps.length === deps.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return; const entry = { deps, cleanup: old?.cleanup }; hooks[index] = entry; effects.push(() => { entry.cleanup?.(); entry.cleanup = effect() }) },
  }
  let module
  vm.runInNewContext(script, { AbortController, console, fetch: (url, options = {}) => {
    const target = new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status' ? statusRequests : requests
    target.push({ url, options }); return fetch(url, options)
  }, window: {
    setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id },
    clearInterval(id) { timers.delete(id) },
    __ModuleLoader__: { load(value) { module = value.factory(name => { assert.equal(name, 'react'); return React }) } },
  } })
  module.apply({ configForms: { get() { throw new Error('Per-chat UI must not access the global form') } }, slots: { inject(name, effect) { return effect() }, register(options, component) { registrations.push({ options, component }); return () => {} } }, effect(effect) { return effect() } })
  const registration = registrations.find(item => item.options.name === 'conversation.view' && item.options.id === 'soup-session-settings')
  assert.ok(registration)
  function cleanup(instance) { for (const hook of instance.hooks) hook?.cleanup?.() }
  function expand(node, path) {
    if (!node || typeof node !== 'object') return node
    path += `:${node.props.key ?? ''}`
    if (typeof node.type === 'function') {
      visited.add(path)
      const instance = instances.get(path) ?? { hooks: [] }; instances.set(path, instance)
      const prior = current, priorCursor = cursor; current = instance; cursor = 0
      const result = node.type(node.props); current = prior; cursor = priorCursor
      return expand(result, `${path}/render`)
    }
    return { ...node, props: { ...node.props, children: node.props.children.map((child, i) => expand(child, `${path}/${i}`)) } }
  }
  const api = {
    requests, statusRequests, registration, registrations, updatesAfterDispose,
    render() {
      assert.equal(disposed, false)
      for (let count = 0; count < 30; count++) {
        dirty = false; effects = []; visited = new Set()
        tree = expand(React.createElement(registration.component, props), 'root')
        for (const [path, instance] of instances) if (!visited.has(path)) { cleanup(instance); instances.delete(path) }
        for (const effect of effects) effect()
        if (!dirty) return tree
      }
      throw new Error('Unstable component render')
    },
    nodes(predicate) { const result = []; function walk(node) { if (!node || typeof node !== 'object') return; if (predicate(node)) result.push(node); node.props.children.forEach(walk) } walk(tree); return result },
    node(predicate) { const result = api.nodes(predicate); assert.equal(result.length, 1, `matching node count: ${result.length}`); return result[0] },
    text(node = tree) { return !node || typeof node !== 'object' ? (node == null ? '' : String(node)) : node.props.children.map(api.text).join('') },
    control(label) { return api.node(node => node.props['aria-label'] === label) },
    button(text) { return api.node(node => node.type === 'button' && api.text(node) === text) },
    click(node) { const result = node.props.disabled ? undefined : node.props.onClick?.(); api.render(); return result },
    input(label, value) { api.control(label).props.onChange({ target: { value } }); api.render() },
    async settle() { for (let i = 0; i < 14; i++) { await Promise.resolve(); api.render() } },
    poll() { for (const callback of timers.values()) callback(); api.render() },
    session(id) { props = { sessionId: id }; api.render() },
    dispose() { if (disposed) return; for (const instance of instances.values()) cleanup(instance); disposed = true },
  }
  api.render()
  return api
}

const posts = h => h.requests.filter(request => request.options.method === 'POST')

test('native SOUP conversation tab fetches immediately with inline controls, header Reload and no modal', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    assert.equal(h.registration.options.id, 'soup-session-settings')
    assert.equal(h.registration.options.label, 'SOUP')
    assert.equal(h.registration.options.order, 40)
    assert.equal(h.registrations.some(item => item.options.name === 'conversation.session.header.actions'), false)
    assert.doesNotMatch(script, /setReload/, 'Reload still relies on effect-key indirection')
    assert.match(script, /minHeight: 39/, 'compact session rows lost their tightened density')
    assert.match(script, /compact: true/, 'session toggles are not using the compact variant')
    assert.equal(h.requests.length, 1, 'mounted tab did not immediately fetch settings')
    assert.equal(h.statusRequests.length, 0, 'Settings view fetched live status; only Live & Mentor may')
    assert.match(h.text(), /Loading chat settings/)
    assert.equal(h.button('Loading…').props.disabled, true)
    const get = h.requests[0]
    assert.equal(get.url, '/api/qdev-soup/session-settings?sessionId=chat-A')
    assert.equal(get.options.credentials, 'same-origin'); assert.equal(get.options.headers.accept, 'application/json')
    await h.settle()
    assert.equal(h.nodes(node => node.type === 'dialog' || node.props.role === 'dialog' || node.props['aria-modal']).length, 0)
    assert.equal(h.nodes(node => node.type === 'button' && ['SOUP settings', 'Close'].includes(h.text(node))).length, 0)
    const header = h.node(node => node.type === 'header')
    assert.match(h.text(header), /SOUP/)
    assert.equal(h.nodes(node => node === h.button('Reload')).length, 1)
    assert.ok(header.props.children.some(node => node === h.button('Reload')), 'Reload is not in the compact header')
    assert.equal(h.button('Reload').props.disabled, false)
    await h.click(h.button('Live')); await h.settle()
    assert.equal(h.statusRequests.length, 1, 'Live & Mentor did not fetch live status once')
    assert.match(h.text(), /Live trajectoryWithin thresholdLive chatReference4 \/ 4Live window1 \/ 4Latest KL \/ threshold0\.1200 \/ 0\.20Mentor0 drifts · ready/)
    await h.click(h.button('Refresh')); await h.settle()
    assert.equal(h.requests.length, 1, 'Refresh in Live & Mentor re-fetched settings')
    assert.equal(h.statusRequests.length, 2)
    assert.equal(h.statusRequests[0].options.signal.aborted, true)
    h.session(undefined); assert.equal(h.text(), '')
    assert.equal(h.statusRequests[1].options.signal.aborted, true)
    assert.equal(h.requests.length, 1, 'a tab without a session fetched settings')
    assert.equal(h.statusRequests.length, 2, 'a tab without a session fetched live status')
  } finally { h.dispose() }
})

test('same-chat polling fences an older live response that resolves after the newer poll', async () => {
  const server = backend(), older = deferred(), newer = deferred()
  let liveRequest = 0
  const h = harness((url, options) => {
    if (new URL(url, 'http://fixture').pathname !== '/api/qdev-soup/session-status') return server.fetch(url, options)
    liveRequest += 1
    return liveRequest === 1 ? older.promise : newer.promise
  })
  try {
    await h.click(h.button('Live')); await h.settle()
    assert.equal(h.statusRequests.length, 1)
    h.poll()
    assert.equal(h.statusRequests.length, 2)
    assert.equal(h.statusRequests[0].options.signal.aborted, true)
    const current = liveSnapshot('chat-A')
    current.detector.lastResult.klDivergence = 0.33
    current.detector.lastResult.driftDetected = true
    current.detector.drifts = 1
    newer.resolve(response({ ok: true, live: current }))
    await h.settle()
    assert.match(h.text(), /Drift detected/)
    assert.match(h.text(), /0\.3300 \/ 0\.20/)
    const stale = liveSnapshot('chat-A')
    stale.detector.lastResult.klDivergence = 0.01
    older.resolve(response({ ok: true, live: stale }))
    await h.settle()
    assert.match(h.text(), /Drift detected/)
    assert.match(h.text(), /0\.3300 \/ 0\.20/)
    assert.doesNotMatch(h.text(), /0\.0100 \/ 0\.20/)
  } finally { h.dispose() }
})

test('all six inherited fields expose current global/effective values and a derived read-only threshold', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.settle()
    assert.equal(h.nodes(node => node.type === 'button' && h.text(node) === 'Use global').length, 6)
    for (const [field, label] of Object.entries(fields)) {
      assert.ok(h.control(`Chat ${label}`))
      assert.equal(h.control(`Use global for ${label}`).props.disabled, true)
    }
    assert.equal(h.nodes(node => node.type === 'span' && h.text(node) === 'Inherited').length, 6)
    assert.match(h.text(), /Global ON · Effective ON/)
    assert.equal(h.text(h.control('Chat effective KL threshold')), '0.20')
    assert.equal(h.control('Chat effective KL threshold').type, 'output')
    assert.doesNotMatch(h.text(), /Plan editor|Suppress intervention|Edit original plan/)
  } finally { h.dispose() }
})

test('all six overrides and individual resets use session-scoped revisioned POSTs, never global form mutations', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.settle()
    for (const [field, value] of Object.entries({ enabled: false, detectorEnabled: false, reanchoring: false, preset: 0, baselineCount: 1, windowCount: 100 })) {
      const label = fields[field]
      if (typeof value === 'boolean') await h.click(h.control(`Chat ${label}`))
      else if (field === 'preset') await h.control(`Chat ${label}`).props.onChange({ target: { value: String(value) } })
      else { h.input(`Chat ${label}`, String(value)); await h.click(h.control(`Save ${label} for this chat`)) }
      await h.settle()
      const post = posts(h).at(-1), body = JSON.parse(post.options.body)
      assert.equal(post.url, '/api/qdev-soup/session-settings'); assert.equal(post.options.credentials, 'same-origin')
      assert.deepEqual(clone(post.options.headers), { 'content-type': 'application/json', 'x-qdev-soup-action': 'session-settings' })
      assert.deepEqual(body, { sessionId: 'chat-A', expectedRevision: posts(h).length - 1, op: 'set', field, value: typeof value === 'string' ? value.trim() : value })
      assert.equal(h.control(`Use global for ${label}`).props.disabled, false)
    }
    assert.equal(server.read('chat-B').revision, 0)
    assert.deepEqual(server.read('chat-B').overrides, {})
    assert.equal(server.read('chat-A').threshold, 0.05)
    for (const [field, label] of Object.entries(fields)) {
      const before = server.read('chat-A')
      await h.click(h.control(`Use global for ${label}`)); await h.settle()
      const body = JSON.parse(posts(h).at(-1).options.body)
      assert.deepEqual(body, { sessionId: 'chat-A', expectedRevision: before.revision, op: 'unset', field })
      assert.equal(Object.hasOwn(server.read('chat-A').overrides, field), false)
      assert.equal(h.control(`Use global for ${label}`).props.disabled, true)
    }
    assert.deepEqual(server.base, defaults())
  } finally { h.dispose() }
})

test('explicit equal-default override stays pinned until Use global, which follows the current global values', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.settle()
    await h.click(h.control('Save Baseline messages for this chat')); await h.settle()
    assert.equal(server.read('chat-A').overrides.baselineCount, 4)
    server.base.baselineCount = 9; server.base.windowCount = 8; server.base.preset = 3
    await h.click(h.button('Reload')); await h.settle()
    assert.equal(h.control('Chat Baseline messages').props.value, '4')
    assert.equal(h.control('Chat Comparison window').props.value, '8')
    assert.equal(h.text(h.control('Chat effective KL threshold')), '0.30')
    await h.click(h.control('Use global for Baseline messages')); await h.settle()
    assert.equal(h.control('Chat Baseline messages').props.value, '9')
    assert.equal(h.control('Use global for Baseline messages').props.disabled, true)
    assert.match(h.text(), /Baseline messagesInheritedGlobal 9 · Effective 9/)
  } finally { h.dispose() }
})

test('hard global master OFF and independently read-only snapshots disable every edit and reset handler', async () => {
  for (const globalOff of [true, false]) {
    const data = snapshot('chat-A', { enabled: true, preset: 0 }, { ...defaults(), enabled: !globalOff }); data.writable = false
    const h = harness(async () => response({ ok: true, settings: data }))
    try {
      await h.settle()
      assert.match(h.text(), globalOff ? /cannot bypass the global master/ : /Chat settings are read-only/)
      for (const label of Object.values(fields)) {
        const control = h.control(`Chat ${label}`); assert.equal(Boolean(control.props.disabled), true)
        assert.equal(Boolean(h.control(`Use global for ${label}`).props.disabled), true)
      }
      await h.control('Chat Monitoring').props.onClick()
      await h.control('Use global for Sensitivity').props.onClick()
      assert.equal(posts(h).length, 0)
    } finally { h.dispose() }
  }
})

test('invalid count and sensitivity drafts are rejected locally without a request', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.settle()
    for (const label of ['Baseline messages', 'Comparison window']) {
      for (const invalid of ['', '0', '101', '-1', '1.5', 'invalid']) {
        h.input(`Chat ${label}`, invalid)
        await h.click(h.control(`Save ${label} for this chat`)); await h.settle()
        assert.match(h.text(h.node(node => node.props.role === 'alert')), /valid whole number/)
      }
    }
    for (const invalid of ['-1', '5', '0.5', 'invalid']) await h.control('Chat Sensitivity').props.onChange({ target: { value: invalid } })
    assert.equal(posts(h).length, 0)
  } finally { h.dispose() }
})

test('revision conflicts adopt the fresh snapshot and errors clear on a successful retry', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.settle()
    server.records.set('chat-A', { revision: 3, overrides: { baselineCount: 12 } })
    await h.click(h.control('Chat Monitoring')); await h.settle()
    assert.match(h.text(h.node(node => node.props.role === 'alert')), /revision-conflict/)
    assert.equal(h.control('Chat Baseline messages').props.value, '12')
    await h.click(h.control('Chat Monitoring')); await h.settle()
    assert.equal(JSON.parse(posts(h).at(-1).options.body).expectedRevision, 3)
    assert.equal(h.nodes(node => node.props.role === 'alert').length, 0)
  } finally { h.dispose() }
})

test('GET and POST failures show retryable errors; mismatched session payloads are never adopted', async () => {
  let mode = 'get-error'
  const server = backend(), h = harness(async (url, options) => {
    if (mode === 'get-error') return response({ ok: false, error: 'unavailable' }, 503)
    if (mode === 'wrong-session') return response({ ok: true, settings: snapshot('other-chat') })
    if (mode === 'post-error' && options.method === 'POST') throw new Error('fixture connection lost')
    return server.fetch(url, options)
  })
  try {
    await h.settle(); assert.match(h.text(h.node(node => node.props.role === 'alert')), /unavailable/)
    mode = 'wrong-session'; await h.click(h.button('Reload')); await h.settle()
    assert.match(h.text(h.node(node => node.props.role === 'alert')), /different chat/)
    assert.equal(h.nodes(node => node.props['aria-label'] === 'Chat Monitoring').length, 0)
    mode = 'post-error'; await h.click(h.button('Reload')); await h.settle()
    await h.click(h.control('Chat Monitoring')); await h.settle()
    assert.match(h.text(h.node(node => node.props.role === 'alert')), /fixture connection lost/)
    assert.equal(Boolean(h.control('Chat Monitoring').props.disabled), false)
  } finally { h.dispose() }
})

test('in-flight writes and Reload are busy guarded; tab unmount aborts and fences late responses', async () => {
  const wait = deferred(), server = backend()
  const h = harness((url, options) => options.method === 'POST' ? wait.promise : server.fetch(url, options))
  try {
    await h.settle()
    const first = h.control('Chat Monitoring'), action = h.click(first)
    await first.props.onClick()
    assert.equal(posts(h).length, 1)
    assert.equal(h.control('Chat Monitoring').props.disabled, true)
    assert.equal(h.button('Reload').props.disabled, true)
    h.click(h.button('Reload'))
    assert.equal(h.requests.length, 2, 'busy Reload started another request')
    const post = posts(h)[0]
    h.dispose(); assert.equal(post.options.signal.aborted, true)
    wait.resolve(response({ ok: true, settings: snapshot('chat-A', { enabled: false }, defaults(), 1) }))
    await action
    assert.deepEqual(h.updatesAfterDispose, [], 'late response attempted to update an unmounted tab')
  } finally { h.dispose() }
})

test('A/B session switches fence late GETs, stale handlers and writes; unmount cancels requests', async () => {
  const oldRead = deferred(), write = deferred(), server = backend()
  let holdRead = true
  const h = harness((url, options) => options.method === 'POST' ? write.promise : holdRead ? oldRead.promise : server.fetch(url, options))
  try {
    assert.equal(h.requests.length, 1)
    assert.match(h.text(), /Loading chat settings/)
    const oldSignal = h.requests[0].options.signal
    holdRead = false
    h.session('chat-B'); assert.equal(oldSignal.aborted, true)
    await h.settle()
    oldRead.resolve(response({ ok: true, settings: snapshot('chat-A', { baselineCount: 90 }) })); await h.settle()
    assert.equal(h.control('Chat Baseline messages').props.value, '4')
    const staleButton = h.control('Chat Monitoring'), action = h.click(staleButton), post = posts(h)[0]
    h.session('chat-C'); assert.equal(post.options.signal.aborted, true)
    await staleButton.props.onClick(); assert.equal(posts(h).length, 1)
    await h.settle()
    write.resolve(response({ ok: true, settings: snapshot('chat-B', { enabled: false }, defaults(), 1) })); await action; await h.settle()
    assert.equal(h.control('Chat Monitoring').props['aria-checked'], true)
    const currentRequest = h.requests.at(-1)
    h.dispose(); assert.equal(currentRequest.options.signal.aborted, true)
  } catch (error) { h.dispose(); throw error }
})

// Per-chat Live & Mentor reset decision. Ported from client-controls (Settings-panel tests),
// which asserted the removed Settings panel. Same assertions, per-chat endpoint and sessionId.
const decisionLive = () => { const live = liveSnapshot('chat-A'); live.mentor.decisionPending = true; return live }

test('Live & Mentor reset Yes/No POST the Host action for this chat and refresh the card', async () => {
  for (const reset of [true, false]) {
    const server = backend()
    const h = harness((url, options) => {
      if (options?.method === 'POST') return response({ ok: true, result: { accepted: true } })
      if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: decisionLive() })
      return server.fetch(url, options)
    })
    try {
      await h.click(h.button('Live')); await h.settle()
      await h.click(h.button(reset ? 'Yes — reset to 0' : 'No — carry 3 forward')); await h.settle()
      const post = posts(h)
      assert.equal(post.length, 1)
      assert.equal(post[0].url, '/qdev-soup-drift/status'); assert.equal(post[0].options.credentials, 'same-origin')
      assert.deepEqual(JSON.parse(post[0].options.body), { action: 'reset-drift-count', sessionId: 'chat-A', reset })
      assert.equal(h.statusRequests.length, 2, 'card did not refresh after the reset decision')
    } finally { h.dispose() }
  }
})

test('Live & Mentor reset busy guard: duplicate clicks send one POST, rejection shows and buttons restore', async () => {
  const server = backend(), wait = deferred()
  const h = harness((url, options) => {
    if (options?.method === 'POST') return wait.promise
    if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: decisionLive() })
    return server.fetch(url, options)
  })
  try {
    await h.click(h.button('Live')); await h.settle()
    const action = h.click(h.button('Yes — reset to 0')); await h.settle()
    assert.equal(h.button('Yes — reset to 0').props.disabled, true)
    assert.equal(h.button('No — carry 3 forward').props.disabled, true)
    await h.button('No — carry 3 forward').props.onClick()
    assert.equal(posts(h).length, 1)
    wait.resolve(response({ ok: false, result: { reason: 'disabled' } }, 409))
    await action; await h.settle()
    assert.match(h.text(h.node(node => node.props.role === 'alert')), /disabled/)
    assert.equal(Boolean(h.button('Yes — reset to 0').props.disabled), false)
  } finally { h.dispose() }
})

test('Live & Mentor reset buttons are disabled with no POST when monitoring is OFF', async () => {
  const server = backend(), live = decisionLive(); live.effective.enabled = false
  const h = harness((url, options) => {
    if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live })
    return server.fetch(url, options)
  })
  try {
    await h.click(h.button('Live')); await h.settle()
    for (const text of ['Yes — reset to 0', 'No — carry 3 forward']) {
      assert.equal(h.button(text).props.disabled, true)
      await h.button(text).props.onClick()
    }
    assert.equal(posts(h).length, 0)
  } finally { h.dispose() }
})

test('Live & Mentor shows a status-endpoint failure and unmount aborts polling', async () => {
  const server = backend()
  const h = harness((url, options) => new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status' ? response({}, 503) : server.fetch(url, options))
  await h.click(h.button('Live')); await h.settle()
  assert.match(h.text(), /Session status returned 503/)
  const signal = h.statusRequests[0].options.signal
  h.dispose()
  assert.equal(signal.aborted, true)
})

test('Live and Mentor are separate tabs: Mentor shows the Gentle Mentor prompt without the trajectory card', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.click(h.button('Mentor')); await h.settle()
    assert.match(h.text(), /Gentle Mentor/)
    assert.doesNotMatch(h.text(), /Live trajectory/, 'Mentor tab showed the live trajectory card')
    await h.click(h.button('Live')); await h.settle()
    assert.match(h.text(), /Live trajectory/)
    assert.doesNotMatch(h.text(), /Gentle Mentor/, 'Live tab showed the Gentle Mentor section')
  } finally { h.dispose() }
})

test('Details is its own tab: it shows telemetry, fetches live status while open, and is not in Mentor', async () => {
  const server = backend(), h = harness(server.fetch)
  try {
    await h.click(h.button('Details')); await h.settle()
    assert.match(h.text(), /Calculations/)
    assert.match(h.text(), /Average KL against threshold/)
    assert.doesNotMatch(h.text(), /Gentle Mentor/, 'Details showed the Gentle Mentor prompt')
    assert.ok(h.statusRequests.length >= 1, 'Details did not fetch live status')
    await h.click(h.button('Mentor')); await h.settle()
    assert.doesNotMatch(h.text(), /Calculations/, 'Mentor tab showed telemetry')
  } finally { h.dispose() }
})

test('Convergence tab: four-quadrant view, separated evidence sections, qualified near-boundary note', async () => {
  const server = backend()
  const live = liveSnapshot('chat-A')
  live.effective.threshold = 0.2
  live.detector.history = [0.19, 0.19, 0.19, 0.19, 0.19].map((kl, i) => ({ at: 1700000000000 + i * 1000, kl, threshold: 0.2, drift: false }))
  const h = harness((url, options) => {
    if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: clone(live) })
    return server.fetch(url, options)
  })
  try {
    await h.click(h.button('Convergence')); await h.settle()
    assert.match(h.text(), /Four-quadrant view/)
    assert.match(h.text(), /Raw measurements/)
    assert.match(h.text(), /Statistical measures/)
    assert.match(h.text(), /Interpretation \(hypothesis, not a verified event\)/)
    assert.match(h.text(), /Qualified near-boundary signal/)
    assert.match(h.text(), /SOUP calculations only/)
    assert.doesNotMatch(h.text(), /Gentle Mentor/)
  } finally { h.dispose() }
})

test('Convergence: outlier clusters show agreeing calculations away from the median', async () => {
  const server = backend()
  const live = liveSnapshot('chat-A')
  live.effective.threshold = 0.2
  const kls = [0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.24, 0.242, 0.238, 0.24]
  live.detector.history = kls.map((kl, i) => ({ at: 1700000000000 + i * 1000, kl, threshold: 0.2, drift: kl >= 0.2 }))
  const h = harness((url, options) => {
    if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: clone(live) })
    return server.fetch(url, options)
  })
  try {
    await h.click(h.button('Convergence')); await h.settle()
    assert.match(h.text(), /Outlier clusters/)
    assert.match(h.text(), /4 calculations, at or above the boundary/)
  } finally { h.dispose() }
})

test('Convergence: control chart flags a spike, repeated failures are named, elimination leaves what the evidence allows', async () => {
  const server = backend()
  const live = liveSnapshot('chat-A')
  live.effective.threshold = 0.2
  const kls = [0.08, 0.09, 0.08, 0.07, 0.09, 0.08, 0.09, 0.08, 0.5]
  live.detector.history = kls.map((kl, i) => ({ at: 1700000000000 + i * 1000, kl, threshold: 0.2, drift: kl >= 0.2 }))
  live.tools = [
    { callId: 'a', name: 'web_fetch', startedAt: 1700000000500, endedAt: 1700000000600, error: true, reason: 'Malformed edit: old_string not found at line 12' },
    { callId: 'b', name: 'web_fetch', startedAt: 1700000005500, endedAt: 1700000005600, error: true, reason: 'Malformed edit: old_string not found at line 40' },
  ]
  const h = harness((url, options) => {
    if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: clone(live) })
    return server.fetch(url, options)
  })
  try {
    await h.click(h.button('Convergence')); await h.settle()
    assert.match(h.text(), /Control chart \(Six Sigma\)/)
    assert.match(h.text(), /UCL/)
    assert.match(h.text(), /Rule 1: one reading beyond a control limit/)
    assert.match(h.text(), /Repeated failures/)
    assert.match(h.text(), /malformed edit: old_string not found at: 2 times/)
    assert.match(h.text(), /Still standing/)
  } finally { h.dispose() }
})

test('Convergence: tool by failure type reads one tool repeating versus one failure across tools', async () => {
  const server = backend()
  const live = liveSnapshot('chat-A')
  live.effective.threshold = 0.2
  live.detector.history = [0.08, 0.09, 0.08, 0.07, 0.09, 0.08, 0.09, 0.08].map((kl, i) => ({ at: 1700000000000 + i * 1000, kl, threshold: 0.2, drift: false }))
  const fail = (callId, name, reason, at) => ({ callId, name, startedAt: at, endedAt: at + 50, error: true, reason })
  live.tools = [
    fail('t1', 'web_fetch', 'Request timed out after 30 seconds', 1700000000500),
    fail('t2', 'web_fetch', 'Request timed out after 45 seconds', 1700000002500),
    fail('e1', 'edit', 'Malformed edit: old_string not found at line 12', 1700000004500),
    fail('e2', 'write', 'Malformed edit: old_string not found at line 40', 1700000006500),
  ]
  const h = harness((url, options) => {
    if (new URL(url, 'http://fixture').pathname === '/api/qdev-soup/session-status') return response({ ok: true, live: clone(live) })
    return server.fetch(url, options)
  })
  try {
    await h.click(h.button('Convergence')); await h.settle()
    assert.match(h.text(), /Tool by failure type/)
    assert.match(h.text(), /"request timed out after # seconds" on web_fetch \(2 times\): the tool is probably misconfigured or not working/)
    assert.match(h.text(), /"malformed edit: old_string not found at" across edit, write \(2 times\): the cause is more likely shared/)
  } finally { h.dispose() }
})
