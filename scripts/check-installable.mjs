#!/usr/bin/env node
// Checks that every DSH plugin under plugins/ can be installed straight from a Git commit:
//   dsh plugin --profile web add 'github:<owner>/<repo>#<SHA>&path:/plugins/<dir>'
// That install path does NOT build anything, so the commit itself must contain a runnable package.
// No dependencies; run from the repository root:  node scripts/check-installable.mjs [plugin-dir ...]
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'plugins'
// pnpm refuses to run these for Git-hosted packages (ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED).
const BLOCKED_SCRIPTS = ['prepare', 'preinstall', 'install', 'postinstall']
// Harness-owned packages: the running Harness supplies them. Bundling a copy breaks service identity.
const HARNESS_OWNED = /^(@deepseek-ai\/(dsh-|cordis$)|react$|react-dom$)/

const tracked = (path) => {
  try { execFileSync('git', ['ls-files', '--error-unmatch', path], { stdio: 'ignore' }); return true } catch { return false }
}

// Collect concrete file targets from main/bin/exports. Wildcard patterns and type-only targets are skipped.
function entryFiles(pkg) {
  const out = new Map()
  const add = (label, target) => {
    if (typeof target !== 'string' || target.includes('*') || target.endsWith('.d.ts')) return
    out.set(target.replace(/^\.\//, ''), label)
  }
  add('main', pkg.main)
  if (typeof pkg.bin === 'string') add('bin', pkg.bin)
  else for (const [name, target] of Object.entries(pkg.bin ?? {})) add(`bin.${name}`, target)
  const walk = (label, node, key = '') => {
    if (key === 'types') return
    if (typeof node === 'string') add(label, node)
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(label, v, k)
  }
  if (typeof pkg.exports === 'string') add('exports', pkg.exports)
  else for (const [key, node] of Object.entries(pkg.exports ?? {})) if (key !== './package.json') walk(`exports["${key}"]`, node)
  add('dsh.bundle.patch', pkg.dsh?.bundle?.patch)
  return out
}

function checkPlugin(dir) {
  const problems = []
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (!pkg.dsh) return null // not a DSH plugin package

  for (const name of BLOCKED_SCRIPTS) {
    if (pkg.scripts?.[name]) problems.push(`scripts.${name} exists: Git installs cannot run build scripts. Remove it and commit the built output.`)
  }
  for (const [file, label] of entryFiles(pkg)) {
    const path = join(dir, file)
    if (!existsSync(path)) problems.push(`${label} -> ${file}: file is missing. Build and commit it.`)
    else if (!tracked(path)) problems.push(`${label} -> ${file}: file exists but is not committed (ignored or untracked). Use git add -f.`)
    else if (pkg.files && !pkg.files.some((item) => {
      const base = item.replace(/^\.\//, '').replace(/\/?\*.*$/, '')
      return file === base || file.startsWith(`${base}/`) || base === ''
    })) problems.push(`${label} -> ${file}: not covered by the "files" list, so a packed tarball would omit it.`)
  }
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (HARNESS_OWNED.test(name)) problems.push(`dependencies.${name}: Harness-owned. Move to peerDependencies with peerDependenciesMeta.optional = true.`)
  }
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    if (HARNESS_OWNED.test(name) && pkg.peerDependenciesMeta?.[name]?.optional !== true) {
      problems.push(`peerDependencies.${name}: must be optional in peerDependenciesMeta.`)
    }
  }
  if (!pkg.dsh.bundle?.patch) problems.push('dsh.bundle.patch is not declared.')

  const clientExport = pkg.exports?.['./client']
  const clientFile = typeof clientExport === 'string' ? clientExport : clientExport?.default
  if (clientFile) {
    if (pkg.dsh.client?.platform !== 'web') problems.push('./client is exported but dsh.client.platform is not "web".')
    const path = join(dir, clientFile)
    if (existsSync(path)) {
      const source = readFileSync(path, 'utf8')
      if (!source.includes('window.__ModuleLoader__.load')) problems.push(`${clientFile}: not in the Harness browser loader format.`)
      else if (!new RegExp(`id:\\s*["']${pkg.name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["']`).test(source)) {
        problems.push(`${clientFile}: loader id does not match package name "${pkg.name}".`)
      }
    }
  }
  return { name: pkg.name, version: pkg.version, problems }
}

const requested = process.argv.slice(2)
const dirs = (requested.length ? requested : readdirSync(ROOT).map((name) => join(ROOT, name)))
  .filter((dir) => existsSync(join(dir, 'package.json')) && statSync(dir).isDirectory())

let failed = 0, checked = 0
for (const dir of dirs) {
  const result = checkPlugin(dir)
  if (!result) continue
  checked += 1
  if (result.problems.length === 0) {
    console.log(`PASS  ${dir}  (${result.name}@${result.version})`)
  } else {
    failed += 1
    console.log(`FAIL  ${dir}  (${result.name}@${result.version})`)
    for (const problem of result.problems) console.log(`      - ${problem}`)
  }
}
if (checked === 0) { console.log(`No DSH plugin packages found under ${ROOT}/`); process.exit(1) }
console.log(`\n${checked - failed} of ${checked} plugin package(s) installable from a Git commit.`)
process.exit(failed ? 1 : 0)
