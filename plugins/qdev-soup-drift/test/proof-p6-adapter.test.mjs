// P6: the core takes normalized {text, turn}; a small adapter owns the DSH event shape.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { PY, opts, event, obs, REF, LIVE, until } from './proof-helpers.mjs'

// Oracle: the pre-refactor assistantText from drift.mjs (copied verbatim from commit 8999cb7).
function oldAssistantText(event) {
  if (event?.type !== 'assistant/message' || event.data?.interrupted) return ''
  return (event.data?.message?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
    .slice(0, 100000)
}
const cases = [
  event('hello', 3),
  { type: 'assistant/message', data: { interrupted: true, turn: 1, message: { content: [{ type: 'text', text: 'x' }] } } },
  { type: 'user/message', data: { message: { content: [{ type: 'text', text: 'x' }] } } },
  { type: 'assistant/message', data: { turn: 2, message: { content: [{ type: 'tool_use' }, { type: 'text', text: 'a' }, { type: 'text', text: ' b ' }] } } },
  { type: 'assistant/message', data: { turn: 1.5, message: { content: [{ type: 'text', text: 'frac turn' }] } } },
  { type: 'assistant/message', data: { turn: '4', message: { content: [{ type: 'text', text: 'string turn' }] } } },
  { type: 'assistant/message', data: { message: { content: [] } } },
  { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'z'.repeat(100100) }] } } },
  { type: 'assistant/message' }, null, undefined, {},
]

test('P6a: adapter maps DSH events identically to the old assistantText (and turn rule)', async () => {
  const { assistantText, toObservation } = await import('../soup-core.mjs')
  for (const c of cases) {
    const old = oldAssistantText(c)
    assert.equal(assistantText(c), old)
    const o = toObservation(c)
    if (!old) assert.equal(o, null)
    else assert.deepEqual(o, { text: old, turn: Number.isInteger(c.data?.turn) ? c.data.turn : null })
  }
})

test('P6b: core measures plain {text, turn} observations with the real worker', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1 })
  d.observeText('s', obs(REF, 7)); d.observeText('s', obs(LIVE, 7))
  await until(() => d.lastReport('s'))
  const r = d.lastReport('s')   // read before dispose(): dispose clears detector state
  d.dispose()
  assert.ok(r)
  assert.equal(r.turn, 7); assert.equal(r.singleTurn, true)
  assert.equal(r.result.drift_detected, true)
})

test('P6c: seedTexts builds the baseline from plain observations; the core ignores raw DSH events', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 2 })
  d.seedTexts('s', [obs('a'), obs('b'), obs('c')])
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 0, pending: false })
  // A DSH-shaped event is not a normalized observation: the core must not interpret it.
  d.observeText('s', event('would-be live text'))
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 0, pending: false })
  d.dispose()
})

test('P6d: observe(id, event) and seed(id, events) still work via the adapter', opts, async () => {
  const d = createDetector({ python: PY, preset: 0, baselineCount: 2, windowCount: 2 })
  d.seed('s', [event('a'), { type: 'user/message', data: {} }, event('b'), event('c')])
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 0, pending: false })
  d.observe('s', event('live1'))
  assert.deepEqual(d.counts('s'), { baseline: 2, live: 1, pending: false })
  d.dispose()
})
