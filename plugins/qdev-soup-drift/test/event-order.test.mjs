// L2: events of one session are delivered in measurement order: the next window's evaluationStart must not be
// published before the previous window's evaluation has been delivered to every subscriber.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDetector } from '../drift.mjs'
import { PY, opts, event, REF, LIVE, until } from './proof-helpers.mjs'

test('L2: evaluationStart(n+1) comes after evaluation(n)', opts, async () => {
  const order = []
  const d = createDetector({ python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onEvaluationStart: () => order.push('start'), onEvaluation: () => order.push('evaluation') })
  d.observe('s', event(REF)); d.observe('s', event(LIVE)); d.observe('s', event(LIVE)); d.observe('s', event(LIVE))
  await until(() => order.filter((x) => x === 'evaluation').length >= 3, 30000)
  d.dispose()
  assert.deepEqual(order, ['start', 'evaluation', 'start', 'evaluation', 'start', 'evaluation'])
})
