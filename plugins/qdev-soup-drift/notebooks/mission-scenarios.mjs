// SOUP MISSION scenarios - black box, public boundary only.
//
// WHAT IS REAL: the built package entry (package.json main -> dist/index.js) mounted by the real Cordis
//   Loader/Context, real @deepseek-ai/dsh-session events, the REAL soup_worker.py and the REAL official soup_cli.
// WHAT IS A STAND-IN: only the external DSH services the plugin injects (agents, storageDomain, webServer,
//   userQuestions). They are in-memory stand-ins; they are NOT a real DeepSeek Harness.
// WHAT IS ASSERTED: only observable outcomes - the status route JSON, messages injected into the agent,
//   the escalation question, and events received by independent peer plugins that use ONLY ctx.on.
// TRUSTED GIVEN: the official SOUP worker / soup_cli is NOT evaluated here. Scenarios use it but never grade its
//   scores, false-alarm behaviour or tokenisation; where a scenario needs a drift it says so as a precondition.
// NOT DONE: no import of any plugin module, no private helper is called, nothing of SOUP is mocked.
//
// WHAT A PASS MEANS (read this before trusting a verdict):
//   Each check has a scope. 'plugin' (the default) observes what the real plugin, real Loader/Context and real worker
//   do. 'standin' observes something that only the in-memory stand-in services can show: what was handed to the
//   stand-in agent's inject(), a question object held by the stand-in userQuestions, an `agent/inbox/spliced` event
//   that THIS SCRIPT emits itself, or an `agent/created` event emitted by this script. None of that shows what a real
//   Harness agent, inbox, question dialog or chat does.
//   A requirement listed in REAL_BOUNDARY below is a claim about that real behaviour. Its PASS is therefore never
//   awarded from stand-in checks: it is reported NOT-PROVEN (with the plugin-side result kept in the text). A FAIL is
//   always kept as FAIL, because a stand-in that already shows a wrong behaviour is real evidence of a defect.
//
// Usage (inside the harness container, cwd = a staged copy of the plugin that ALSO contains this file,
// because the bare imports below resolve from the plugin's node_modules):
//   SOUP_PYTHON=<venv python> node mission-scenarios.mjs --label 0.6.3 [--only ID,ID]
// Output: one line per requirement:  RESULT {json}   and a final  SUMMARY {json}
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'

