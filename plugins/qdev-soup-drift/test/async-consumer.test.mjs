// M1: a consumer that returns a rejected promise must not escape isolation (no unhandledRejection),
// must be reported as a named consumer failure, and must not stop the measurement or its peers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, until, sleep } from './proof-helpers.mjs'

const unhandled = []
const onUnhandled = (reason) => unhandled.push(reason)

test('M1: an async throwing subscriber is reported as a consumer failure, never unhandled', opts, async () => {
  process.on('unhandledRejection', onUnhandled)
  try {
    const errors = []
    let peer = 0
    const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, onError: (e, details) => errors.push(details) })
    d.subscribe('evaluation', async () => { throw new Error('async boom') }, 'asyncA')
    d.subscribe('evaluation', () => { peer += 1 }, 'peer')
    d.observe('s', event(REF)); d.observe('s', event(LIVE))
    await until(() => peer >= 1); await sleep(200)
    d.dispose()
    assert.equal(peer, 1, 'a peer was stopped by the async failure')
    assert.deepEqual(errors.filter((e) => e.phase === 'consumer').map((e) => e.consumer), ['asyncA'])
    assert.equal(errors.filter((e) => e.phase === 'parse').length, 0)
    assert.deepEqual(unhandled, [], 'async rejection escaped isolation')
  } finally { process.off('unhandledRejection', onUnhandled) }
})

test('M1: an async throwing error reporter cannot become an unhandled rejection', opts, async () => {
  process.on('unhandledRejection', onUnhandled)
  try {
    let calls = 0
    const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, onError: async () => { calls += 1; throw new Error('reporter boom') } })
    d.subscribe('evaluation', () => { throw new Error('sync boom') }, 'bad')
    d.observe('s', event(REF)); d.observe('s', event(LIVE))
    await until(() => calls >= 1); await sleep(200)
    d.dispose()
    assert.ok(calls >= 1)
    assert.deepEqual(unhandled, [])
  } finally { process.off('unhandledRejection', onUnhandled) }
})

test('M1: an async throwing runtime notify subscriber does not escape and Mentor still acts', opts, async () => {
  process.on('unhandledRejection', onUnhandled)
  try {
    const injected = [], errors = []
    const rt = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1,
      notify: async () => { throw new Error('notify boom') }, inject: (x) => injected.push(x), onError: (e, d) => errors.push(d) })
    rt.observe('s', { type: 'turn/start', data: { turn: 1 } })
    rt.observe('s', { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'plan' }] } })
    rt.observe('s', event(REF)); rt.observe('s', event(LIVE))
    await until(() => injected.length >= 1); await sleep(200)
    rt.dispose()
    assert.equal(injected.length, 1)
    assert.ok(errors.some((e) => e.phase === 'consumer' && e.consumer === 'notify'))
    assert.deepEqual(unhandled, [])
  } finally { process.off('unhandledRejection', onUnhandled) }
})
