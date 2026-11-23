// Item 2 - each component OWNS its settings definition (detector-settings.mjs, mentor-settings.mjs);
// session-settings.mjs only composes them. Stored key names and the Config surface stay unchanged.
// Real SOUP worker for the behavioural tests; skipped visibly without SOUP_PYTHON.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as sessionSettings from '../session-settings.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, until, sleep } from './proof-helpers.mjs'

const load = (path) => import(path).catch(() => null)
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const LEGACY_KEYS = ['python', 'enabled', 'detectorEnabled', 'reanchoring', 'preset', 'baselineCount', 'windowCount']

test('each component owns a settings module with its own fields, defaults and enable flag', async () => {
  const detector = await load('../detector-settings.mjs')
  const mentor = await load('../mentor-settings.mjs')
  assert.ok(detector, 'detector-settings.mjs must exist')
  assert.ok(mentor, 'mentor-settings.mjs must exist')
  assert.deepEqual(Object.keys(detector.detectorSettings.fields).sort(), ['baselineCount', 'detectorEnabled', 'preset', 'python', 'windowCount'])
  assert.deepEqual(Object.keys(mentor.mentorSettings.fields), ['reanchoring'])
  assert.equal(detector.detectorSettings.enableKey, 'detectorEnabled')
  assert.equal(mentor.mentorSettings.enableKey, 'reanchoring')
  assert.deepEqual(mentor.mentorSettings.defaults, { reanchoring: true })
  assert.deepEqual(detector.detectorSettings.defaults, { python: 'python3', detectorEnabled: true, preset: 2, baselineCount: 4, windowCount: 4 })
})

test('session-settings composes the components: same seven stored keys, one owner each', async () => {
  assert.ok(sessionSettings.SETTING_OWNERS, 'session-settings must export SETTING_OWNERS')
  assert.deepEqual(Object.keys(sessionSettings.SETTING_OWNERS).sort(), [...LEGACY_KEYS].sort())
  assert.deepEqual(sessionSettings.SETTING_OWNERS.reanchoring, 'mentor')
  for (const key of ['python', 'detectorEnabled', 'preset', 'baselineCount', 'windowCount']) assert.equal(sessionSettings.SETTING_OWNERS[key], 'detector', key)
  assert.equal(sessionSettings.SETTING_OWNERS.enabled, 'master')
})

test('component defaults compose to exactly the cordis.patch.yml surface', async () => {
  const detector = await load('../detector-settings.mjs')
  const mentor = await load('../mentor-settings.mjs')
  assert.ok(detector && mentor, 'component modules must exist')
  const yaml = Object.fromEntries(read('cordis.patch.yml').split('\n').map((line) => line.match(/^\s{8}(\w+): (\S+)$/)).filter(Boolean)
    .map(([, key, value]) => [key, value === 'true' ? true : value === 'false' ? false : Number(value)]))
  const composed = { enabled: true, ...detector.detectorSettings.defaults, ...mentor.mentorSettings.defaults }
  delete composed.python // python's default lives in the Config schema ('python3'), not in the patch
  assert.deepEqual(composed, yaml)
})

test('component modules do not know each other, and the detector never imports Mentor settings', () => {
  const importsOf = (file) => read(file).split('\n').filter((line) => /^\s*import\b/.test(line)).join('\n')
  assert.doesNotMatch(importsOf('detector-settings.mjs'), /mentor/i)
  assert.doesNotMatch(importsOf('mentor-settings.mjs'), /detector|drift/i)
  assert.doesNotMatch(importsOf('drift.mjs'), /mentor|settings|reanchor/i)
  assert.doesNotMatch(read('drift.mjs').replace(/\/\/.*$/gm, ''), /reanchoring/, 'drift.mjs must not read any Mentor setting')
})

test('a detector configuration is derived from detector settings alone', async () => {
  const detector = await load('../detector-settings.mjs')
  assert.ok(detector, 'detector-settings.mjs must exist')
  const effective = { python: 'p', enabled: true, detectorEnabled: true, reanchoring: false, preset: 1, baselineCount: 2, windowCount: 3 }
  assert.deepEqual(detector.detectorSettings.toDetectorConfig(effective), { python: 'p', preset: 1, baselineCount: 2, windowCount: 3, enabled: true })
  assert.equal(detector.detectorSettings.toDetectorConfig({ ...effective, detectorEnabled: false }).enabled, false)
  assert.equal(detector.detectorSettings.toDetectorConfig({ ...effective, enabled: false }).enabled, false)
  assert.deepEqual(detector.detectorSettings.toDetectorConfig({ ...effective, reanchoring: true }), detector.detectorSettings.toDetectorConfig(effective), 'a Mentor setting changed the detector config')
})

