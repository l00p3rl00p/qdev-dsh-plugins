/**
 * Post-build package health check for dsh-telemetry-seams.
 *
 * Verifies:
 * 1. Required built files exist (lib/index.js, lib/client.js, lib/index.d.ts)
 * 2. client.js has the correct __ModuleLoader__.load banner
 * 3. client.js has no unsupported static require() calls for Node-only modules
 * 4. locale/en.json has meta.title and meta.description
 * 5. icon.svg exists and is valid SVG
 * 6. cordis.patch.yml exists
 *
 * Exit 0 = pass. Exit 1 = fail with diagnostics.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

function check(label, fn) {
  try {
    fn()
  } catch (err) {
    errors.push(`${label}: ${err.message}`)
  }
}

function requireFile(rel) {
  const p = join(ROOT, rel)
  if (!existsSync(p)) throw new Error(`missing: ${p}`)
  return readFileSync(p, 'utf8')
}

// 1. Required built files
check('lib/index.js exists', () => requireFile('lib/index.js'))
check('lib/client.js exists', () => requireFile('lib/client.js'))
check('lib/index.d.ts exists', () => requireFile('lib/index.d.ts'))

// 2. Client banner
check('client.js has __ModuleLoader__.load banner', () => {
  const src = requireFile('lib/client.js')
  if (!src.includes('window.__ModuleLoader__.load')) {
    throw new Error('banner missing window.__ModuleLoader__.load')
  }
  if (!src.includes('"dsh-telemetry-seams"') && !src.includes("'dsh-telemetry-seams'")) {
    throw new Error('banner missing plugin id dsh-telemetry-seams')
  }
})

// 3. Browser imports must exist in the native DSH ModuleLoader.
// Reject *all* unsupported require() imports, not just Node built-ins.
const allowedClientImports = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-conversation',
])
const browserRequires = (text) => [...text.matchAll(/\brequire\(\s*['\"]([^'\"]+)['\"]\s*\)/g)].map((match) => match[1])
check('browser require scanner recognizes known unsupported import', () => {
  if (!browserRequires('require("@deepseek-ai/dsh-typert-protocol/remote-info")').includes('@deepseek-ai/dsh-typert-protocol/remote-info')) {
    throw new Error('browser import scanner missed a known broken module')
  }
})
check('client.js has only DSH-provided browser require() imports', () => {
  const unsupported = [...new Set(browserRequires(requireFile('lib/client.js')).filter((name) => !allowedClientImports.has(name)))]
  if (unsupported.length) throw new Error('unsupported browser imports: ' + unsupported.join(', '))
})

// 4. Validate the browser artifact by executing its native loader registration.
check('emitted client registers a valid DSH Web factory', () => {
  const loaded = []
  const requireFromPlugin = createRequire(import.meta.url)
  runInNewContext(requireFile('lib/client.js'), {
    window: {
      __ModuleLoader__: {
        load(definition) {
          const imports = (name) => {
            if (!allowedClientImports.has(name)) throw new Error('unsupported DSH Web import ' + name)
            return requireFromPlugin(name)
          }
          loaded.push({ id: definition.id, exports: definition.factory(imports) })
        },
      },
    },
  }, { filename: 'lib/client.js', timeout: 5000 })
  if (loaded.length !== 1 || loaded[0].id !== 'dsh-telemetry-seams' || typeof loaded[0].exports?.apply !== 'function') {
    throw new Error('missing expected plugin ID or exported apply()')
  }
})

// 5. Check Remote client/Host argument-count agreement at the source boundary.
check('probe Remote contract uses zero arguments and child injection', () => {
  const client = requireFile('src/client/index.tsx')
  const contract = requireFile('src/remote-client.ts')
  const host = requireFile('src/inventory-service.ts')
  if (!client.includes("'remote.telemetrySeamsInventory'], (scope) =>")) throw new Error('missing child-injected Remote scope')
  if (!client.includes('scope.remote.telemetrySeamsInventory.probe()')) throw new Error('client must invoke probe with zero arguments')
  if (client.includes('scope.remote.telemetrySeamsInventory.probe(signal)')) throw new Error('client passes an undeclared AbortSignal')
  if (!contract.includes('probe(): Promise<RemoteResult<SeamInventory>>') || !/parameters:\s*\[\]/.test(contract)) throw new Error('Typert descriptor must declare zero arguments')
  if (!host.includes('async probe(): Promise<SeamInventory>')) throw new Error('Host must expose zero-argument probe')
})

// 6. Locale metadata
check('locale/en.json has meta.title and meta.description', () => {
  const raw = requireFile('locale/en.json')
  const locale = JSON.parse(raw)
  if (!locale?.meta?.title) throw new Error('missing meta.title')
  if (!locale?.meta?.description) throw new Error('missing meta.description')
  if (locale.meta.title === 'My Decoration') throw new Error('title is still template copy')
})

// 7. Icon
check('icon.svg exists and contains <svg', () => {
  const src = requireFile('icon.svg')
  if (!src.includes('<svg')) throw new Error('icon.svg does not look like SVG')
})

// 8. Patch
check('cordis.patch.yml exists', () => requireFile('cordis.patch.yml'))

// Report
if (errors.length > 0) {
  console.error('\n❌ Package check failed:\n')
  for (const e of errors) console.error('  •', e)
  console.error()
  process.exit(1)
} else {
  console.log('✅ Package check passed')
}