const PLUGIN_DIR = process.cwd()
const PYTHON = process.env.SOUP_PYTHON || 'python3'
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1] }
const LABEL = opt('label', 'build')
const ONLY = opt('only', '') ? new Set(opt('only').split(',')) : null
const pkg = JSON.parse(readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8'))
const ENTRY = new URL(`file://${join(PLUGIN_DIR, pkg.main)}`).href
const STATUS_PATH = '/qdev-soup-drift/status'
const ACTIVE = 2 // Cordis FiberState.ACTIVE (const enum, erased from the JS exports)

// ---- the requirements: statement, source record, how well the source is established -------------------
// sourceKind: 'record' (OmniGraph item read this session) | 'doc' (plugin doc) | 'user' (user-stated, no record found)
const R = {
  'P1': ['Detection is not coupled to Gentle Mentor: measuring continues identically when Mentor is switched off or its delivery fails.', 'user problem 1; iss-soup-recovery-boundaries acceptance ("drift core runs with mentor ... absent, disabled or throwing")', 'record'],
  'P2': ['The host (src/index.ts) is not one oversized file.', 'user problem 2; dec-soup-host-split-into-modules (1105-line index.ts split)', 'record'],
  'P3': ['Events are never silently lost: when no agent resolves, they are counted and visible in status.', 'user problem 3 (user-stated, no graph record found)', 'user'],
  'P4': ['Status cannot hide recent drift: after 40 healthy evaluations a drifting window shows as drifting.', 'user problem 4 (user-stated, no graph record found)', 'user'],
  'P5': ['Changing sensitivity mid-conversation keeps the collected windows and applies the new threshold.', 'user problem 5 (user-stated, no graph record found)', 'user'],
  'P6': ['The detector is independent of the DSH event shape.', 'user problem 6; dec-soup-core-primitive (contract input->result, node builtins only)', 'record'],
  'P7': ['A failing consumer (sync throw or async reject) is never reported as a worker/parse failure and never harms SOUP, Mentor or other consumers.', 'user problem 7; dec-soup-core-primitive ("failure-isolate consumers")', 'record'],
  'A1': ['SOUP is the first producer of a FACT (calculation, score, threshold, drift flag): an independent peer receives it for healthy AND drifting windows.', 'ARCHITECTURE.md "Producer and consumers" (owner direction)', 'doc'],
  'A2': ['Gentle Mentor is ONE consumer; status and others are peers: with Mentor off, the fact still reaches a peer and the status route.', 'ARCHITECTURE.md "Producer and consumers"', 'doc'],
  'A3': ['SOUP does not need to know which components exist: a peer registered BEFORE SOUP loads and one added AFTER both receive the same facts.', 'ARCHITECTURE.md "producer does not know which components exist"', 'doc'],
  'A4': ['A BRAND NEW consumer can be added with ZERO changes to SOUP code (package bytes identical before and after).', 'ARCHITECTURE.md "added or removed without rebuilding the producer"', 'doc'],
  'A5': ['Components own behaviour and configuration: a Mentor-only change leaves detector windows/measurement untouched; a detector-only change does not reset Mentor strikes.', 'ARCHITECTURE.md section 2 "Component-owned settings"', 'doc'],
  'A6': ['A consumer\'s output becomes derived evidence for another consumer: Mentor interventions are published and reference the drift fact they answered.', 'ARCHITECTURE.md section 3 "Derived evidence"', 'doc'],
  'A7': ['Host/Cordis mechanisms are reused (no new bus/SDK): the fact reaches a peer through plain ctx.on on the native context.', 'ARCHITECTURE.md sections 4-5 "No new event bus ... SDK"', 'doc'],
  'M1': ['The plugin delivers a drift fact to consumers (status route and an independent peer) when the SOUP worker reports drift_detected. The worker itself is a trusted given and is not judged.', 'product mission (user-stated, no graph record found); ARCHITECTURE.md "Producer and consumers"', 'user'],
  'M2': ['The human is reminded twice, then asked to clarify on the third drift (Gentle Mentor three-strike policy).', 'SOUP_CONCEPTS.md "Gentle Mentor Intervention"', 'doc'],
  'M3': ['Off means off: master OFF = no events counted, no measurement, no reminder, no question; the partial/in-flight window is kept and measured once on re-enable.', 'README "master OFF ... counters must stop"', 'doc'],
  'P8': ['The older qdev-soup/signal channel is isolated like the versioned ones: a peer that throws or rejects on it cannot stop SOUP counting, Mentor or other peers, and is reported as a consumer failure.', 'scorecard finding on 0.10.0 (user-stated fix; 0.9.0 channel kept)', 'user'],
  'M7': ['A reminder Gentle Mentor decides on still reaches the chat: it is queued in the agent inbox, listed as pending, and shown as delivered once the Harness confirms the inbox splice.', 'Mentor actions refactor (separating what Mentor decides from how it is carried out); README "Runtime status"', 'doc'],
  'M5': ['The user can SEE the state in the status route: configuration, progress, last result, drift counts, reminders, escalation, errors.', 'README "Runtime status"; product mission', 'doc'],
  'M6': ['Settings saved by an old release load unchanged (no errors, same values, still measures).', 'user scenario list; ARCHITECTURE.md section 2 "existing saved configuration loads as before"', 'doc'],
}

// Requirements that are claims about REAL Harness behaviour, and the real boundary each one needs. These can only be
// PASS when a real Harness exercised that boundary, which this script cannot do; see "WHAT A PASS MEANS" above.
const REAL_BOUNDARY = {
  M2: 'the real agent inbox receiving the reminders and the real question dialog shown to the human',
  M7: 'the real agent inbox, the Harness splice confirmation (here emitted by this script) and the real chat transcript',
}

// ---- conversation corpora (natural language; used with the default sizes baseline 4 / window 4 / threshold 0.2)
const ON = [
  'I will implement cursor based pagination for the orders endpoint first. The handler reads the limit and cursor query parameters, validates them, and passes them to the repository so the database returns a stable page of orders.',
  'Next I am updating the orders repository so it sorts by created time and order id, which keeps the cursor stable. The query now fetches one extra row to tell whether another page of orders exists.',
  'The orders endpoint now returns the items together with a next cursor field. I added validation for the limit parameter, rejecting values above one hundred so callers cannot request huge pages of orders.',
  'I am writing tests for the orders pagination handler. They cover the first page, the middle pages, the last page, an invalid cursor, and a limit that is too large for the endpoint.',
  'Following the plan I now update the API documentation for the orders endpoint so the cursor and limit parameters are described, along with the next cursor field in the response body.',
  'The repository tests pass. I am checking that the cursor decoding in the orders handler rejects malformed values and returns a clear validation error instead of a server failure.',
  'I reviewed the orders pagination query plan and added a composite index on created time and order id so that the cursor lookup stays fast for large tables of orders.',
  'Continuing with the plan, I wired the pagination parameters into the orders client library so callers can iterate through all pages of orders using the next cursor field.',
  'I ran the full orders handler test suite again after the index migration. Every pagination test passes and the cursor validation errors are reported clearly to the caller.',
  'The last step of the plan is a changelog entry for the orders pagination change, describing the cursor and limit parameters and the new next cursor field in the response.',
  'I am double checking the orders endpoint behaviour when the cursor refers to a deleted order. The handler should still return the following page of orders using the sort keys.',
  'Finally I rebased the orders pagination branch, resolved a small conflict in the handler, and re ran the tests so the cursor and limit validation are verified once more.',
]
const OFF = [
  'By the way, the best way to bake sourdough bread is to feed the starter twice a day, then fold the dough every thirty minutes during a long cold fermentation overnight.',
  'Honestly I would also recommend visiting Lisbon in spring; the trams, the custard tarts and the river views make it one of the most relaxing cities for a weekend trip.',
  'Speaking of weekends, the football season starts soon and the new striker has scored in every pre season match, so supporters are hopeful about the championship race.',
  'For the garden, tomatoes need full sun, regular watering and a tall stake, and basil planted nearby keeps the leaves healthy while making summer salads taste wonderful.',
]
const BASE = ON.slice(0, 4)                                              // the 4-message baseline
const MARGINAL = [BASE[0].replaceAll('orders', 'invoices'), ...BASE.slice(1)] // window a hair off the baseline
const EV_NAMES = ['qdev-soup/drift-evidence/v1', 'qdev-soup/signal']       // candidate names a peer may listen on
const INTERV_NAMES = ['qdev-soup/intervention-evidence/v1']

// ---- result plumbing -------------------------------------------------------------------------------------
const out = {}                                   // id -> {checks:[], notes:[], forced}
const need = (id) => (out[id] ??= { checks: [], notes: [], forced: null })
// scope: 'plugin' (default) or 'standin' (only a stand-in service or an event emitted by this script can show it).
const check = (id, name, pass, observed, scope = 'plugin') => need(id).checks.push({ name, pass: !!pass, observed, scope })
const note = (id, text) => need(id).notes.push(text)
const crashed = (ids, e) => { for (const id of ids) need(id).forced = { verdict: 'NOT-PROVEN', why: `scenario could not run: ${e?.stack?.split('\n').slice(0, 2).join(' ') ?? e}` } }
const js = (x) => JSON.stringify(x)
// An exception that escapes into the host process is a finding, not a harness crash: record it and keep scoring.
const uncaught = []
process.on('uncaughtException', (e) => { uncaught.push(String(e?.message ?? e)) })
process.on('unhandledRejection', (e) => { uncaught.push('unhandledRejection: ' + String(e?.message ?? e)) })

// ---- fixture: real Loader + real built entry; only external DSH services are in-memory stand-ins ---------
// `injected` is the stand-in agent's inbox: inject() only records what the plugin handed over. It is not a Harness agent.
async function fixture({ config = {}, withAgent = true, before, injectThrows = false } = {}) {
  const ctx = new Context()
  const routes = new Map()
  const questions = []
  const injected = []
  const session = Session.create('mission-chat')
  const agent = { id: session.id, session, inject(m) { if (injectThrows) throw new Error('agent inbox unavailable'); injected.push(m) } }
  const live = new Map(withAgent ? [[agent.id, agent]] : [])
  ctx.provide('agents', { list: () => [...live.values()], get: (id) => live.get(id) }) // list AND get: builds resolve agents by either
  ctx.provide('storageDomain', {
    async open() {
      const records = new Map()
      return { table: () => ({ entries: () => records.entries(), get: (id) => records.get(id), async put(id, v) { records.set(id, structuredClone(v)) } }), async close() {} }
    },
  })
  ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } })
  ctx.provide('userQuestions', { ask(request) { return new Promise((resolve, reject) => questions.push({ request, resolve, reject })) } })
  if (before) before(ctx)                       // peers registered BEFORE the plugin loads
  await ctx.plugin(Loader, { baseUrl: ENTRY })
  const loader = ctx.loader
  let raw = { python: PYTHON, enabled: true, detectorEnabled: true, reanchoring: true, preset: 2, baselineCount: 4, windowCount: 4, ...config }
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k]
  const id = await loader.create({ id: 'soup-under-test', name: ENTRY, config: raw })
  await loader.await()
  const entry = loader.resolve(id)
  await entry.fiber.await()
  const mounted = entry.fiber.state === ACTIVE && routes.has(STATUS_PATH)
  async function request(method = 'GET', body) {
    const route = routes.get(STATUS_PATH)
    if (!route) return { code: 0, body: null }
    const payload = body === undefined ? '' : JSON.stringify(body)
    const req = { method, headers: { 'x-qdev-soup-action': 'reset-drift-count' }, async *[Symbol.asyncIterator]() { if (payload) yield payload } }
    let text
    const response = { statusCode: 0, setHeader() {}, end(v) { text = v } }
    await route.handler(req, response)
    return { code: response.statusCode, body: JSON.parse(text) }
  }
  const status = async () => (await request()).body
  async function update(patch) {
    raw = { ...raw, ...patch }
    await loader.update(id, { config: raw })
    await loader.await()
  }
  const ev = (type, data) => {
    const e = ['user/message', 'assistant/message'].includes(type) ? session.append(type, data, { surfaceOp: 'append' }) : session.append(type, data)
    ctx.emit('session/event', session, e)
    return e
  }
  const start = (turn = 1) => {
    ev('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Implement the orders pagination plan, without unrelated work.' }] }))
    ev('turn/start', { turn })
  }
  let step = 0
  const say = (text, turn = 1) => ev('assistant/message', {
    turn, step: ++step,
    message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text }] }),
    stream: [],
  })
  const sayAll = (texts, turn = 1) => texts.forEach((t) => say(t, turn))
  async function until(pred, ms = 20000) {
    const end = Date.now() + ms
    while (Date.now() < end) { const s = await status(); if (s && pred(s)) return s; await delay(25) }
    return null
  }
  const evals = (s) => s?.detector?.evaluations ?? 0
  // feed a window and wait until exactly one more evaluation has completed
  async function window(texts, turn = 1) {
    const before = evals(await status())
    sayAll(texts, turn)
    await until((s) => evals(s) >= before + 1)
    await delay(250)                       // let consumers (Mentor, status) finish reacting to the measurement
    return status()
  }
  async function dispose() { try { await ctx.fiber.dispose() } catch { /* teardown only */ } }
  return { ctx, agent, live, session, injected, questions, mounted, request, status, update, ev, start, say, sayAll, until, window, evals, dispose }
}
const forms = (f) => f.injected.map((m) => m?.source?.form ?? m?.source?.kind ?? '?')
const lastResult = (s) => s?.detector?.lastResult
const klOf = (s) => lastResult(s)?.klDivergence

