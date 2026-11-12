import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Component-handler tests, not browser/visual proof. Execute the shipped module's
// factory, slot registrations, components and handlers; fake only React scheduling,
// native form transport, fetch and timers. No production exports/instrumentation.
const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const plain = value => JSON.parse(JSON.stringify(value))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const liveStatus = () => ({ configuration: { enabled: true }, trajectory: {}, detector: {}, mentor: { driftCount: 3, carriedDrifts: 3, resetDecision: { required: true, sessionId: 'fixture-chat', turn: 1 } }, errors: [] })

function harness({ value = {}, writable = true, status = 'ready', mutate, fetch: fetchOverride, live = liveStatus() } = {}) {
  const instances = new Map(), effects = [], registrations = [], calls = [], requests = [], timers = new Map()
  let current, cursor, tree, root, rootProps, timerId = 0, disposed = false
  let snapshot = { status, writable, revision: 17, value: { enabled: true, detectorEnabled: true, reanchoring: true, preset: 2, baselineCount: 4, windowCount: 4, ...value } }
  const listeners = new Set()
  const source = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async mutate(operations, revision) {
      calls.push(plain({ operations, revision }))
      return mutate ? mutate(operations, revision) : true
    },
  }
  const hook = () => { const index = cursor++; return [current.hooks, index] }
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]))
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity).filter(item => item !== null && item !== undefined && item !== false) } } },
    useState(initial) {
      const [hooks, index] = hook()
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next }]
    },
    useEffect(effect, deps) {
      const [hooks, index] = hook(), old = hooks[index]
      if (old && sameDeps(old.deps, deps)) return
      const entry = { deps, cleanup: old?.cleanup }; hooks[index] = entry
      effects.push(() => { entry.cleanup?.(); entry.cleanup = effect() })
    },
    useMemo(factory) { hook(); return factory() },
    useCallback(callback) { hook(); return callback },
    useSyncExternalStore(subscribe, getSnapshot) { React.useEffect(() => subscribe(() => {}), []); return getSnapshot() },
  }
  let module
  const window = {
    __ModuleLoader__: { load(declaration) { assert.equal(declaration.id, pkg.name); module = declaration.factory(name => { assert.equal(name, 'react'); return React }) } },
    setInterval(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id },
    clearInterval(id) { timers.delete(id) },
  }
  vm.runInNewContext(client, { window, AbortController, console, fetch: async (url, options = {}) => {
    requests.push({ url, options })
    if (fetchOverride) return fetchOverride(url, options)
    return response(options.method === 'POST' ? { ok: true } : live)
  } }, { filename: 'qdev-soup-client.js' })
  assert.equal(module.name, 'qdev-trajectory-drift-soup-settings')
  assert.deepEqual(plain(module.inject), ['slots', 'configForms'])
  const cleanups = []
  module.apply({
    configForms: { get(entry) { assert.equal(entry, pkg.name); return source } },
    slots: {
      inject(name, effect) { const cleanup = effect(); cleanups.push(cleanup); return cleanup },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
    effect(effect) { const cleanup = effect(); cleanups.push(cleanup); return cleanup },
  })
  function expand(node, path) {
    if (typeof node !== 'object' || node === null) return node
    if (typeof node.type === 'function') {
      const previous = current, previousCursor = cursor
      const instance = instances.get(path) ?? { hooks: [] }; instances.set(path, instance)
      current = instance; cursor = 0
      const output = node.type(node.props)
      current = previous; cursor = previousCursor
      return expand(output, `${path}/render`)
    }
    return { ...node, props: { ...node.props, children: node.props.children.map((child, i) => expand(child, `${path}/${i}`)) } }
  }
  const api = {
    calls, requests, registrations, source, timers,
    render() { assert.equal(disposed, false); tree = expand(React.createElement(root, rootProps), 'root'); while (effects.length) effects.shift()(); return tree },
    mount(slot = 'settings.section', props) {
      const registration = registrations.find(item => item.options.name === slot)
      assert.ok(registration, `registered ${slot}`)
      root = registration.component; rootProps = props ?? registration.options.inject?.() ?? {}
      return api.render()
    },
    nodes(predicate) { const found = []; function walk(node) { if (!node || typeof node !== 'object') return; if (predicate(node)) found.push(node); node.props.children.forEach(walk) } walk(tree); return found },
    node(predicate) { const found = api.nodes(predicate); assert.equal(found.length, 1, `one matching node, found ${found.length}`); return found[0] },
    control(label) { return api.node(node => node.props['aria-label'] === label) },
    button(text) { return api.node(node => node.type === 'button' && api.text(node) === text) },
    text(node = tree) { if (!node || typeof node !== 'object') return node == null ? '' : String(node); return node.props.children.map(child => api.text(child)).join('') },
    click(node) { if (node.props.disabled) return undefined; return node.props.onClick?.() },
    snapshot(patch) { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(); api.render() },
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); api.render() },
    dispose() { for (const instance of instances.values()) for (const entry of instance.hooks) entry?.cleanup?.(); for (const cleanup of cleanups.reverse()) cleanup?.(); disposed = true },
  }
  return api
}

