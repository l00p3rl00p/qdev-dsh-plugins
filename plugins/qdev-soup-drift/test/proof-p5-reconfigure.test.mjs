// P5: a settings change must not discard collected baseline/live windows.
// Real SOUP worker; no mocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector, PRESETS } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, sleep, until } from './proof-helpers.mjs'

test('P5a: preset change keeps baseline+partial window; next measurement uses the NEW threshold', opts, async () => {
  const evals = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 2, onEvaluation: (r) => evals.push(r.result) })
  d.observe('s', event(REF)); d.observe('s', event(REF + ' again')); d.observe('s', event(LIVE))
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 1, pending: false })
  d.reconfigure({ preset: 3 })
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 1, pending: false }, 'windows discarded by reconfigure')
  d.observe('s', event(LIVE + ' two'))
  await until(() => evals.length >= 1); d.dispose()
  assert.equal(evals.length, 1)
  assert.equal(evals[0].threshold, PRESETS[3])
})

test('P5b: baselineCount/windowCount changes keep collected items (extend promotes, shrink measures)', opts, async () => {
  const evals = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 3, onEvaluation: (r) => evals.push(r.result) })
  d.observe('s', event(REF)); d.observe('s', event(REF + ' b')); d.observe('s', event(LIVE)); d.observe('s', event(LIVE + ' b'))
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 2, pending: false })
  d.reconfigure({ baselineCount: 3 })
  assert.deepEqual(d.counts('s'), { baseline: 3, live: 1, pending: false }, 'extending baseline should promote the oldest live item')
  d.reconfigure({ baselineCount: 3, windowCount: 1 })
  await until(() => evals.length >= 1); d.dispose()
  assert.equal(evals.length, 1, 'shrinking the window should measure the kept live item')
})

test('P5c: a measurement in flight at reconfigure is neither lost nor double counted', opts, async () => {
  const evals = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, onEvaluation: (r) => evals.push(r.result) })
  d.observe('s', event(REF)); d.observe('s', event(LIVE))
  assert.equal(d.counts('s').pending, true)
  d.reconfigure({ preset: 4 })
  await until(() => evals.length >= 1); await sleep(1500)
  d.dispose()
  assert.equal(evals.length, 1, `expected exactly one evaluation, got ${evals.length}`)
  assert.equal(evals[0].threshold, PRESETS[4], 'result must be under the new threshold; old-threshold result must be discarded')
})

test('P5d: disable then enable keeps state; observations while disabled are ignored', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 3 })
  d.observe('s', event(REF)); d.observe('s', event(REF + ' b')); d.observe('s', event(LIVE))
  d.reconfigure({ enabled: false })
  d.observe('s', event(LIVE + ' ignored'))
  d.reconfigure({ enabled: true })
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 1, pending: false })
  d.dispose()
})

test('P5e: runtime preset change returns "not reset", keeps the window, next worker uses new threshold', opts, async () => {
  const evals = []
  const p = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 2, reanchoring: false, onEvaluation: (r) => evals.push(r.result) })
  p.observe('s', event(REF)); p.observe('s', event(LIVE))
  const reset = p.configure({ preset: 3 })
  assert.equal(reset, false, 'a threshold change is not a reset')
  p.observe('s', event(LIVE + ' two'))
  await until(() => evals.length >= 1); p.dispose()
  assert.equal(evals.length, 1)
  assert.equal(evals[0].threshold, PRESETS[3])
})

// Review finding: configure() ran detector.reconfigure BEFORE `settings = next`, so the fence still saw
// enabled=false and swallowed the evaluationStart/observation published by the re-enable itself.
test('P5f: re-enable with a window made full while disabled delivers start, observation and result', opts, async () => {
  const starts = []
  const observations = []
  const evals = []
  const p = createPluginRuntime({
    python: PY, preset: 0, baselineCount: 1, windowCount: 3, reanchoring: false,
    onEvaluationStart: (e) => starts.push(e), onObservation: (e) => observations.push(e), onEvaluation: (r) => evals.push(r.result),
  })
  p.observe('s', event(REF)); p.observe('s', event(LIVE)); p.observe('s', event(LIVE + ' two'))
  assert.equal(starts.length, 0, 'window of 3 is not full yet')
  p.configure({ enabled: false })
  p.configure({ windowCount: 2 }) // while disabled: the live window of 2 is now full
  assert.equal(starts.length, 0, 'nothing may be measured while disabled')
  const before = observations.length
  p.configure({ enabled: true })
  assert.equal(starts.length, 1, 'evaluationStart for the re-enabled full window was swallowed by the fence')
  assert.ok(observations.length > before, 'the observation published by the re-enable was swallowed by the fence')
  await until(() => evals.length >= 1)
  p.dispose()
  assert.equal(evals.length, 1, 'evaluation result did not arrive')
})