// A peer plugin written HERE: knows only event names and plain data; imports nothing of SOUP.
function makePeer(ctx, names, label, behaviour = 'record') {
  const peer = { label, got: [], thrown: 0, names: {} }
  for (const name of names) {
    ctx.on(name, (x) => {
      if (behaviour === 'throw') { peer.thrown += 1; throw new Error(`${label} sync boom`) }
      if (behaviour === 'reject') { peer.thrown += 1; return (async () => { throw new Error(`${label} async boom`) })() }
      peer.got.push({ name, x }); peer.names[name] = (peer.names[name] ?? 0) + 1
    })
  }
  return peer
}
// A build may publish the same fact on more than one channel (e.g. a legacy and a versioned name). A peer listening on
// all candidate names would count twice, so record per name and score the channel that carried the most facts
// (ties: the versioned drift-evidence name first).
function tap(ctx, names) {
  const perName = {}
  for (const name of names) { perName[name] = []; ctx.on(name, (x) => { perName[name].push({ name, x }) }) }
  return {
    perName,
    counts: () => Object.fromEntries(Object.entries(perName).map(([k, v]) => [k, v.length])),
    get main() { return Object.values(perName).reduce((best, cur) => (cur.length > best.length ? cur : best), perName[names[0]]) },
  }
}
// shape-tolerant, independent reader of a "fact"
function readFact(x) {
  const r = x?.result ?? x
  const kl = r?.kl_divergence ?? r?.klDivergence
  const threshold = r?.threshold
  const drift = r?.drift_detected ?? r?.driftDetected
  return typeof kl === 'number' && typeof threshold === 'number' && typeof drift === 'boolean' ? { kl, threshold, drift, sessionId: x?.sessionId } : null
}
function pluginHash() {
  const h = createHash('sha256'); let n = 0
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      if (e === 'node_modules' || e === 'test' || e === '.git' || e.startsWith('mission-scenarios')) continue
      const p = join(d, e); const s = statSync(p)
      if (s.isDirectory()) walk(p); else { h.update(p.slice(PLUGIN_DIR.length) + '\0'); h.update(readFileSync(p)); n += 1 }
    }
  }
  walk(PLUGIN_DIR)
  return { sha256: h.digest('hex'), files: n }
}
// A scenario may need the (trusted) worker to report a drift. If it did not, the plugin behaviour under test was never
// exercised: report NOT-PROVEN with that reason. This never grades the worker.
const precondition = (id, ok, why) => { if (!ok) need(id).forced = { verdict: 'NOT-PROVEN', why: `precondition not met (worker reported no drift for these inputs; the plugin path was not exercised): ${why}` } }
const want = (...ids) => !ONLY || ids.some((i) => ONLY.has(i))

