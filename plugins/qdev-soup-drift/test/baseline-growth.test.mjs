// Decision C: when baselineCount GROWS at runtime the new baseline slots are filled with the EARLIEST
// available history (the material the old replace-the-detector path seeded), never with the next
// arriving events, and no message is used twice (baseline, live window, in-flight window).
// Real SOUP worker; the spawn wrapper only RECORDS the real worker's stdin, it does not replace it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createDetector } from '../drift.mjs'
import { createPluginRuntime } from '../runtime.mjs'
import { PY, opts, sleep, until } from './proof-helpers.mjs'
import { fixture, BASELINE, DRIFT } from './host-fixture.mjs'

const T = {
  m1: 'keep following the plan step one', m2: 'keep following the plan step two',
  m3: 'keep following the plan step three', m4: 'keep following the plan step four',
  m5: 'keep following the plan step five', m6: 'keep following the plan step six',
  m7: 'different unrelated output topic', m8: 'different unrelated output topic again',
}
const ob = (n, turn = 1) => ({ text: T['m' + n], turn, seq: n })
// Records what the REAL worker was given (reference/live) while still running the real process.
function recordingSpawn(sent) {
  return (...args) => {
    const child = spawn(...args)
    const end = child.stdin.end.bind(child.stdin)
    child.stdin.end = (data) => { sent.push(JSON.parse(data)); return end(data) }
    return child
  }
}

test('C1: growth fills from the EARLIEST history; the later drifting message is not in the baseline and is still detected', opts, async () => {
  const sent = []
  const evals = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 2,
    spawnProcess: recordingSpawn(sent), onEvaluation: (r) => evals.push(r) })
  const history = [1, 2, 3, 4, 5, 6, 7].map((n) => ob(n))
  for (const o of history) d.observeText('s', o)          // m1,m2 baseline; (m3,m4) and (m5,m6) measured; m7 live
  await until(() => evals.length >= 2); await sleep(300)
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 1, pending: false })
  sent.length = 0; evals.length = 0
  d.reconfigure({ baselineCount: 4 }, { history: () => history })
  assert.deepEqual(d.counts('s'), { baseline: 4, live: 1, pending: false }, 'growth did not fill the new slots from history now')
  d.observeText('s', ob(8))                                // completes the live window (m7, m8)
  await until(() => evals.length >= 1); d.dispose()
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].reference, [T.m1, T.m2, T.m3, T.m4], 'baseline must be the earliest history')
  assert.deepEqual(sent[0].live, [T.m7, T.m8], 'live window must be untouched by the growth')
  assert.equal(sent[0].reference.includes(T.m7), false, 'the later drifting message leaked into the baseline')
  assert.equal(evals[0].result.drift_detected, true, 'a later drifting message must still be detected')
})

test('C2: no message is used twice (live items move, they are not copied) and a short history leaves slots open', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 3 })
  for (const n of [1, 2, 3, 4]) d.observeText('s', ob(n))   // m1,m2 baseline; m3,m4 live (window of 3 not full)
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 2, pending: false })
  d.reconfigure({ baselineCount: 3 }, { history: () => [1, 2, 3, 4].map((n) => ob(n)) })
  assert.deepEqual(d.counts('s'), { baseline: 3, live: 1, pending: false }, 'm3 must MOVE to the baseline, not be copied')
  d.reconfigure({ baselineCount: 6 }, { history: () => [1, 2, 3, 4].map((n) => ob(n)) })
  assert.deepEqual(d.counts('s'), { baseline: 4, live: 0, pending: false }, 'only unused history may fill; the rest stays open')
  d.dispose()
})

test('C2b: consumed (already measured) history fills before a live item; the live item is not used twice', opts, async () => {
  const evals = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 2, onEvaluation: (r) => evals.push(r) })
  const history = [1, 2, 3, 4, 5].map((n) => ob(n))
  for (const o of history) d.observeText('s', o)            // m1,m2 baseline; (m3,m4) measured; m5 live
  await until(() => evals.length >= 1); await sleep(300)
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 1, pending: false })
  d.reconfigure({ baselineCount: 3 }, { history: () => history })
  assert.deepEqual(d.counts('s'), { baseline: 3, live: 1, pending: false }, 'earliest unused history (m3) must fill, m5 must stay live')
  d.dispose()
})

test('C3: growth while the chat is off is owed and filled from history when it is turned back on', opts, async () => {
  const sent = []
  const evals = []
  const p = createPluginRuntime({ python: PY, preset: 0, baselineCount: 1, windowCount: 1, reanchoring: false,
    spawnProcess: recordingSpawn(sent), onEvaluation: (r) => evals.push(r) })
  const events = [1, 2, 3, 4].map((n) => ({ type: 'assistant/message', seq: n, data: { turn: 1, message: { content: [{ type: 'text', text: T['m' + n] }] } } }))
  for (const e of events.slice(0, 3)) p.observe('s', e)     // m1 baseline; m2,m3 measured
  await until(() => evals.length >= 2); await sleep(300)
  p.configure({ enabled: false })
  p.configure({ baselineCount: 3 })                         // grows while off, no history available yet
  p.configure({ enabled: true }, { history: () => events })
  sent.length = 0
  p.observe('s', { type: 'assistant/message', seq: 5, data: { turn: 1, message: { content: [{ type: 'text', text: T.m7 }] } } })
  await until(() => sent.length >= 1); p.dispose()
  assert.ok(sent.length >= 1, 'the next event was swallowed into the open baseline slots instead of being measured')
  assert.deepEqual(sent[0].reference, [T.m1, T.m2, T.m3], 'owed growth was filled with later events instead of earliest history')
})

test('C4: Host - baseline growth refills from the earliest session history and a later drift is still detected', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0, reanchoring: false })
  f.start()
  f.assistant(BASELINE)                                      // m1 -> baseline
  f.assistant(BASELINE + ' step two')                        // m2 -> measured
  f.assistant(BASELINE + ' step three')                      // m3 -> measured
  await f.until((s) => s.detector.evaluations === 2, 'history windows were not measured')
  f.assistant(DRIFT)                                         // m4: a later drifting message, measured
  await f.until((s) => s.detector.evaluations === 3, 'drifting message was not measured')
  await f.update({ baselineCount: 3 })
  const grown = await f.status()
  assert.equal(grown.trajectory.baselineSize, 3, 'new baseline slots were not filled from history at growth time')
  assert.equal(grown.trajectory.windowSize, 0)
  f.assistant(DRIFT + ' continues')                          // must be MEASURED, not swallowed into the baseline
  const s = await f.until((x) => x.detector.evaluations === 4, 'next message filled the baseline instead of being measured')
  assert.equal(s.detector.lastResult.driftDetected, true, 'drift against the earliest-history baseline was not detected')
  assert.equal(s.trajectory.baselineSize, 3)
})