test('global values are normalized by the component that owns them (clamping unchanged)', async () => {
  const detector = await load('../detector-settings.mjs')
  const mentor = await load('../mentor-settings.mjs')
  assert.ok(detector && mentor, 'component modules must exist')
  assert.deepEqual(detector.detectorSettings.normalize({ python: 'x', detectorEnabled: undefined, preset: 9.7, baselineCount: 0, windowCount: 500 }),
    { python: 'x', detectorEnabled: true, preset: 4, baselineCount: 1, windowCount: 100 })
  assert.deepEqual(detector.detectorSettings.normalize({}), detector.detectorSettings.defaults)
  assert.deepEqual(mentor.mentorSettings.normalize({ reanchoring: undefined }), { reanchoring: true })
  assert.deepEqual(mentor.mentorSettings.normalize({ reanchoring: false }), { reanchoring: false })
})

// ---- behaviour with the real worker ----
const userMsg = { type: 'user/message', data: { id: '1', source: { kind: 'user' }, content: [{ type: 'text', text: 'Stay with the plan' }] } }
function rig(extra = {}) {
  const log = { starts: 0, evals: [], injected: [], errors: [] }
  const runtime = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    inject: (x) => log.injected.push(x), escalate: () => {}, onEvaluationStart: () => { log.starts += 1 },
    onEvaluation: (r) => log.evals.push(r), onError: (e, d) => log.errors.push(d), ...extra })
  runtime.observe('s', { type: 'turn/start', data: { turn: 1 } }); runtime.observe('s', userMsg)
  return { runtime, log }
}

test('a Mentor-only change does not reconfigure the detector: the in-flight measurement is neither cancelled nor repeated', opts, async () => {
  const { runtime, log } = rig()
  runtime.observe('s', event(REF)); runtime.observe('s', event(LIVE))
  assert.equal(runtime.isEvaluating('s'), true)
  runtime.configure({ reanchoring: false })       // Mentor-only, while the worker is running
  await until(() => log.evals.length >= 1); await sleep(300)
  runtime.dispose()
  assert.equal(log.starts, 1, 'the Mentor change restarted the measurement')
  assert.equal(log.evals.length, 1)
  assert.equal(log.injected.length, 0, 'Mentor was switched off before the result arrived')
  assert.deepEqual(log.errors, [])
})

test('a Mentor-only change does not touch collected windows', opts, async () => {
  const observations = []
  const { runtime, log } = rig({ baselineCount: 2, windowCount: 3, onObservation: (x) => observations.push(x) })
  for (const text of [REF, REF, LIVE, LIVE]) runtime.observe('s', event(text))
  const last = observations.at(-1)
  assert.deepEqual([last.baselineSize, last.windowSize, last.pending], [2, 2, false])
  const published = observations.length
  runtime.configure({ reanchoring: false })
  runtime.configure({ reanchoring: true })
  assert.equal(observations.length, published, 'a Mentor-only change republished/reset detector state')
  assert.equal(log.starts, 0)
  runtime.observe('s', event(LIVE))                // 2 kept + 1 new = a full window of 3: measured exactly once
  await until(() => log.evals.length >= 1); await sleep(200)
  runtime.dispose()
  assert.equal(log.starts, 1)
  assert.equal(log.evals[0].result.n_live, 3, 'the kept window was not used')
  assert.equal(log.evals[0].result.n_reference, 2)
})

test('the detector measures identically whatever the Mentor setting is', opts, async () => {
  const results = []
  for (const reanchoring of [true, false]) {
    const { runtime, log } = rig({ reanchoring })
    runtime.observe('s', event(REF)); runtime.observe('s', event(LIVE))
    await until(() => log.evals.length >= 1); await sleep(100)
    runtime.dispose()
    results.push(log.evals[0])
  }
  assert.deepEqual(results[0], results[1])
})

test('a detector-only change does not reset Mentor strikes (existing behaviour kept)', opts, async () => {
  const { runtime, log } = rig()
  runtime.observe('s', event(REF)); runtime.observe('s', event(LIVE))
  await until(() => runtime.mentorState('s').driftCount === 1)
  runtime.configure({ preset: 1 })                  // detector-only
  runtime.configure({ windowCount: 2 })             // detector-only
  assert.equal(runtime.mentorState('s').driftCount, 1)
  runtime.configure({ detectorEnabled: false }); runtime.configure({ detectorEnabled: true })
  assert.equal(runtime.mentorState('s').driftCount, 1)
  runtime.dispose()
  assert.equal(log.injected.length, 1)
})
