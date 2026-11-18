// The SOUP monitor inside a real Host with ONLY the `agents` service: no storage, web server, user questions,
// Connection or persistence. Real Cordis, Loader, Session and the real Python worker. Run with SOUP_PYTHON set to
// an interpreter that has official soup-cli.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'

const HOST_URL = new URL('../dist/index.js', import.meta.url)
const PYTHON = process.env.SOUP_PYTHON || 'python3'

test('agents-only Host delivers a real drift value and stays alive', async (t) => {
  const ctx = new Context()
  const session = Session.create('alone')
  ctx.provide('agents', { list: () => [], get: () => ({ id: 'alone', session, inject() {} }), create() { assert.fail('no') } })
  assert.equal(ctx.get('storageDomain'), undefined)
  assert.equal(ctx.get('webServer'), undefined)
  assert.equal(ctx.get('userQuestions'), undefined)
  const signals = []
  ctx.on('qdev-soup/signal', (signal) => signals.push(signal))
  await ctx.plugin(Loader, { baseUrl: HOST_URL.href })
  await ctx.loader.create({ id: 'alone', name: HOST_URL.href, config: {
    python: PYTHON, enabled: true, detectorEnabled: true, reanchoring: true, preset: 2, baselineCount: 1, windowCount: 1 } })
  await ctx.loader.await()
  const entry = ctx.loader.resolve('alone')
  await entry.fiber.await()
  t.after(() => ctx.fiber.dispose())
  assert.equal(entry.fiber.state, 2, 'Host did not activate with only the agents service')

  const send = (type, data) => {
    const event = ['user/message', 'assistant/message'].includes(type) ? session.append(type, data, { surfaceOp: 'append' }) : session.append(type, data)
    ctx.emit('session/event', session, event)
  }
  const say = (text) => send('assistant/message', { turn: 1, step: 1, stream: [],
    message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text }] }) })
  send('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Fix the drift monitor.' }] }))
  send('turn/start', { turn: 1 })
  say('keep following the original implementation plan')
  say('keep following the original implementation plan')
  const deadline = Date.now() + 15000
  while (!signals.length && Date.now() < deadline) await delay(20)
  assert.equal(signals.length, 1, 'no drift value was delivered')
  assert.equal(signals[0].sessionId, 'alone')
  assert.equal(signals[0].driftDetected, false)
  assert.equal(signals[0].klDivergence, 0)
  assert.equal(signals[0].threshold, 0.2)
  say('banana bread recipe with walnuts')
  say('banana bread recipe with walnuts')
  while (signals.length < 2 && Date.now() < deadline) await delay(20)
  assert.equal(signals.length, 2)
  assert.equal(signals[1].driftDetected, true)
  assert.ok(signals[1].klDivergence > signals[1].threshold)
  assert.equal(entry.fiber.state, 2, 'Host died after drift with no consumer services')
})