// =========================================================================================================
// S1: drifting chat at default sizes: detect, two reminders, third escalates, visible status
async function s1() {
  const f = await fixture()
  try {
    check('M1', 'plugin mounted and status route answers', f.mounted, { mounted: f.mounted })
    const tapF = tap(f.ctx, EV_NAMES)
    const interv = []
    for (const name of INTERV_NAMES) f.ctx.on(name, (x) => interv.push({ name, x }))
    f.start()
    f.sayAll(BASE)
    const states = []
    for (let i = 0; i < 3; i += 1) states.push(await f.window(OFF))
    await delay(300)
    const s = await f.status()
    const lr = lastResult(s)
    // M1: the plugin's delivery of a drift fact. The worker's own numbers are not judged.
    const tapM1 = tapF.main.map((x) => readFact(x.x))
    precondition('M1', lr?.driftDetected === true, js(lr))
    check('M1', 'detector ran the drifting windows (3 evaluations)', s?.detector?.evaluations === 3, { evaluations: s?.detector?.evaluations })
    check('M1', 'status route reports the worker-reported drift (drift flag true, drift count 3)', lr?.driftDetected === true && s?.detector?.drifts === 3, { driftDetected: lr?.driftDetected, drifts: s?.detector?.drifts })
    check('M1', 'an independent peer (ctx.on only) received a drift fact with the drift flag true for each drifting window', tapM1.length === 3 && tapM1.every((x) => x && x.drift === true), { received: tapM1.length, drift_flags: tapM1.map((x) => x && x.drift) })
    // M2
    check('M2', 'reminder, reminder, escalation handed to the stand-in agent in that order', js(forms(f)) === js(['reminder', 'reminder', 'escalation']), { forms: forms(f) }, 'standin')
    check('M2', 'exactly one human clarification question requested from the stand-in question service (on the third drift)', f.questions.length === 1, { questions: f.questions.length }, 'standin')
    check('M2', 'status shows 3 strikes and a pending reset decision', s?.mentor?.driftCount === 3 && s?.mentor?.resetDecision?.required === true, { driftCount: s?.mentor?.driftCount, resetDecision: s?.mentor?.resetDecision }, 'standin')
    // M5: visibility
    const paths = ['configuration.threshold', 'trajectory.baselineSize', 'trajectory.windowSize', 'trajectory.sessionEvents', 'detector.state', 'detector.evaluations', 'detector.drifts', 'detector.humanSummary', 'detector.lastResult.klDivergence', 'detector.lastResult.threshold', 'detector.lastResult.driftDetected', 'mentor.driftCount', 'mentor.reminders', 'mentor.resetDecision', 'errors']
    const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o)
    const missing = paths.filter((p) => get(s, p) === undefined)
    const resp = await f.request()
    check('M5', 'status route answers 200 with JSON', resp.code === 200, { code: resp.code })
    check('M5', 'every state field a user needs is present', missing.length === 0, { missing, humanSummary: s?.detector?.humanSummary, reminder_records: s?.mentor?.reminders?.length })
    // A1: fact for drifting windows (healthy half comes from S2)
    const facts = tapF.main
    const fs = facts.map((x) => readFact(x.x))
    check('A1', 'peer (ctx.on only) received one well-formed fact per drifting window', fs.length === 3 && fs.every(Boolean), { received: facts.length, per_channel: tapF.counts(), first: fs[0] })
    check('A1', 'fact values equal what the status route reports (same KL)', fs.length > 0 && !!fs.at(-1) && Math.abs(fs.at(-1).kl - lr?.klDivergence) < 1e-9, { fact_kl: fs.at(-1)?.kl, status_kl: lr?.klDivergence })
    // A6 derived evidence
    const ia = interv.map((x) => x.x)
    check('A6', 'a peer received Mentor intervention evidence (reminder, reminder, escalation)', js(ia.map((x) => x?.action)) === js(['reminder', 'reminder', 'escalation']), { events: interv.length, actions: ia.map((x) => x?.action), listened_on: INTERV_NAMES })
    check('A6', 'each intervention references the drift fact it answered (same KL)', ia.length === 3 && ia.every((x, i) => x?.respondsTo && fs[i] && Math.abs(x.respondsTo.kl_divergence - fs[i].kl) < 1e-9), { respondsTo_kl: ia.map((x) => x?.respondsTo?.kl_divergence), fact_kl: fs.map((x) => x?.kl) })
    // A7
    check('A7', 'fact reached a peer through plain ctx.on on the native context (no SDK/bus import in the peer)', facts.length > 0, { received_per_channel: tapF.counts(), package_dependencies: Object.keys(pkg.dependencies ?? {}) })
    note('A7', 'Only the delivery path is observed. That no new bus/registry exists inside SOUP is not provable from outside.')
  } finally { await f.dispose() }
}

// S2: healthy chat, templated vs realistic natural messages
async function s2() {
  const f = await fixture()
  const tapH = tap(f.ctx, EV_NAMES)
  try {
    f.start(); f.sayAll(BASE)
    for (let i = 0; i < 3; i += 1) await f.window(BASE)
    await delay(200)
    const s = await f.status()
    const facts = tapH.main.map((g) => readFact(g.x))
    // The peer must receive a fact for EVERY window, whatever the worker decided; its flag must equal what status reports.
    check('A1', 'peer received a fact for every measured window (repeat-the-baseline windows), its drift flags matching the status route', facts.length === 3 && facts.every(Boolean) && facts.filter((x) => x.drift).length === s?.detector?.drifts, { facts: facts.map((x) => x && { kl: x.kl, drift: x.drift }), status_drifts: s?.detector?.drifts })
  } finally { await f.dispose() }
}

