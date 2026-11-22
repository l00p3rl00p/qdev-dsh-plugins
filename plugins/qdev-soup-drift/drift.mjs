// The detector: windows of normalized observations in, drift evidence out. It imports ONLY soup-core.mjs
// (the SOUP call, the adapter and the evidence contract), so it runs with no Mentor, settings or Host.
// The detector only EMITS; Mentor, notify and status are subscribers registered from outside.
import { spawn } from 'node:child_process'
import { PRESETS, startMeasurement, assistantText, toObservation, toObservations, createDriftEvidence } from './soup-core.mjs'

// P6: DSH event shape handling lives in soup-core.mjs (adapter section); re-exported for existing importers.
export { PRESETS, assistantText }

// Validate one complete detector configuration (used at creation and on reconfigure).
function validate({ python, preset, baselineCount, windowCount }, workerTimeoutMs) {
  if (typeof python !== 'string' || !python) throw new Error('Python executable required')
  if (!Number.isInteger(preset) || preset < 0 || preset > 4) throw new Error('Invalid sensitivity preset')
  if (![baselineCount, windowCount].every((value) => Number.isInteger(value) && value > 0 && value <= 100)) {
    throw new Error('Invalid window')
  }
  if (!Number.isInteger(workerTimeoutMs) || workerTimeoutMs < 1000) throw new Error('Invalid worker timeout')
}

const validObservation = (item) => typeof item?.text === 'string' && item.text.length > 0
// Stored item: seq (optional) is the message's identity in the session history (decision C).
const toItem = (item) => ({ text: item.text, turn: Number.isInteger(item.turn) ? item.turn : null, seq: Number.isSafeInteger(item.seq) ? item.seq : null })

