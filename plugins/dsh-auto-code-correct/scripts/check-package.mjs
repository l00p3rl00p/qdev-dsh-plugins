import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const errors = []
function check(ok, message) { if (!ok) errors.push(message) }
const bundle = pkg.dsh?.bundle
check(bundle?.patch === './cordis.patch.yml', 'Native DSH bundle patch must resolve to ./cordis.patch.yml')
check(pkg.name === 'dsh-auto-code-correct', 'Package name must match Cordis bundle name')
for (const path of ['lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/cli.js', 'cordis.patch.yml']) {
  check(existsSync(resolve(path)), 'Missing packaged file: ' + path)
}
check(pkg.exports?.['.']?.default === './lib/index.js', 'Host entry export mismatch')
check(pkg.exports?.['./client']?.default === './lib/client.js', 'Client entry export mismatch')

// A clean Host install is insufficient: Web resolves browser-side require() calls
// through its registered ModuleLoader, not Node's installed node_modules.
// Inspect the exact browser artifact packaged for installation, including CJS
// requires (which tsdown's deps.onlyImport does not check).
const clientText = readFileSync('lib/client.js', 'utf8')
// Regression: the native plugin Options/Settings page must register directly
// from the normal ConfigForms + slots services. Do not make this UI depend on
// readiness Remote activation; a Remote failure must not remove plugin settings.
const clientSource = readFileSync('src/client/index.tsx', 'utf8')
check(
  clientSource.includes("export const inject = ['slots', 'configForms']"),
  'ACC native settings client must inject slots + configForms directly',
)
check(
  clientSource.includes("ctx.configForms.get<Record<string, unknown>>('auto-code-correct')"),
  'ACC native settings page must bind the auto-code-correct ConfigForm directly',
)
check(
  clientSource.includes("ctx.configForms.whileServed(['auto-code-correct']"),
  'ACC native settings page must wait for its ConfigForm namespace',
)
check(
  clientSource.includes("ctx.slots.inject('plugins.bundle.config'"),
  'ACC native settings page must register through the native plugin config slot',
)
check(
  clientSource.includes("key: 'dsh-auto-code-correct'"),
  'ACC native settings page must register under the installed package key',
)

const allowedClientImports = new Set(['react', 'react/jsx-runtime'])
const browserRequirePattern = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
const scanBrowserRequires = (source) => [...source.matchAll(browserRequirePattern)].map((match) => match[1])
check(
  scanBrowserRequires('require("@deepseek-ai/dsh-typert-protocol/remote-info")').includes(
    '@deepseek-ai/dsh-typert-protocol/remote-info',
  ),
  'Browser dependency scanner regression: known unsupported require escaped detection',
)
const browserRequires = scanBrowserRequires(clientText)
const unsupported = [...new Set(browserRequires.filter((name) => !allowedClientImports.has(name)))]
check(
  unsupported.length === 0,
  'Web bundle has unresolved ModuleLoader imports: ' + unsupported.join(', ') +
    ' (bundle these dependencies instead of leaving browser-side require() calls)',
)
check(
  clientText.includes('window.__ModuleLoader__.load({ id: "dsh-auto-code-correct"'),
  'Web bundle does not register the native DSH loader ID',
)

// Exercise the exact emitted Web artifact inside a guarded ModuleLoader.
// This verifies the module factory runs, its imports resolve, and its contract
// is exported without starting a DSH server or claiming the React UI mounted.
const nodeRequire = createRequire(import.meta.url)
const loaded = []
try {
  runInNewContext(
    clientText,
    {
      window: {
        __ModuleLoader__: {
          load(definition) {
            const imports = (name) => {
              if (!allowedClientImports.has(name)) throw new Error('Unsupported Web import: ' + name)
              return nodeRequire(name)
            }
            loaded.push({ id: definition.id, exports: definition.factory(imports) })
          },
        },
      },
    },
    { filename: 'lib/client.js', timeout: 5000 },
  )
  check(loaded.length === 1 && loaded[0].id === 'dsh-auto-code-correct', 'Web ModuleLoader identity/registration failed')
  check(typeof loaded[0]?.exports?.apply === 'function', 'Web module does not export apply()')
  check(Array.isArray(loaded[0]?.exports?.inject), 'Web module does not export Cordis service injections')
} catch (error) {
  check(false, 'Web ModuleLoader smoke execution failed: ' + String(error))
}


check(pkg.bin?.['acc-tools'] === './lib/cli.js', 'CLI entry export mismatch')
const patch = readFileSync('cordis.patch.yml', 'utf8')
check(/^\s*name:\s*dsh-auto-code-correct\s*$/m.test(patch), 'Cordis patch must name the installed package')
check((pkg.files ?? []).includes('lib'), 'Published package must include lib directory')
check((pkg.files ?? []).includes('cordis.patch.yml'), 'Published package must include Cordis patch')
if (errors.length) {
  for (const error of errors) console.error('PACKAGE ERROR:', error)
  process.exitCode = 1
} else {
  console.log('Native DSH package contract OK: host, client, CLI, patch, metadata and build outputs')
}
