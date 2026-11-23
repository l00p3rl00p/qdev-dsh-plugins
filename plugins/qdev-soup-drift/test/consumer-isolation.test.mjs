// Consumer isolation: a failing consumer (notify, Mentor, onEvaluation, onError) must never be
// reported as a parse failure, stop another consumer, or stall the next measurement.
// Uses the REAL SOUP Python worker (no mocks / fake spawn). Skipped visibly without SOUP_PYTHON.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDetector} from '../drift.mjs';
import {createPluginRuntime} from '../runtime.mjs';

const PY = process.env.SOUP_PYTHON;
const opts = {skip: PY ? false : 'SOUP_PYTHON with soup_cli not set'};
const event = (text, turn = 1) => ({type: 'assistant/message', data: {turn, message: {content: [{type: 'text', text}]}}});
const userMsg = {type: 'user/message', data: {id: '1', source: {kind: 'user'}, content: [{type: 'text', text: 'Stay with the plan'}]}};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 8000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(30);
  return cond();
}
const REF = 'keep following the plan';
const LIVE = 'different unrelated output topic';

test('drift.mjs: throwing onDrift is not reported as a parse failure', opts, async () => {
  const errors = [], evals = [];
  const d = createDetector({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onEvaluation: (r) => evals.push(r), onDrift: () => { throw new Error('consumer boom') }, onError: (e, det) => errors.push(det)});
  d.observe('s', event(REF)); d.observe('s', event(LIVE));
  await until(() => evals.length >= 1 && errors.length >= 1); await sleep(200);
  d.dispose();
  assert.equal(evals.length, 1);
  assert.equal(errors.filter((e) => e.phase === 'parse').length, 0);
  assert.equal(errors.filter((e) => e.phase === 'consumer').length, 1);
});

test('drift.mjs: throwing onEvaluation does not stop onDrift or the next measurement', opts, async () => {
  let evals = 0, drifts = 0;
  const d = createDetector({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onEvaluation: () => { evals++; throw new Error('eval boom') }, onDrift: () => { drifts++ }, onError: () => {}});
  d.observe('s', event(REF)); d.observe('s', event(LIVE));
  await until(() => drifts >= 1);
  assert.equal(drifts, 1);
  d.observe('s', event(LIVE));
  await until(() => evals >= 2);
  d.dispose();
  assert.equal(evals, 2);
});

test('drift.mjs: throwing onError does not crash or stall the detector', opts, async () => {
  let evals = 0;
  const d = createDetector({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onEvaluation: () => { evals++ }, onDrift: () => { throw new Error('consumer boom') }, onError: () => { throw new Error('reporter boom') }});
  d.observe('s', event(REF)); d.observe('s', event(LIVE));
  await until(() => evals >= 1);
  d.observe('s', event(LIVE));
  await until(() => evals >= 2);
  d.dispose();
  assert.equal(evals, 2);
});

// Shared runtime harness: observe a user message + turn, then a baseline and a drifting window.
async function runRuntime(overrides = {}) {
  const log = {injected: [], notices: 0, errors: [], results: []};
  const p = createPluginRuntime({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    inject: (x) => { log.injected.push(x) }, escalate: () => {}, notify: () => { log.notices++ },
    onEvaluation: (r) => log.results.push(r.result), onError: (e, det) => log.errors.push({e, ...det}), ...overrides(log)});
  p.observe('s', {type: 'turn/start', data: {turn: 1}});
  p.observe('s', userMsg);
  p.observe('s', event(REF)); p.observe('s', event(LIVE));
  await until(() => log.results.length >= 1); await sleep(300);
  p.dispose();
  return log;
}

test('runtime: throwing notify does not suppress Mentor', opts, async () => {
  const log = await runRuntime((l) => ({notify: () => { l.notices++; throw new Error('notify boom') }}));
  assert.equal(log.injected.length, 1);
  assert.equal(log.errors.filter((e) => e.phase === 'consumer' && e.consumer === 'notify').length, 1);
  assert.equal(log.errors.filter((e) => e.phase === 'parse').length, 0);
});

test('runtime: throwing Mentor does not suppress notify or invalidate the measurement', opts, async () => {
  const log = await runRuntime((l) => ({inject: () => { throw new Error('mentor boom') }}));
  assert.equal(log.notices, 1);
  assert.equal(log.results.length, 1);
  assert.equal(log.errors.filter((e) => e.consumer === 'mentor').length, 1);
});

test('runtime: measurement is identical with consumers healthy, throwing, or absent', opts, async () => {
  const healthy = await runRuntime(() => ({}));
  const throwing = await runRuntime(() => ({notify: () => { throw new Error('n') }, inject: () => { throw new Error('i') }}));
  const absent = await runRuntime(() => ({reanchoring: false}));
  assert.equal(healthy.results.length, 1);
  assert.deepEqual(throwing.results, healthy.results);
  assert.deepEqual(absent.results, healthy.results);
});

test('a successful drift with healthy consumers still reports once', opts, async () => {
  let evals = 0, drifts = 0, errs = 0;
  const d = createDetector({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onEvaluation: () => { evals++ }, onDrift: () => { drifts++ }, onError: () => { errs++ }});
  d.observe('s', event(REF)); d.observe('s', event(LIVE));
  await until(() => evals >= 1); await sleep(200);
  d.dispose();
  assert.deepEqual([evals, drifts, errs], [1, 1, 0]);
});

// A throwing observer (onObservation) must not crash the process, stall the queue, or skip consumers.
test('drift.mjs: throwing onObservation does not crash or stall the next measurement', opts, async () => {
  let evals = 0; const errors = [];
  const d = createDetector({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onObservation: () => { throw new Error('observer boom') },
    onEvaluation: () => { evals++ }, onError: (e, det) => errors.push(det)});
  d.observe('s', event(REF)); d.observe('s', event(LIVE));
  await until(() => evals >= 1);
  d.observe('s', event(LIVE));
  await until(() => evals >= 2);
  d.dispose();
  assert.equal(evals, 2);
  assert.equal(errors.filter((e) => e.phase === 'parse').length, 0);
  assert.ok(errors.some((e) => e.phase === 'consumer' && e.consumer === 'observation'));
});

// A throwing onEvaluationStart must not leave the session pending forever.
test('drift.mjs: throwing onEvaluationStart does not wedge the session', opts, async () => {
  let evals = 0;
  const d = createDetector({python: PY, preset: 0, baselineCount: 1, windowCount: 1,
    onEvaluationStart: () => { throw new Error('start boom') },
    onEvaluation: () => { evals++ }, onError: () => {}});
  d.observe('s', event(REF)); d.observe('s', event(LIVE));
  await until(() => evals >= 1);
  d.observe('s', event(LIVE));
  await until(() => evals >= 2);
  d.dispose();
  assert.equal(evals, 2);
});
