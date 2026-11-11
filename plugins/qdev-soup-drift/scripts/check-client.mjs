// Static guard for DSH Web ModuleLoader import availability.
// Node/npm resolution does not apply inside the browser's custom loader.
import { readFileSync, existsSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const text = readFileSync('client.js', 'utf8')
const requires = [...text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1])
const unsupported = [...new Set(requires.filter((value) => value !== 'react'))]
const errors = []
// Git installs run no build: pnpm blocks lifecycle scripts, so dist/ ships committed instead.
for (const name of ['prepare', 'preinstall', 'install', 'postinstall']) {
  if (pkg.scripts?.[name]) errors.push(`SOUP must not define a ${name} script; the Git install cannot run it`)
}
const packedFiles = ['dist/index.js', 'client.js', 'locale/en.json', 'icon.svg',
  'drift.mjs', 'reanchor.mjs', 'runtime.mjs', 'soup_worker.py', 'cordis.patch.yml']
for (const file of packedFiles) {
  if (!existsSync(file)) errors.push('Missing built package asset: ' + file)
  const declared = (pkg.files ?? []).some((entry) =>
    entry === file ||
    entry === file.split('/')[0] ||
    (entry.endsWith('/*.json') && file.startsWith(entry.slice(0, -6)) && file.endsWith('.json'))
  )
  if (!declared) errors.push('Asset is omitted by package files: ' + file)
}
if (pkg.main !== './dist/index.js' || pkg.exports?.['.'] !== './dist/index.js') {
  errors.push('SOUP Host export must resolve to the compiled runtime entry')
}
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') {
  errors.push('SOUP Cordis bundle patch not declared')
}

if (unsupported.length) errors.push('Unregistered Web imports: ' + unsupported.join(', '))
if (!text.includes('window.__ModuleLoader__.load(')) errors.push('Missing DSH Web module loader registration')
if (!text.includes("id: 'qdev-trajectory-drift-soup'")) errors.push('DSH Web loader package ID mismatch')
if (pkg.exports?.['./client'] !== './client.js') errors.push('Incorrect package client export')
if (pkg.dsh?.client?.platform !== 'web' || pkg.dsh?.client?.immediately !== true) {
  errors.push('Missing required DSH Web client boot metadata')
}
if (!text.includes('Yes — reset to 0') || !text.includes('No — carry 3 forward')) {
  errors.push('Missing clickable drift reset decision controls')
}
if (!text.includes("method: 'POST'") || !text.includes("'x-qdev-soup-action': 'reset-drift-count'")) {
  errors.push('Drift reset controls are not wired to the Host action')
}
if (!text.includes('averageKlDivergence') || !text.includes('averageThresholdRatio') || !text.includes('KL is the difference between recent output and the baseline')) {
  errors.push('Missing human-readable average drift readout')
}
if (!text.includes("ctx.slots.inject('settings.section'") || !text.includes("id: 'soup-trajectory-drift'") || !text.includes("inject: ['slots', 'configForms']") || !text.includes('ctx.configForms.get(ENTRY)')) {
  errors.push('Missing native DSH Settings section or direct configForms.get() wiring')
}
if (text.includes('qdev-soup-drift#qdev-trajectory-drift-soup')) {
  errors.push('Obsolete duplicate bundle alias remains registered in the Web client')
}
const allowedThemeTokens = new Set([
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
])
const themeTokens = [...new Set(text.match(/--dsw-[a-zA-Z0-9-]+/g) ?? [])]
const unsupportedThemeTokens = themeTokens.filter((token) => !allowedThemeTokens.has(token))
if (unsupportedThemeTokens.length) errors.push('Unknown DSH theme tokens: ' + unsupportedThemeTokens.join(', '))
// Smoke execute the shipped client under a guarded DSH-style ModuleLoader.
// This is not a full browser UI/session test; it does prove the factory loads.
const loaded = []
try {
  runInNewContext(
    text,
    {
      window: {
        __ModuleLoader__: {
          load(definition) {
            const exposed = definition.factory((name) => {
              if (name !== 'react') throw new Error('Unexpected Web module: ' + name)
              // React is supplied by DSH Web, not this package's Node dependencies.
              // Only plugin initialization is smoke-tested; no component is rendered.
              return {
                createElement() {}, useCallback(value) { return value }, useEffect() {},
                useMemo(value) { return value() }, useState() {}, useSyncExternalStore() {},
              }
            })
            loaded.push({ id: definition.id, exports: exposed })
          },
        },
      },
    },
    { filename: 'client.js', timeout: 5000 },
  )
  if (loaded.length !== 1 || loaded[0].id !== 'qdev-trajectory-drift-soup') errors.push('Web loader registration failed')
  if (typeof loaded[0]?.exports?.apply !== 'function') errors.push('Missing Web client apply export')
  if (!Array.isArray(loaded[0]?.exports?.inject)) errors.push('Missing Web Cordis client injection list')
  const registrations = []
  const fakeContext = {
    configForms: { get() { return { getSnapshot() {}, subscribe() { return () => {} }, mutate() {} } } },
    effect(factory) { factory() },
    slots: {
      inject(name, factory) { registrations.push({ kind: 'inject', name }); factory() },
      register(options) { registrations.push({ kind: 'register', ...options }); return () => {} },
    },
  }
  loaded[0]?.exports?.apply(fakeContext)
  if (!registrations.some(item => item.kind === 'register' && item.name === 'settings.section' && item.id === 'soup-trajectory-drift')) {
    errors.push('Native Settings section did not register under smoke execution')
  }
  if (!registrations.some(item => item.kind === 'register' && item.name === 'plugins.row.config' && item.key === 'qdev-trajectory-drift-soup#qdev-trajectory-drift-soup')) {
    errors.push('Canonical Plugin Manager row configuration did not register under smoke execution')
  }
} catch (error) {
  errors.push('Web client smoke execution failed: ' + String(error))
}
if (errors.length > 0) {
  for (const problem of errors) console.error('SOUP WEB PACKAGE ERROR:', problem)
  process.exit(1)
}
console.log('SOUP browser module imports, identity and metadata OK:', requires)
