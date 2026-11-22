import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// DSH throws when a plugin reads a service it did not declare in inject. The client must never touch
// ctx.uiConversation while it is undeclared, or activation fails. This test uses a context that throws on access.
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

test('apply does not read an undeclared service (uiConversation); activation must not throw', () => {
  let moduleDeclaration
  const window = {
    __ModuleLoader__: { load(declaration) { moduleDeclaration = declaration.factory(() => React) } },
    setInterval: () => 1,
    clearInterval: () => {},
  }
  vm.runInNewContext(client, { window, AbortController, console, fetch: async () => ({}) }, { filename: 'qdev-soup-client.js' })
  const ctx = {
    slots: { inject: (_name, effect) => effect(), register: (options) => options },
    effect: () => {},
    configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({}), mutate: () => {} }) },
    get uiConversation() { throw new Error('service uiConversation was not declared in inject') },
  }
  assert.doesNotThrow(() => moduleDeclaration.apply(ctx))
})