// S3: 40 healthy evaluations then marginal drift: status must not hide it
async function s3() {
  const f = await fixture()
  try {
    f.start(); f.sayAll(BASE)
    for (let i = 0; i < 40; i += 1) await f.window(BASE)
    const healthy = await f.status()
    await f.window(MARGINAL)
    await delay(200)
    const s = await f.status()
    const lr = lastResult(s)
    precondition('P4', healthy?.detector?.drifts === 0 && lr?.driftDetected === true, js({ healthy_drifts: healthy?.detector?.drifts, last: lr }))
    check('P4', '40 evaluations completed before the later window', healthy?.detector?.evaluations === 40, { evaluations: healthy?.detector?.evaluations, drifts: healthy?.detector?.drifts, humanSummary: healthy?.detector?.humanSummary })
    check('P4', 'the later window was measured (41 evaluations)', s?.detector?.evaluations === 41, { evaluations: s?.detector?.evaluations, lastResult: lr })
    const sum = s?.detector?.humanSummary
    check('P4', 'status headline reflects the drift (Drifting/Severe), not Stable/Approaching', ['Drifting', 'Severe drift'].includes(sum), { humanSummary: sum, recentThresholdRatio: s?.detector?.recentThresholdRatio, averageThresholdRatio: s?.detector?.averageThresholdRatio, lastDriftAt: s?.detector?.lastDriftAt, evaluations: s?.detector?.evaluations })
  } finally { await f.dispose() }
}

// S4: Mentor killed / failing -> identical measurement
async function s4() {
  const run = async (opts) => {
    const f = await fixture(opts)
    const peer = tap(f.ctx, EV_NAMES)
    try {
      f.start(); f.sayAll(BASE)
      await f.window(OFF); await delay(250)
      const final = await f.status()
      return { s: final, kl: klOf(final), thr: lastResult(final)?.threshold, injected: f.injected.length, facts: peer.main.map((g) => readFact(g.x)), errors: final?.errors ?? [], evaluations: final?.detector?.evaluations, state: final?.detector?.state }
    } finally { await f.dispose() }
  }
  const u0 = uncaught.length
  const healthy = await run({}), off = await run({ config: { reanchoring: false } }), broken = await run({ injectThrows: true })
  check('P1', 'no exception escaped into the host process while Mentor failed', uncaught.length === u0, { escaped: uncaught.slice(u0) })
  const same = (a, b) => a.kl === b.kl && a.thr === b.thr && a.evaluations === b.evaluations
  check('P1', 'control: Mentor on measures and hands a reminder to the stand-in agent', healthy.evaluations === 1 && healthy.injected === 1, { kl: healthy.kl, injected: healthy.injected }, 'standin')
  check('P1', 'Mentor switched OFF: identical KL/threshold/evaluations, no reminder', same(off, healthy) && off.injected === 0, { off: { kl: off.kl, thr: off.thr, injected: off.injected }, healthy: { kl: healthy.kl, thr: healthy.thr } }, 'standin')
  check('P1', 'Mentor delivery BROKEN (agent inbox throws): identical KL/threshold/evaluations, detector not in error', same(broken, healthy) && broken.state !== 'error', { broken: { kl: broken.kl, thr: broken.thr, state: broken.state, errors: broken.errors.map((e) => `${e.phase}:${e.message}`) }, healthy: { kl: healthy.kl } })
  check('A2', 'Mentor OFF: peer still receives the fact', off.facts.length === 1 && !!off.facts[0], { facts: off.facts })
  check('A2', 'Mentor OFF: status route still shows the measurement', off.evaluations === 1 && typeof off.kl === 'number', { evaluations: off.evaluations, lastResult: lastResult(off.s) })
}

// S5: failing consumers, sync and async, registered BEFORE a healthy peer
async function s5() {
  const u0 = uncaught.length
  const f = await fixture()
  try {
    const t = makePeer(f.ctx, [...EV_NAMES, ...INTERV_NAMES], 'thrower', 'throw')
    const r = makePeer(f.ctx, [...EV_NAMES, ...INTERV_NAMES], 'rejecter', 'reject')
    const ok = makePeer(f.ctx, EV_NAMES, 'healthy')
    const okI = makePeer(f.ctx, INTERV_NAMES, 'healthy-interventions')
    f.start(); f.sayAll(BASE)
    for (let i = 0; i < 3; i += 1) await f.window(OFF)
    await delay(500)
    const s = await f.status()
    const errs = s?.errors ?? []
    const nonConsumer = errs.filter((e) => e.phase !== 'consumer')
    check('P7', 'no exception escaped into the host process', uncaught.length === u0, { escaped: uncaught.slice(u0) })
    check('P7', 'both failing peers actually ran and failed (control)', t.thrown >= 1 && r.thrown >= 1, { thrower_calls: t.thrown, rejecter_calls: r.thrown })
    check('P7', 'SOUP still completed all 3 measurements; detector not flipped to error', s?.detector?.evaluations === 3 && s?.detector?.state !== 'error', { evaluations: s?.detector?.evaluations, state: s?.detector?.state })
    check('P7', 'Mentor unaffected: two reminders and one escalation handed to the stand-in agent', js(forms(f)) === js(['reminder', 'reminder', 'escalation']) && f.questions.length === 1, { forms: forms(f), questions: f.questions.length }, 'standin')
    check('P7', 'a healthy peer registered AFTER the failing ones still received every fact', Math.max(0, ...Object.values(ok.names)) === 3, { received_per_channel: ok.names, of: 3 })
    check('P7', 'a healthy intervention peer still received every intervention', okI.got.length === 3, { received: okI.got.length, of: 3 })
    check('P7', 'the failures are recorded and labelled "consumer"; none is labelled parse/worker/other', errs.length >= 1 && nonConsumer.length === 0, { errors: errs.map((e) => ({ phase: e.phase, message: e.message })) })
  } finally { await f.dispose() }
}