const labels = { enabled: 'Enable trajectory monitoring', detectorEnabled: 'Enable SOUP drift detector', reanchoring: 'Enable Gentle Mentor reanchoring' }

test('actual ModuleLoader registers settings and plugin detail; toggles mutate native fields with revision', async () => {
  const h = harness()
  try {
    h.mount()
    assert.equal(h.registrations.length, 3)
    assert.equal(h.registrations[1].options.key, `${pkg.name}#${pkg.name}`)
    for (const [field, label] of Object.entries(labels)) {
      const control = h.control(label)
      assert.equal(control.type, 'button'); assert.equal(control.props.role, 'switch'); assert.equal(control.props['aria-checked'], true)
      await h.click(control); await h.settle()
      assert.deepEqual(h.calls.at(-1), { operations: [{ op: 'set', path: [field], value: false }], revision: 17 })
    }
    assert.match(h.text(), new RegExp(`version ${pkg.version.replaceAll('.', '\\.')}`))
    h.mount('plugins.row.config', { view: 'summary', form: { state: h.source.getSnapshot(), mutate: h.source.mutate } })
    assert.match(h.text(), /Detects trajectory drift with SOUP/)
  } finally { h.dispose() }
})

test('plugin detail uses its native form/revision and exposes the existing source link', async () => {
  const h = harness()
  try {
    const state = { ...h.source.getSnapshot(), revision: 29 }
    h.mount('plugins.row.config', { view: 'detail', form: { state, mutate: h.source.mutate.bind(h.source) } })
    await h.click(h.control(labels.reanchoring)); await h.settle()
    assert.deepEqual(h.calls[0], { operations: [{ op: 'set', path: ['reanchoring'], value: false }], revision: 29 })
    const link = h.node(node => node.type === 'a')
    assert.equal(h.text(link), 'Source repository')
    assert.equal(link.props.href, pkg.homepage)
    assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noreferrer')
  } finally { h.dispose() }
  const unavailable = harness()
  try {
    unavailable.mount('plugins.row.config', { view: 'detail' })
    for (const label of Object.values(labels)) assert.equal(Boolean(unavailable.control(label).props.disabled), true)
    assert.match(unavailable.text(), /Configuration is unavailable/)
    await unavailable.control(labels.enabled).props.onClick()
    assert.equal(unavailable.calls.length, 0)
  } finally { unavailable.dispose() }
})

test('all five sensitivity positions and numeric drafts call native form handlers; invalid drafts revert', async () => {
  const h = harness()
  try {
    h.mount()
    for (let preset = 0; preset <= 4; preset++) {
      const input = h.control('Drift sensitivity preset')
      assert.equal(input.props.min, 0); assert.equal(input.props.max, 4); assert.equal(input.props.step, 1)
      await input.props.onChange({ target: { value: String(preset) } }); await h.settle()
      assert.deepEqual(h.calls.at(-1).operations, [{ op: 'set', path: ['preset'], value: preset }])
      h.snapshot({ value: { ...h.source.getSnapshot().value, preset } })
      assert.equal(h.control('Drift sensitivity preset').props['aria-valuetext'], `Position ${preset + 1} of 5, KL threshold ${[0.05, 0.1, 0.2, 0.3, 0.4][preset].toFixed(2)}`)
      assert.equal(h.text(h.node(node => node.type === 'output')), [0.05, 0.1, 0.2, 0.3, 0.4][preset].toFixed(2))
    }
    for (const [label, field] of [['Baseline messages', 'baselineCount'], ['Comparison window', 'windowCount']]) {
      const input = h.control(label)
      assert.equal(input.type, 'input'); assert.equal(input.props.type, 'number')
      assert.equal(input.props.min, 1); assert.equal(input.props.max, 100); assert.equal(input.props.step, 1)
      for (const value of ['1', '100']) {
        h.control(label).props.onChange({ target: { value } }); h.render()
        let blurred = false
        h.control(label).props.onKeyDown({ key: 'Enter', currentTarget: { blur() { blurred = true } } })
        assert.equal(blurred, true)
        h.control(label).props.onBlur(); await h.settle()
        assert.deepEqual(h.calls.at(-1).operations, [{ op: 'set', path: [field], value: Number(value) }])
      }
      for (const value of ['', '0', '101', '-1', '1.5', 'not-a-number']) {
        const before = h.calls.length
        h.control(label).props.onChange({ target: { value } }); h.render()
        h.control(label).props.onBlur(); h.render()
        assert.equal(h.calls.length, before)
        assert.equal(h.control(label).props.value, '4')
      }
    }
  } finally { h.dispose() }
})

