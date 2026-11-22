// Decision A ("Off is off"): a disabled or suspended session SILENTLY ignores events. This is the
// intended behaviour, so these tests PIN it: no count, no diagnostic, no measurement while off.
// Real SOUP worker and the real built Host; nothing is mocked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, event, REF, LIVE, sleep, until } from './proof-helpers.mjs'
import { fixture, BASELINE, DRIFT } from './host-fixture.mjs'

test('A0: a disabled detector core keeps its counts and emits nothing for events while off', opts, async () => {
  // Unfenced subscribers on the core itself: this is the layer that actually decides "ignore".
  const seen = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1 })
  for (const kind of ['observation', 'evaluationStart', 'evaluation', 'error']) d.subscribe(kind, () => seen.push(kind))
  d.observe('s', event(REF)); d.observe('s', event(LIVE))
  await until(() => seen.includes('evaluation'))
  d.reconfigure({ enabled: false })
  const counts = d.counts('s')
  const emitted = seen.length
  for (let i = 0; i < 4; i += 1) d.observe('s', event(LIVE + ' ' + i))
  await sleep(1200)
  assert.deepEqual(d.counts('s'), counts, 'events while off changed the collected counts')
  assert.equal(seen.length, emitted, 'events while off emitted something (observation, measurement or diagnostic)')
  d.dispose()
})

test('A1: a disabled runtime ignores events silently (no observation, start, evaluation or error callback)', opts, async () => {
  const seen = { observation: 0, start: 0, evaluation: 0, error: 0 }
  const p = createPluginRuntime({
    python: PY, preset: 0, baselineCount: 1, windowCount: 1, reanchoring: false,
    onObservation: () => { seen.observation += 1 }, onEvaluationStart: () => { seen.start += 1 },
    onEvaluation: () => { seen.evaluation += 1 }, onError: () => { seen.error += 1 },
  })
  // Positive control: while ON the same events ARE observed and measured.
  p.observe('s', event(REF)); p.observe('s', event(LIVE))
  await until(() => seen.evaluation >= 1)
  assert.equal(seen.evaluation, 1, 'control: an enabled runtime must measure')
  const on = { ...seen }
  p.configure({ enabled: false })
  const afterOff = { ...seen }   // turning off itself may publish; only events after this are "while off"
  for (let i = 0; i < 4; i += 1) p.observe('s', event(LIVE + ' ' + i))
  await sleep(1500)               // long enough for any (wrongly) started real worker to finish
  assert.deepEqual(seen, afterOff, 'events while off produced a callback (count, diagnostic or measurement)')
  assert.equal(seen.error, on.error, 'ignoring while off must not emit a diagnostic')
  assert.equal(p.isEvaluating('s'), false)
  p.dispose()
})

test('A2: Host with a suspended runtime (agent gone) ignores later events: no measurement, no drop count, no diagnostic', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0 })
  f.start(); f.assistant(BASELINE)
  await f.evaluate()
  const before = await f.status()
  assert.equal(before.trajectory.baselineSize, 1)
  // The receiving agent goes away: the retained runtime is suspended (configure enabled=false).
  f.live.delete(f.agent.id)
  f.ctx.emit('agent/disposed', { agent: f.agent })
  for (let i = 0; i < 3; i += 1) f.assistant(DRIFT)
  await sleep(1500)
  const after = await f.status()   // fixture.status also asserts errors === [] (no diagnostic)
  assert.equal(after.detector.evaluations, before.detector.evaluations, 'a suspended runtime measured an event')
  assert.equal(after.detector.droppedEvents, 0, 'ignoring while suspended must not count as a drop')
  assert.equal(after.trajectory.baselineSize, before.trajectory.baselineSize)
  assert.equal(after.trajectory.windowSize, before.trajectory.windowSize)
  assert.equal(after.detector.state === 'running', false, 'no measurement may be running while suspended')
  assert.deepEqual(after.errors, [])
})
