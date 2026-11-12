import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createPluginRuntime } from '../runtime.mjs'

const start = { type: 'turn/start', data: { turn: 1 } }
const intent = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep the original plan.' }] } }
const assistant = (text) => ({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text }] } } })
const history = [intent, start, assistant('original baseline')]

function harness(options = {}) {
  const workers = [], observations = [], evaluations = [], notices = [], reminders = [], escalations = [], errors = []
  const runtime = createPluginRuntime({
    python: 'test-python', baselineCount: 1, windowCount: 1,
    onObservation: (value) => observations.push(value),
    onEvaluation: (value) => evaluations.push(value),
    notify: (value) => notices.push(value),
    inject: (value) => reminders.push(value),
    escalate: (value) => escalations.push(value),
    onError: (error) => errors.push(error),
    spawnProcess() {
      const worker = new EventEmitter()
      worker.stdout = new EventEmitter()
      worker.stderr = new EventEmitter()
      worker.stdin = { end(input) { worker.request = JSON.parse(input) } }
      worker.kill = () => { worker.killed = true; return true }
      worker.complete = (drift = true) => {
        worker.stdout.emit('data', JSON.stringify({ drift_detected: drift, kl_divergence: 1, threshold: worker.request.threshold }))
        worker.emit('close', 0)
      }
      workers.push(worker)
      return worker
    },
    ...options,
  })
  runtime.replay('chat', history)
  return { runtime, workers, observations, evaluations, notices, reminders, escalations, errors }
}

test('master OFF stops observation, cancels work, and rejects late worker output even after ON', () => {
  const h = harness()
  try {
    h.runtime.observe('chat', assistant('drift'))
    const stale = h.workers[0]
    h.runtime.configure({ enabled: false })
    assert.equal(stale.killed, true)
    const count = h.observations.length
    h.runtime.observe('chat', assistant('ignored while disabled'))
    h.runtime.replay('chat', history)
    assert.equal(h.observations.length, count)
    assert.equal(h.workers.length, 1)
    assert.equal(h.runtime.decideDriftReset('chat', true).accepted, false)
    h.runtime.configure({ enabled: true })
    h.runtime.replay('chat', history)
    stale.complete()
    assert.equal(h.evaluations.length, 0)
    assert.equal(h.notices.length, 0)
    assert.equal(h.reminders.length, 0)
    h.runtime.observe('chat', assistant('new drift'))
    h.workers.at(-1).complete()
    assert.equal(h.evaluations.length, 1)
    assert.equal(h.reminders.length, 1)
  } finally { h.runtime.dispose(); for (const worker of h.workers) worker.emit('close', 0) }
})

test('sensitivity and window changes reach the next worker and invalidate the old comparison', () => {
  const h = harness()
  try {
    h.runtime.observe('chat', assistant('old comparison'))
    const stale = h.workers[0]
    h.runtime.configure({ preset: 4, baselineCount: 2, windowCount: 2 })
    h.runtime.replay('chat', [...history, assistant('second reference')])
    h.runtime.observe('chat', assistant('new window one'))
    assert.equal(h.workers.length, 1)
    h.runtime.observe('chat', assistant('new window two'))
    const current = h.workers[1]
    assert.equal(current.request.threshold, 0.4)
    assert.equal(current.request.reference.length, 2)
    assert.equal(current.request.live.length, 2)
    stale.complete()
    assert.equal(h.evaluations.length, 0)
    current.complete(false)
    assert.equal(h.evaluations.length, 1)
    assert.equal(h.notices.length, 0)
  } finally { h.runtime.dispose(); for (const worker of h.workers) worker.emit('close', 0) }
})

test('settings changes and replay preserve two reminders and the third-drift intervention guard', () => {
  const h = harness()
  try {
    for (let i = 0; i < 2; i++) {
      h.runtime.observe('chat', assistant('drift'))
      h.workers.at(-1).complete()
    }
    assert.equal(h.runtime.mentorState('chat').driftCount, 2)
    h.runtime.configure({ enabled: false })
    h.runtime.configure({ enabled: true, preset: 3 })
    h.runtime.replay('chat', history)
    assert.equal(h.runtime.mentorState('chat').driftCount, 2)
    h.runtime.observe('chat', assistant('third drift'))
    h.workers.at(-1).complete()
    assert.equal(h.reminders.length, 2)
    assert.equal(h.escalations.length, 1)
    assert.equal(h.runtime.mentorState('chat').decisionPending, true)
  } finally { h.runtime.dispose(); for (const worker of h.workers) worker.emit('close', 0) }
})

test('Gentle Mentor and detector switches update independently without resetting strike state', () => {
  const h = harness()
  try {
    h.runtime.configure({ reanchoring: false })
    h.runtime.observe('chat', assistant('observed but not injected'))
    h.workers.at(-1).complete()
    assert.equal(h.notices.length, 1)
    assert.equal(h.reminders.length, 0)
    h.runtime.configure({ reanchoring: true })
    h.runtime.observe('chat', assistant('mentor restored'))
    h.workers.at(-1).complete()
    assert.equal(h.reminders.length, 1)
    h.runtime.configure({ detectorEnabled: false })
    h.runtime.observe('chat', assistant('no worker'))
    assert.equal(h.workers.length, 2)
    assert.equal(h.runtime.mentorState('chat').driftCount, 1)
    h.runtime.configure({ detectorEnabled: true })
    h.runtime.replay('chat', history)
    h.runtime.observe('chat', assistant('detector restored'))
    h.workers.at(-1).complete()
    assert.equal(h.reminders.length, 2)
    assert.deepEqual(h.errors, [])
  } finally { h.runtime.dispose(); for (const worker of h.workers) worker.emit('close', 0) }
})