test('about disclosure expands/collapses actual explanation with current counts and threshold', () => {
  const h = harness({ value: { baselineCount: 7, windowCount: 9, preset: 4 } })
  try {
    h.mount(); assert.doesNotMatch(h.text(), /Statistical Output Profiling/)
    const button = h.button('What is SOUP? ▼'); assert.equal(button.props['aria-expanded'], false)
    h.click(button); h.render()
    assert.equal(h.button('Hide explanation ▲').props['aria-expanded'], true)
    assert.match(h.text(), /Statistical Output Profiling/); assert.match(h.text(), /Baseline \(7 messages\)/); assert.match(h.text(), /Comparison window \(9 messages\)/); assert.match(h.text(), /Threshold \(0\.40\)/)
    h.click(h.button('Hide explanation ▲')); h.render(); assert.doesNotMatch(h.text(), /Statistical Output Profiling/)
  } finally { h.dispose() }
})

test('master remains operable while OFF; disabled/read-only/unavailable/busy controls do not dispatch', async () => {
  const wait = deferred(), h = harness({ value: { enabled: false }, mutate: () => wait.promise })
  try {
    h.mount()
    assert.equal(Boolean(h.control(labels.enabled).props.disabled), false)
    for (const label of [labels.detectorEnabled, labels.reanchoring, 'Drift sensitivity preset', 'Baseline messages', 'Comparison window']) assert.equal(Boolean(h.control(label).props.disabled), true)
    h.click(h.control(labels.detectorEnabled)); assert.equal(h.calls.length, 0)
    const action = h.click(h.control(labels.enabled)); h.render()
    assert.equal(h.control(labels.enabled).props.disabled, true)
    h.click(h.control(labels.enabled)); assert.equal(h.calls.length, 1)
    wait.resolve(true); await action; await h.settle()
    assert.deepEqual(h.calls[0].operations, [{ op: 'set', path: ['enabled'], value: true }])
    for (const patch of [{ writable: false }, { writable: true, status: 'loading' }]) {
      h.snapshot(patch)
      for (const label of Object.values(labels)) assert.equal(Boolean(h.control(label).props.disabled), true)
      const before = h.calls.length
      // set() also guards an obsolete handler rather than relying only on native disabled buttons.
      await h.control(labels.enabled).props.onClick(); assert.equal(h.calls.length, before)
    }
    assert.match(h.text(), /Configuration is loading/)
  } finally { h.dispose() }
})

test('prominent master distinguishes ON/OFF with text, geometry, semantic colors and native button focus', () => {
  const h = harness()
  try {
    h.mount()
    const on = h.control(labels.enabled)
    assert.equal(h.text(on), 'ON')
    assert.equal(on.props['aria-checked'], true)
    assert.match(on.props.style.border, /^2px solid var\(--dsw-alias-state-success-primary\)$/)
    assert.match(on.props.style.background, /state-success-primary/)
    assert.ok(on.props.style.minWidth >= 86); assert.ok(on.props.style.minHeight >= 34)
    assert.equal(on.props.style.color, 'var(--dsw-alias-label-primary)')
    assert.equal(on.props.children[0].props.style.background, 'currentColor')
    assert.equal(on.props.tabIndex, undefined); assert.equal(on.props.style.outline, undefined)
    h.snapshot({ value: { ...h.source.getSnapshot().value, enabled: false } })
    const off = h.control(labels.enabled)
    assert.equal(h.text(off), 'OFF'); assert.equal(off.props['aria-checked'], false)
    assert.match(off.props.style.border, /^2px solid var\(--dsw-alias-state-warn-primary\)$/)
    assert.match(off.props.style.background, /state-warn-primary/)
    assert.notEqual(on.props.style.flexDirection, off.props.style.flexDirection)
    assert.equal(Boolean(off.props.disabled), false)
    assert.notEqual(off.props.style.border, h.control(labels.detectorEnabled).props.style.border)
  } finally { h.dispose() }
})

test('detector OFF disables calculations controls but not the master or detector switches', () => {
  const h = harness({ value: { detectorEnabled: false } })
  try {
    h.mount()
    assert.equal(Boolean(h.control(labels.enabled).props.disabled), false)
    assert.equal(Boolean(h.control(labels.detectorEnabled).props.disabled), false)
    for (const label of [labels.reanchoring, 'Drift sensitivity preset', 'Baseline messages', 'Comparison window']) assert.equal(Boolean(h.control(label).props.disabled), true)
  } finally { h.dispose() }
})

test('native form rejection and thrown mutation errors surface alerts and restore controls', async () => {
  for (const result of [false, new Error('fixture transport failed')]) {
    const h = harness({ mutate: async () => { if (result instanceof Error) throw result; return result } })
    try {
      h.mount(); await h.click(h.control(labels.enabled)); await h.settle()
      assert.match(h.text(h.node(node => node.props.role === 'alert')), result === false ? /configuration changed elsewhere|host rejected/ : /fixture transport failed/)
      assert.equal(Boolean(h.control(labels.enabled).props.disabled), false)
    } finally { h.dispose() }
  }
})
