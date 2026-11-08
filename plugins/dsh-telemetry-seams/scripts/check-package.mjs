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

// 3. No unsupported Node-only static require() in client.js
//    (node: builtins are never available in the DSH web loader)
check('client.js has no Node built-in require() calls', () => {
  const src = requireFile('lib/client.js')
  const nodeRequire = /require\(['"]node:/g
  const matches = src.match(nodeRequire) ?? []
  if (matches.length > 0) {
    throw new Error(`found ${matches.length} require('node:...) call(s) in browser bundle`)
  }
})

// 4. Locale metadata
check('locale/en.json has meta.title and meta.description', () => {
  const raw = requireFile('locale/en.json')
  const locale = JSON.parse(raw)
  if (!locale?.meta?.title) throw new Error('missing meta.title')
  if (!locale?.meta?.description) throw new Error('missing meta.description')
  if (locale.meta.title === 'My Decoration') throw new Error('title is still template copy')
})

// 5. Icon
check('icon.svg exists and contains <svg', () => {
  const src = requireFile('icon.svg')
  if (!src.includes('<svg')) throw new Error('icon.svg does not look like SVG')
})

// 6. Patch
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