export function createDetector({
  python,
  preset = 2,
  enabled = true,
  baselineCount = 4,
  windowCount = 4,
  workerTimeoutMs = 30000,
  onObservation = () => {},
  onEvaluationStart = () => {},
  onEvaluation = () => {},
  onDrift = () => {},
  onError = () => {},
  spawnProcess = spawn,
} = {}) {
  validate({ python, preset, baselineCount, windowCount }, workerTimeoutMs)
  // P5: live, mutable configuration. reconfigure() changes it WITHOUT discarding collected windows.
  let cfg = { python, preset, enabled, baselineCount, windowCount }
  // Bumped by every effective reconfigure; a worker started under an older epoch is stale.
  let epoch = 0

  const states = new Map()
  const measurements = new Set()   // cancel functions of the measurements in flight
  let disposed = false

  // P1: the detector only EMITS. Anything that reacts (Mentor, notify, status) is a subscriber
  // registered from outside; the legacy onX options are just the first subscribers of each kind.
  const listeners = { observation: [], evaluationStart: [], evaluation: [], drift: [], error: [] }
  const legacy = { observation: onObservation, evaluationStart: onEvaluationStart, evaluation: onEvaluation, drift: onDrift, error: onError }
  for (const [kind, fn] of Object.entries(legacy)) listeners[kind].push({ fn, name: kind })
  function subscribe(kind, fn, name = kind) {
    if (!listeners[kind]) throw new Error(`Unknown event kind: ${kind}`)
    if (typeof fn !== 'function') throw new TypeError('Subscriber must be a function')
    const entry = { fn, name }
    listeners[kind].push(entry)
    return () => { listeners[kind] = listeners[kind].filter((item) => item !== entry) }
  }

  function stateOf(id) {
    const key = String(id)
    let state = states.get(key)
    if (!state) {
      state = { base: [], live: [], pending: false, inflight: null, last: null }
      states.set(key, state)
    }
    return [key, state]
  }

  // A throwing onObservation consumer must not escape: finish() runs it inside child-process
  // handlers (crash) and before pump() (would stall the next queued measurement).
  function publishObservation(sessionId, state, turn) {
    emit('observation', {
      sessionId,
      turn,
      baselineSize: state.base.length,
      baselineTarget: cfg.baselineCount,
      windowSize: state.live.length,
      windowTarget: cfg.windowCount,
      pending: state.pending,
    }, { sessionId, turn })
  }

  // Normalized core API: seedTexts/observeText take { text, turn } only.
  function seedTexts(id, observations) {
    if (!cfg.enabled || disposed) return
    const [key, state] = stateOf(id)
    // P5: a session that already holds collected state keeps it. Re-seeding (e.g. after a
    // settings change or re-enable) must not duplicate the baseline or erase a partial window.
    if (state.base.length || state.live.length || state.pending) { publishObservation(key, state, null); return }
    for (const item of observations ?? []) {
      if (!validObservation(item)) continue
      if (state.base.length < cfg.baselineCount) state.base.push(toItem(item))
    }
    state.live.length = 0
    publishObservation(key, state, null)
  }
  // Compatibility wrapper: DSH events are converted by the adapter, then handed to the core.
  function seed(id, events) {
    seedTexts(id, toObservations(events))
  }

  // Last-resort guard: the error reporter itself must never throw out of a child-process handler.
  function reportError(error, details) {
    for (const { fn } of listeners.error) {
      try {
        const returned = fn(error, details)
        // M1: an async error reporter that rejects must not become an unhandled rejection.
        if (typeof returned?.then === 'function') returned.then(undefined, () => { /* nothing further can be reported */ })
      } catch { /* nothing further can be reported from here */ }
    }
  }

  // Deliver one event to every subscriber of a kind. Each subscriber is isolated: a throw is
  // reported as a consumer failure (named), never as a parse failure, and never stops the others.
  function emit(kind, payload, details) {
    for (const { fn, name } of [...listeners[kind]]) {
      const failed = (error) => reportError(error, { ...details, phase: 'consumer', consumer: name })
      try {
        const returned = fn(payload)
        // M1: a consumer that returns a thenable is isolated too; its rejection is a named consumer failure.
        if (typeof returned?.then === 'function') returned.then(undefined, failed)
      } catch (error) { failed(error) }
    }
  }

  function finish(sessionId, state) {
    state.pending = false
    state.inflight = null
    publishObservation(sessionId, state, null)
    pump(sessionId, state)
  }

  function pump(sessionId, state) {
    if (disposed || state.pending || state.live.length < cfg.windowCount) return
    const window = state.live.splice(0, cfg.windowCount)
    const turns = [...new Set(window.map((item) => item.turn).filter(Number.isInteger))]
    const turn = turns.length === 1 ? turns[0] : null
    const singleTurn = turns.length === 1 && window.every((item) => item.turn === turn)
    state.pending = true
    state.inflight = window   // kept so a reconfigure can put the window back instead of losing it
    const threshold = PRESETS[cfg.preset]   // fixed at spawn: this result is judged by this threshold
    const childEpoch = epoch
    // Isolated: a throw here would leave state.pending true forever (the window is already spliced).
    emit('evaluationStart', { sessionId, turn, singleTurn, baselineSize: state.base.length, windowSize: window.length }, { sessionId, turn })

    let cancel
    let settledSync = false
    const settle = (error, result) => {
      settledSync = true
      measurements.delete(cancel)
      // Stale (reconfigured/disabled meanwhile): its window was already handled by reconfigure().
      if (childEpoch !== epoch) return
      finish(sessionId, state)
      if (error) {
        if (!disposed || error.phase === 'spawn') reportError(error, { sessionId, turn, phase: error.phase })
        return
      }
      if (disposed) return
      if (!result || typeof result !== 'object') {
        reportError(new Error('SOUP worker returned a non-object result'), { sessionId, turn, phase: 'parse' })
        return
      }
      // WHY: what leaves the producer must be exactly the documented evidence contract (frozen, so one
      // peer cannot alter what another sees). A result that violates it is a worker problem, reported as a
      // parse failure, and is never delivered to any consumer.
      let report
      try {
        report = createDriftEvidence({ sessionId, turn, singleTurn, result })
      } catch (contractError) {
        reportError(contractError, { sessionId, turn, phase: 'parse' })
        return
      }
      state.last = report
      emit('evaluation', report, { sessionId, turn })
      if (result.drift_detected) emit('drift', report, { sessionId, turn })
    }
    cancel = startMeasurement({
      python: cfg.python,
      reference: state.base.map((item) => item.text),
      live: window.map((item) => item.text),
      threshold,
      timeoutMs: workerTimeoutMs,
      spawnProcess,
    }, settle)
    if (!settledSync) measurements.add(cancel)
  }

  function observeText(id, observation) {
    // Decision A ("Off is off"): while disabled/suspended an event is IGNORED on purpose. It is not
    // counted, not diagnosed and not measured; re-enabling resumes from now (see LESSONS.md).
    if (!cfg.enabled || disposed || !validObservation(observation)) return
    const [key, state] = stateOf(id)
    const turn = Number.isInteger(observation.turn) ? observation.turn : null
    if (state.base.length < cfg.baselineCount) state.base.push(toItem(observation))
    else state.live.push(toItem(observation))
    publishObservation(key, state, turn)
    pump(key, state)
  }
  // Compatibility wrapper: adapter converts the DSH event; the core only sees {text, turn}.
  function observe(id, event) {
    const observation = toObservation(event)
    if (observation) observeText(id, observation)
  }

  // Decision C: fill the open baseline slots of one session from its HISTORY (earliest first) - the same
  // material the old replace-the-detector path seeded - never from events that happen to arrive next.
  // A message is used once: anything already in the baseline or in the in-flight window is excluded, and a
  // candidate that is currently in the live window MOVES out of it (never copied). History without a seq
  // cannot be proven unused, so only live items (kept in their order) may stand in for it.
  function fillBaseline(state, observations) {
    const missing = cfg.baselineCount - state.base.length
    if (missing <= 0) return 0
    const used = new Set([...state.base, ...(state.inflight ?? [])].map((item) => item.seq).filter(Number.isSafeInteger))
    const liveBySeq = new Map(state.live.filter((item) => Number.isSafeInteger(item.seq)).map((item) => [item.seq, item]))
    const pool = new Map()
    for (const item of observations ?? []) {
      if (!validObservation(item) || !Number.isSafeInteger(item.seq) || used.has(item.seq)) continue
      pool.set(item.seq, liveBySeq.get(item.seq) ?? toItem(item))
    }
    for (const [seq, item] of liveBySeq) if (!used.has(seq) && !pool.has(seq)) pool.set(seq, item)
    const picked = [...pool.values()].sort((a, b) => a.seq - b.seq).slice(0, missing)
    for (const item of state.live) {
      if (picked.length >= missing) break
      if (!Number.isSafeInteger(item.seq)) picked.push(item)
    }
    state.live = state.live.filter((item) => !picked.includes(item))
    state.base.push(...picked)
    return picked.length
  }
  // Public: refill the open baseline slots of one session from the given history observations.
  function extendBaseline(id, observations) {
    if (!cfg.enabled || disposed) return 0
    const [key, state] = stateOf(id)
    const added = fillBaseline(state, observations)
    if (added) publishObservation(key, state, null)
    return added
  }

  // P5: apply a new configuration to the RUNNING detector. Collected windows are kept:
  //  - baseline shrinks -> truncated to its target; grows -> oldest live items are promoted into it
  //  - window changes   -> live items kept; a now-full window is measured on the spot
  //  - a measurement in flight is cancelled (its threshold/inputs are outdated) and its window is
  //    put back at the front of live so it is measured again under the new configuration
  //    exactly once (never lost, never counted twice). Decision B: this also holds on DISABLE - the
  //    window is kept at the front of live (in order) and measured once the chat is turned back on.
  //  - disabling keeps state; re-enabling resumes with it.
  //  - baseline growth (decision C): with a `history` provider ((id) => observations) the new slots are
  //    filled from the EARLIEST history; growth while disabled is owed and filled on re-enable. Without a
  //    provider the oldest live items are promoted (standalone detector behaviour).
  function reconfigure(patch = {}, { history } = {}) {
    if (disposed) return false
    const next = { ...cfg, ...patch }
    validate(next, workerTimeoutMs)
    if (Object.keys(cfg).every((key) => cfg[key] === next[key])) return false
    const grew = next.baselineCount > cfg.baselineCount
    cfg = next
    epoch += 1
    for (const cancel of measurements) cancel()
    measurements.clear()
    for (const [id, state] of states) {
      if (state.pending) {
        // Decision B: always return the cancelled window to the front of live, in order, even when
        // turning OFF. The worker is already killed and its epoch is stale, so its late output is
        // rejected and the window is attributed exactly once when it is measured again.
        if (state.inflight) state.live.unshift(...state.inflight)
        state.pending = false
        state.inflight = null
      }
      if (state.base.length > cfg.baselineCount) state.base.length = cfg.baselineCount
      if (grew) state.owed = true
      if (state.owed && cfg.enabled) {
        // Owed baseline slots (growth now, or growth while the chat was off): earliest history first.
        state.owed = false
        if (history) fillBaseline(state, history(id))
        else while (state.base.length < cfg.baselineCount && state.live.length) state.base.push(state.live.shift())
      }
    }
    if (cfg.enabled) {
      for (const [id, state] of states) { publishObservation(id, state, null); pump(id, state) }
    }
    return true
  }

  return {
    observe,
    observeText,
    seed,
    seedTexts,
    extendBaseline,
    subscribe,
    reconfigure,
    // Collected-item counts for a session (read-only view of the measurement window).
    counts: (id) => {
      const state = states.get(String(id))
      return { baseline: state?.base.length ?? 0, live: state?.live.length ?? 0, pending: state?.pending ?? false }
    },
    // Last completed measurement for a session: lets the core be read with zero subscribers.
    lastReport: (id) => states.get(String(id))?.last ?? null,
    dispose() {
      disposed = true
      for (const cancel of measurements) cancel()
      measurements.clear()
      states.clear()
    },
  }
}
