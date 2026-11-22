// P3 in the real Host: an event that should reach a monitor but cannot (no live agent for the session) is
// COUNTED in status.detector.droppedEvents and diagnosed once (phase 'drop'); it is never silently skipped.
// Unlike a chat that is turned OFF (decision A), which is ignored without a count.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, BASELINE, DRIFT } from './host-fixture.mjs'
import { opts } from './proof-helpers.mjs'

test('P3 Host: events for a session with no live agent are counted and diagnosed once', opts, async (t) => {
  const f = await fixture(t, { baselineCount: 1, windowCount: 1, preset: 0 })
  f.live.delete(f.agent.id)                       // the session exists, but no agent can receive for it
  f.assistant(BASELINE); f.assistant(DRIFT); f.assistant(DRIFT)
  const s = (await f.request()).body
  assert.equal(s.detector.droppedEvents, 3)
  assert.equal(s.errors.filter((e) => e.phase === 'drop').length, 1, 'exactly one drop diagnostic per session')
  assert.equal(s.detector.state === 'error', false, 'a drop diagnostic is not a measurement failure')
  assert.equal(s.detector.evaluations, 0)
})