// S6: early and late peers; brand new consumer with zero change to SOUP bytes
async function s6() {
  let tapEarly
  const h0 = pluginHash()
  const f = await fixture({ before: (ctx) => { tapEarly = tap(ctx, EV_NAMES) } })
  try {
    f.start(); f.sayAll(BASE)
    await f.window(OFF)                                   // one measurement before the new consumer exists
    const tapLate = tap(f.ctx, EV_NAMES)                  // BRAND NEW consumer added at runtime
    await f.window(OFF); await delay(250)
    const h1 = pluginHash()
    const early = tapEarly.main.map((g) => readFact(g.x))
    const late = tapLate.main.map((g) => readFact(g.x))
    check('A3', 'peer registered BEFORE SOUP loaded received the facts (one per window)', early.length === 2 && early.every(Boolean), { early: early.length, per_channel: tapEarly.counts() })
    check('A3', 'peer added AFTER SOUP was running received the later fact, same values as the early peer', late.length === 1 && !!late[0] && !!early[1] && late[0].kl === early[1].kl, { late: late[0], early_second: early[1], late_per_channel: tapLate.counts() })
    check('A4', 'brand-new consumer (written in this scenario) received a validated fact with no registration step in SOUP', late.length === 1 && !!late[0] && Number.isFinite(late[0].kl) && typeof late[0].sessionId === 'string', { fact: late[0] })
    check('A4', 'package bytes identical before and after adding the consumer (zero SOUP code change)', h0.sha256 === h1.sha256, { before: h0, after: h1 })
  } finally { await f.dispose() }
}

// S7: component-owned settings; sensitivity change mid-window
async function s7() {
  const f = await fixture()
  try {
    f.start(); f.sayAll(BASE)
    f.sayAll(MARGINAL.slice(0, 2))                             // partial live window of 2
    const pre = await f.status()
    await f.update({ preset: 4 })                              // sensitivity 0.2 -> 0.4 mid-window
    const mid = await f.status()
    check('P5', 'before the change: baseline 4 and partial window 2 collected', pre?.trajectory?.baselineSize === 4 && pre?.trajectory?.windowSize === 2, { baselineSize: pre?.trajectory?.baselineSize, windowSize: pre?.trajectory?.windowSize })
    check('P5', 'after the change the collected baseline and partial window are KEPT', mid?.trajectory?.baselineSize === 4 && mid?.trajectory?.windowSize === 2, { baselineSize: mid?.trajectory?.baselineSize, windowSize: mid?.trajectory?.windowSize, threshold: mid?.configuration?.threshold })
    f.sayAll(MARGINAL.slice(2))
    const s = await f.until((x) => f.evals(x) >= 1)
    const lr = lastResult(s)
    check('P5', 'the completed window was judged by the NEW threshold 0.4 (KL ~0.216 is not drift there)', lr?.threshold === 0.4 && lr?.driftDetected === false, lr)
  } finally { await f.dispose() }
  const f2 = await fixture()
  try {
    f2.start(); f2.sayAll(BASE); f2.sayAll(MARGINAL.slice(0, 2))
    const a = await f2.status()
    await f2.update({ reanchoring: false })
    const b = await f2.status()
    f2.sayAll(MARGINAL.slice(2))
    const c = await f2.until((x) => f2.evals(x) >= 1)
    check('A5', 'Mentor-only change: detector baseline/window unchanged by the save', a?.trajectory?.baselineSize === b?.trajectory?.baselineSize && a?.trajectory?.windowSize === b?.trajectory?.windowSize, { before: [a?.trajectory?.baselineSize, a?.trajectory?.windowSize], after: [b?.trajectory?.baselineSize, b?.trajectory?.windowSize] })
    check('A5', 'Mentor-only change: detector still measures the kept window with the same threshold; Mentor now silent', lastResult(c)?.threshold === 0.2 && lastResult(c)?.driftDetected === true && f2.injected.length === 0, { lastResult: lastResult(c), injected: f2.injected.length, mentor_state: c?.mentor?.state }, 'standin')
  } finally { await f2.dispose() }
  const f3 = await fixture()
  try {
    f3.start(); f3.sayAll(BASE)
    await f3.window(OFF)                                        // strike 1
    const a = (await f3.until((x) => x?.mentor?.driftCount >= 1, 4000)) ?? await f3.status()
    await f3.update({ detectorEnabled: false })
    const b = await f3.status()
    await f3.update({ detectorEnabled: true })
    await f3.window(OFF)                                        // strike 2 expected, not strike 1 again
    const c = (await f3.until((x) => x?.mentor?.driftCount >= 2, 4000)) ?? await f3.status()
    const attempts = f3.injected.map((m) => m?.source?.attempt)
    check('A5', 'Detector-only OFF/ON: Mentor strikes not reset; the next drift is reminder attempt 2, not 1 again', js(attempts) === js([1, 2]), { reminder_attempts: attempts, detector_state_while_off: b?.detector?.state, status_mentor_driftCount_samples: [a?.mentor?.driftCount, b?.mentor?.driftCount, c?.mentor?.driftCount] }, 'standin')
    note('A5', 'status.mentor.driftCount lagged the real strike count after a reminder in this run; the stand-in never sends agent/inbox/spliced confirmations, so that lag may be a stand-in artifact (unverified). The strike check uses the reminder attempt numbers handed to the stand-in agent instead.')
  } finally { await f3.dispose() }
}

