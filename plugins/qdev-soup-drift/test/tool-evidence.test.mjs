import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Loads the shipped client and checks the uiConversation event definition that reads DSH's own
// tool/call and tool/result events. SOUP records nothing itself; this test only checks the reader.
const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const React = {
  createElement: (...args) => ({ args }),
  Fragment: 'Fragment',
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
}

test('tool evidence definition pairs tool/call with tool/result and reports a failed result', () => {
  let moduleDeclaration
  const window = {
    __ModuleLoader__: { load(declaration) { moduleDeclaration = declaration.factory(() => React) } },
    setInterval: () => 1,
    clearInterval: () => {},
  }
  vm.runInNewContext(client, { window, AbortController, console, fetch: async () => ({}) }, { filename: 'qdev-soup-client.js' })
  const registered = []
  moduleDeclaration.apply({
    slots: { inject: (_name, effect) => effect(), register: (options) => options },
    effect: () => {},
    configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({}), mutate: () => {} }) },
    uiConversation: { events: { register: (definition) => registered.push(definition) } },
  })
  const plain = (value) => JSON.parse(JSON.stringify(value))
  const [definition] = registered
  assert.equal(definition.kind, 'soup-tool-call')
  assert.equal(definition.target, 'soup-tools')

  const call = { type: 'tool/call', time: 100, seq: 1, data: { callId: 'c1', name: 'web_search', turn: 1, step: 1, arguments: {} } }
  const result = { type: 'tool/result', time: 250, seq: 2, data: { message: { source: { callId: 'c1' }, isError: true, content: [] } } }
  assert.deepEqual(plain(definition.match(call)), { id: 'c1', role: 'start' })
  assert.deepEqual(plain(definition.match(result)), { id: 'c1', role: 'update' })
  assert.equal(definition.match({ type: 'assistant/message', data: {} }), null)

  const started = definition.start({}, { event: call })
  assert.equal(started.name, 'web_search')
  assert.equal(started.startedAt, 100)
  const finished = definition.update({ state: started }, { event: result })
  assert.equal(finished.error, true)
  assert.equal(finished.endedAt, 250)
})
