#!/usr/bin/env node
// Build ACC once, then pack a self-contained npm tarball for DSH's native installer.
// The installed tarball never needs to run the Git source package's prepare script.
// Run from the ACC package root: node scripts/package-installable.mjs
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const target = resolve(root, 'dist', 'installable')
const required = [
  'package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/index.d.ts',
  'lib/client.js', 'lib/cli.js', 'lib/typert.host.js', 'lib/typert.remote-client.js',
]
function run(cmd, args) {
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env })
}
function fail(message) { throw new Error('[ACC package] ' + message) }
if (pkg.name !== 'dsh-auto-code-correct') fail('Wrong plugin package')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') fail('Missing DSH bundle patch')
for (const hook of ['preinstall', 'install', 'postinstall']) {
  if (pkg.scripts?.[hook]) fail('Install-time hook is not allowed: ' + hook)
}
console.log('[ACC package] Building and verifying canonical source')
run('pnpm', ['run', 'verify'])
for (const file of required) if (!existsSync(resolve(root, file))) fail('Missing build output: ' + file)
mkdirSync(target, { recursive: true })
console.log('[ACC package] Packing without lifecycle scripts')
const output = execFileSync('npm', [
  'pack', '--ignore-scripts', '--json', '--pack-destination', target
], { cwd: root, encoding: 'utf8', env: process.env })
const result = JSON.parse(output)
if (result.length !== 1) fail('Expected exactly one npm pack result')
const archive = result[0]
const listed = new Set(archive.files.map(f => f.path))
for (const file of required) if (!listed.has(file)) fail('Missing from tarball: ' + file)
if (archive.name !== pkg.name || archive.version !== pkg.version) fail('Package identity/version mismatch')
const tarball = resolve(target, archive.filename)
if (!existsSync(tarball)) fail('Tarball was not written: ' + tarball)
const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex')
writeFileSync(tarball + '.sha256', sha256 + '  ' + archive.filename + '\n')
console.log('[ACC package] Ready: ' + tarball)
console.log('[ACC package] SHA256: ' + sha256)
console.log('[ACC package] DSH install target is this prebuilt .tgz, NOT github: source.')