// S8: off means off; partial window kept; in-flight window measured once
async function s8() {
  const f = await fixture({ config: { baselineCount: 1, windowCount: 2 } })
  try {
    f.start(); f.say(BASE[0]); f.say(OFF[0])                    // baseline 1 + partial window 1
    const pre = await f.status()
    await f.update({ enabled: false })
    const off0 = await f.status()
    f.sayAll([OFF[1], OFF[2], OFF[3]]); await delay(1200)       // events while OFF
    const off1 = await f.status()
    check('M3', 'while OFF: no event counted, no measurement, no reminder, no question, no dropped-event count', off1?.trajectory?.sessionEvents === off0?.trajectory?.sessionEvents && f.evals(off1) === f.evals(off0) && f.injected.length === 0 && f.questions.length === 0 && (off1?.detector?.droppedEvents ?? 0) === (off0?.detector?.droppedEvents ?? 0), { sessionEvents: [off0?.trajectory?.sessionEvents, off1?.trajectory?.sessionEvents], evaluations: [f.evals(off0), f.evals(off1)], droppedEvents: [off0?.detector?.droppedEvents, off1?.detector?.droppedEvents], injected: f.injected.length })
    await f.update({ enabled: true })
    const on0 = await f.status()
    check('M3', 're-enable keeps the partial window collected before OFF (not discarded; events during OFF not added)', on0?.trajectory?.windowSize === pre?.trajectory?.windowSize && on0?.trajectory?.baselineSize === pre?.trajectory?.baselineSize, { before_off: [pre?.trajectory?.baselineSize, pre?.trajectory?.windowSize], after_on: [on0?.trajectory?.baselineSize, on0?.trajectory?.windowSize] })
    f.say(OFF[1])
    const done = await f.until((x) => f.evals(x) >= 1); await delay(1200)
    const end = await f.status()
    check('M3', 'the kept window plus one new message is measured exactly once after re-enable', !!done && f.evals(end) === 1, { evaluations: f.evals(end), n_live: lastResult(end)?.n_live })
  } finally { await f.dispose() }
  const g = await fixture({ config: { baselineCount: 1, windowCount: 1, reanchoring: false } })
  try {
    g.start(); g.say(BASE[0]); g.say(OFF[0])                    // full window: worker starts
    const run = await g.status()
    await g.update({ enabled: false })
    await g.update({ enabled: true })
    await g.until((x) => g.evals(x) >= 1); await delay(1500)
    const end = await g.status()
    check('M3', 'window in flight at OFF/ON is measured exactly once (not lost, not double counted)', g.evals(end) === 1, { evaluations: g.evals(end), state_when_off_pressed: run?.detector?.state, precondition: run?.detector?.state === 'running' ? 'in-flight precondition held' : 'worker finished before OFF (race lost; weaker evidence)' })
  } finally { await g.dispose() }
}

// S9: no agent resolves -> events counted and visible
async function s9() {
  const f = await fixture({ withAgent: false, config: { baselineCount: 1, windowCount: 1, reanchoring: false } })
  try {
    f.start(); f.say(BASE[0]); f.say(OFF[0]); f.say(OFF[1])
    await delay(400)
    const s = await f.status()
    const dropDiag = (s?.errors ?? []).filter((e) => e.phase === 'drop')
    check('P3', 'status exposes a dropped-event counter greater than zero while no agent resolves', typeof s?.detector?.droppedEvents === 'number' && s.detector.droppedEvents > 0, { droppedEvents: s?.detector?.droppedEvents, events_sent: 5, sessionEvents: s?.trajectory?.sessionEvents, evaluations: s?.detector?.evaluations })
    check('P3', 'the loss is explained in the status errors list (phase drop, mentions no agent)', dropDiag.length >= 1 && /no agent/i.test(dropDiag[0].message), { errors: (s?.errors ?? []).map((e) => `${e.phase}:${e.message}`) })
    f.live.set(f.agent.id, f.agent); f.ctx.emit('agent/created', { agent: f.agent })
    f.say(OFF[2])
    const after = await f.until((x) => f.evals(x) >= 1, 8000)
    check('P3', 'once an agent resolves (stand-in registry updated and agent/created emitted by this script), new events are measured again', !!after, { evaluations: after ? f.evals(after) : f.evals(await f.status()) }, 'standin')
  } finally { await f.dispose() }
}

// S10: old saved configuration (a release before the detector/mentor split saved only these keys)
async function s10() {
  const f = await fixture({ config: { detectorEnabled: undefined, preset: 3, baselineCount: 2, windowCount: 3, reanchoring: true } })
  try {
    const s0 = await f.status()
    const c = s0?.configuration
    check('M6', 'old-shaped configuration (no detectorEnabled) loads: mounted, no configuration errors', f.mounted && (s0?.errors ?? []).length === 0, { mounted: f.mounted, errors: s0?.errors })
    check('M6', 'saved values unchanged (preset 3 -> threshold 0.3, baseline 2, window 3, Mentor on)', c?.preset === 3 && c?.threshold === 0.3 && c?.baselineCount === 2 && c?.windowCount === 3 && c?.reanchoring === true, c)
    f.start(); f.sayAll(BASE.slice(0, 2))
    const s = await f.window(OFF.slice(0, 3))
    check('M6', 'and the detector still measures under that old configuration', f.evals(s) === 1 && lastResult(s)?.threshold === 0.3, { evaluations: f.evals(s), lastResult: lastResult(s) })
  } finally { await f.dispose() }
}

// structural / not black-box
function structural() {
  const lines = (p) => { try { return readFileSync(join(PLUGIN_DIR, p), 'utf8').split('\n').length } catch { return null } }
  const mods = existsSync(join(PLUGIN_DIR, 'src')) ? readdirSync(join(PLUGIN_DIR, 'src')) : []
  need('P2').forced = { verdict: 'NOT-PROVEN', why: 'File size/structure is not an observable outcome at the public boundary. Observed only: src/index.ts line count and module list (shown); that says nothing about whether responsibilities are really separated.' }
  check('P2', 'observed (informational, not a verdict): src/index.ts lines and src modules', true, { 'src/index.ts_lines': lines('src/index.ts'), src_modules: mods })
  need('P6').forced = { verdict: 'NOT-PROVEN', why: 'The worker is a trusted given and is not exercised here. A non-DSH producer feeding the plugin detector needs a published non-DSH entry; none is exercised (package exports/bin shown). Through the Host only DSH events enter, so the detector side is untested.' }
  check('P6', 'observed (informational, not a verdict): package entry points', true, { package_exports: Object.keys(pkg.exports ?? {}), package_bin: pkg.bin ?? null })
}

