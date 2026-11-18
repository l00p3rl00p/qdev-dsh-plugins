// SOUP Core independence: input -> official SOUP -> result, with every consumer absent, disabled or failing.
// Uses the REAL soup_worker.py; set SOUP_TEST_PYTHON to an interpreter that has official soup-cli (default python3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { measureDrift, PRESETS } from '../soup-core.mjs'
import { createPluginRuntime } from '../runtime.mjs'

const python = process.env.SOUP_TEST_PYTHON ?? 'python3'
const here = (f) => new URL(`../${f}`, import.meta.url)
const importsOf = (f) => [...readFileSync(here(f), 'utf8').matchAll(/^\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])

test('core and detector import nothing but Node built-ins and the core itself', () => {
  assert.deepEqual(importsOf('soup-core.mjs').filter((m) => !m.startsWith('node:')), [])
  assert.deepEqual(importsOf('drift.mjs').filter((m) => !m.startsWith('node:')), ['./soup-core.mjs'])
})

test('measureDrift alone returns the SOUP result with no other module loaded', async () => {
  const result = await measureDrift({
    python,
    reference: ['the cat sat on the mat', 'the cat sat on the mat again'],
    live: ['quantum chromodynamics lattice gauge theory', 'renormalization group flow'],
    threshold: PRESETS[2],
  })
  assert.equal(result.drift_detected, true)
  assert.equal(result.threshold, PRESETS[2])
  assert.equal(typeof result.kl_divergence, 'number')
})

test('every consumer throwing cannot stop the detector from producing evaluations', async () => {
  const boom = () => { throw new Error('consumer failure') }
  const evaluations = [], errors = []
  const runtime = createPluginRuntime({
    python, baselineCount: 1, windowCount: 1,
    onEvaluation: (v) => evaluations.push(v), onError: (e, c) => errors.push(c),
    notify: boom, inject: boom, escalate: boom, onObservation: boom, onEvaluationStart: boom, onMentorStateChange: boom,
  })
  const turn = { type: 'turn/start', data: { turn: 1 } }
  const intent = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'plan' }] } }
  const say = (text) => ({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text }] } } })
  runtime.replay('c', [intent, turn])
  runtime.observe('c', say('the cat sat on the mat'))
  runtime.observe('c', say('quantum chromodynamics lattice gauge theory'))
  for (let i = 0; i < 100 && !evaluations.length; i++) await new Promise((r) => setTimeout(r, 100))
  runtime.dispose()
  assert.equal(evaluations.length, 1)
  assert.ok(errors.some((c) => c?.phase?.startsWith('consumer:')))
})

test('mentor and detector-independent: reanchoring off still yields core evaluations', async () => {
  const evaluations = []
  const runtime = createPluginRuntime({ python, baselineCount: 1, windowCount: 1, reanchoring: false, onEvaluation: (v) => evaluations.push(v) })
  const say = (text) => ({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text }] } } })
  runtime.observe('c', say('the cat sat on the mat'))
  runtime.observe('c', say('the cat sat on the mat'))
  for (let i = 0; i < 100 && !evaluations.length; i++) await new Promise((r) => setTimeout(r, 100))
  runtime.dispose()
  assert.equal(evaluations.length, 1)
})