// S11: the older 'qdev-soup/signal' channel (0.9.0 contract) must be isolated like the versioned evidence channels.
// Peers here use only ctx.on: one throws synchronously, one rejects asynchronously, one is healthy.
async function s11() {
  const u0 = uncaught.length
  const f = await fixture()
  try {
    const SIG = ['qdev-soup/signal']
    const t = makePeer(f.ctx, SIG, 'signal-thrower', 'throw')
    const r = makePeer(f.ctx, SIG, 'signal-rejecter', 'reject')
    const ok = makePeer(f.ctx, SIG, 'signal-healthy')
    // The worker's own report, read from the isolated versioned channel (independent of the signal channel under test).
    const ref = tap(f.ctx, ['qdev-soup/drift-evidence/v1'])
    f.start(); f.sayAll(BASE)
    for (let i = 0; i < 3; i += 1) await f.window(OFF)
    await delay(500)
    const s = await f.status()
    const errs = s?.errors ?? []
    if (ok.got.length === 0 && t.thrown === 0) { need('P8').forced = { verdict: 'NOT-PROVEN', why: 'this build never published anything on qdev-soup/signal, so the isolation of that channel could not be exercised' }; return }
    const refFacts = ref.main.map((g) => readFact(g.x))
    precondition('P8', refFacts.length === 3 && refFacts.every((x) => x && x.drift === true), js(refFacts))
    check('P8', 'both failing peers actually ran and failed (control)', t.thrown >= 1 && r.thrown >= 1, { thrower_calls: t.thrown, rejecter_calls: r.thrown })
    check('P8', 'SOUP still counted all 3 evaluations and the detector did not flip to error', s?.detector?.evaluations === 3 && s?.detector?.state !== 'error', { evaluations: s?.detector?.evaluations, state: s?.detector?.state })
    check('P8', 'Mentor still acted: two reminders and one escalation handed to the stand-in agent', js(forms(f)) === js(['reminder', 'reminder', 'escalation']) && f.questions.length === 1, { forms: forms(f), questions: f.questions.length }, 'standin')
    check('P8', 'a healthy peer on the same channel still received every signal', ok.got.length === 3, { received: ok.got.length, of: 3 })
    check('P8', 'no exception escaped into the host process', uncaught.length === u0, { escaped: uncaught.slice(u0) })
    check('P8', 'failures are recorded with phase "consumer" only (not consumer:status:evaluation, parse or worker)', errs.length >= 1 && errs.every((e) => e.phase === 'consumer'), { errors: errs.map((e) => ({ phase: e.phase, consumer: e.consumer, message: e.message })) })
  } finally { await f.dispose() }
}

// S12 (M7): the reminder reaches the chat. Guards the separation of Mentor's decision from how it is carried out.
async function s12() {
  const f = await fixture()
  try {
    f.start(); f.sayAll(BASE)
    await f.window(OFF)
    const s1 = await f.status()
    const first = f.injected[0]
    const text = first?.content?.map?.((b) => b?.text ?? '').join('\n') ?? ''
    precondition('M7', lastResult(s1)?.driftDetected === true, js(lastResult(s1)))
    check('M7', 'the first drift hands exactly one reminder to the stand-in agent', f.injected.length === 1 && first?.source?.form === 'reminder', { forms: forms(f) }, 'standin')
    check('M7', 'the queued reminder has text', text.length > 0, { length: text.length }, 'standin')
    const rec = s1?.mentor?.reminders?.[0]
    check('M7', 'status lists that reminder as pending, tied to the queued message', s1?.mentor?.reminders?.length === 1 && rec?.state === 'pending' && rec?.messageId === String(first?.id), { reminders: s1?.mentor?.reminders?.length, state: rec?.state, messageId_matches: rec?.messageId === String(first?.id) }, 'standin')
    const e = f.ev('agent/inbox/spliced', { inserted: [{ id: first?.id, source: first?.source }] })
    const s2 = await f.status()
    const done = s2?.mentor?.reminders?.[0]
    check('M7', 'after the splice event THIS SCRIPT emits (not a real Harness confirmation), the plugin marks the reminder delivered and says so', done?.state === 'delivered' && done?.eventSeq === Number(e.seq) && /delivered/.test(s2?.mentor?.lastOutcome ?? ''), { state: done?.state, eventSeq: done?.eventSeq, expected_seq: Number(e.seq), lastOutcome: s2?.mentor?.lastOutcome }, 'standin')
  } finally { await f.dispose() }
}

const ALL = [[s1, ['M1', 'M2', 'M5', 'A1', 'A6', 'A7']], [s2, ['A1']], [s3, ['P4']], [s4, ['P1', 'A2']], [s5, ['P7']], [s6, ['A3', 'A4']], [s7, ['P5', 'A5']], [s8, ['M3']], [s9, ['P3']], [s10, ['M6']], [s11, ['P8']], [s12, ['M7']]]
for (const [fn, ids] of ALL) {
  if (!want(...ids)) continue
  try { await fn() } catch (e) { crashed(ids, e) }
}
if (want('P2', 'P6')) structural()

const pv = pluginHash()
const info = { label: LABEL, version: pkg.version, main: pkg.main, python: PYTHON, node: process.version, plugin_dir: PLUGIN_DIR, files_hash: pv.sha256.slice(0, 16) }
const counts = { PASS: 0, FAIL: 0, 'NOT-PROVEN': 0 }
for (const id of Object.keys(R)) {
  if (ONLY && !ONLY.has(id)) continue
  const o = out[id]
  const [statement, source, sourceKind] = R[id]
  let verdict, why = ''
  if (!o || (!o.forced && !o.checks.length)) { verdict = 'NOT-PROVEN'; why = 'no scenario produced a check for this requirement' }
  else if (o.forced) { verdict = o.forced.verdict; why = o.forced.why }
  else {
    const failed = o.checks.filter((c) => !c.pass)
    verdict = failed.length ? 'FAIL' : 'PASS'
    why = failed.length ? `${failed.length} of ${o.checks.length} checks failed: ${failed.map((c) => c.name).join(' | ')}` : `${o.checks.length} of ${o.checks.length} checks observed`
    // A PASS for a claim about real Harness behaviour needs the real boundary. Stand-in checks cannot supply it.
    if (verdict === 'PASS' && REAL_BOUNDARY[id] && o.checks.some((c) => c.scope === 'standin')) {
      verdict = 'NOT-PROVEN'
      why = `plugin-side result: ${why} (${o.checks.filter((c) => c.scope === 'standin').length} of them observed only through stand-in services). NOT a pass: this requirement needs ${REAL_BOUNDARY[id]}, which this run did not exercise.`
    }
  }
  counts[verdict] += 1
  console.log('RESULT ' + js({ id, build: LABEL, version: pkg.version, statement, source, sourceKind, verdict, why, checks: o?.checks ?? [], notes: o?.notes ?? [] }))
}
console.log('SUMMARY ' + js({ ...info, counts }))
process.exit(0)
