// SOUP Core: the whole contract is  input -> official SOUP calculation -> result.
// It knows nothing about sessions, mentors, settings, storage, HTTP or UI, and imports only Node built-ins.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const PRESETS = Object.freeze([0.05, 0.1, 0.2, 0.3, 0.4])
export const WORKER = fileURLToPath(new URL('./soup_worker.py', import.meta.url))

const tag = (error, phase) => Object.assign(error instanceof Error ? error : new Error(String(error)), { phase })

// Start one measurement; returns cancel(). `done(error, result)` is called exactly once, synchronously
// when the worker closes. result = { drift_detected, kl_divergence, threshold, n_reference, n_live };
// error carries .phase: spawn | process | timeout | worker | parse. cancel() kills the worker (done then
// reports phase 'worker' or 'timeout').
export function startMeasurement({
  python,
  reference,
  live,
  threshold,
  timeoutMs = 30000,
  spawnProcess = spawn,
}, done) {
  let child
  let kill = () => {}
  {
    const reject = (error) => done(error)
    const resolve = (result) => done(null, result)
    try {
      child = spawnProcess(python, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      reject(tag(error, 'spawn'))
      return () => {}
    }
    kill = () => child.kill('SIGTERM')
    let output = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    child.stdout.on('data', (bytes) => {
      output += bytes.toString()
      if (output.length > 16384) kill()
    })
    child.stderr.on('data', (bytes) => {
      stderr += bytes.toString()
      if (stderr.length > 4096) kill()
    })
    child.on('error', (error) => finish(reject, tag(error, 'process')))
    child.on('close', (code) => {
      if (timedOut) return finish(reject, tag(new Error(`SOUP worker timed out after ${timeoutMs}ms`), 'timeout'))
      if (code !== 0) return finish(reject, tag(new Error(`SOUP worker exit ${code}: ${stderr.slice(0, 500)}`), 'worker'))
      try {
        finish(resolve, JSON.parse(output))
      } catch (error) {
        finish(reject, tag(error, 'parse'))
      }
    })
    child.stdin.end(JSON.stringify({ reference, live, threshold }))
  }
  return () => kill()
}

// Convenience for callers that only want the answer.
export const measureDrift = (input) => new Promise((resolve, reject) => {
  startMeasurement(input, (error, result) => (error ? reject(error) : resolve(result)))
})

// ---- Adapter (P6): the only place that knows the DSH session-event shape. The detector works on
// normalized observations { text, turn, seq? }; it never reads event.type / event.data itself.
/** Assistant text of a DSH event ('' for anything that is not a completed assistant text message). */
export function assistantText(event) {
  if (event?.type !== 'assistant/message' || event.data?.interrupted) return ''
  return (event.data?.message?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
    .slice(0, 100000)
}

/** DSH event -> { text, turn, seq } or null when it carries nothing the detector should measure. */
export function toObservation(event) {
  const text = assistantText(event)
  if (!text) return null
  // seq is the event's identity in the session history: it lets the detector prove a message is not
  // used twice when it refills a grown baseline from that history (decision C). omitted when absent.
  const seq = event.seq === undefined || event.seq === null ? NaN : Number(event.seq)
  return { text, turn: Number.isInteger(event.data?.turn) ? event.data.turn : null, ...(Number.isSafeInteger(seq) ? { seq } : {}) }
}

/** A whole event list -> observations (skips events that carry nothing to measure). */
export const toObservations = (events) => (events ?? []).map(toObservation).filter(Boolean)


// ---- Drift evidence contract: the ONE fact the detector (the first producer) publishes. Peers
// (Mentor, notify, status, other plugins) consume this shape and nothing else; see ARCHITECTURE.md.
// Still node built-ins only: usable by a consumer that has no Harness.
/** Bump only when a required field changes meaning. Additive fields do not bump it. */
export const DRIFT_EVIDENCE_VERSION = 1

// Provisional names for the host-native publication (Cordis ctx.parallel / ctx.on). The version is
// part of the name because a native consumer in another plugin cannot import this module.
export const DRIFT_EVIDENCE_EVENT = `qdev-soup/drift-evidence/v${DRIFT_EVIDENCE_VERSION}`

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNum = (value) => typeof value === 'number' && Number.isFinite(value)
const isCount = (value) => Number.isInteger(value) && value >= 0
const isTurn = (value) => value === null || Number.isInteger(value)
const sessionOk = (value) => typeof value === 'string' && value.length > 0

// Deep freeze: one evidence object is handed to EVERY consumer, so one consumer must not be able
// to alter what its peers see.
function freeze(value) {
  for (const inner of Object.values(value)) if (isObject(inner)) freeze(inner)
  return Object.freeze(value)
}

/**
 * Check a drift evidence object. Returns { ok: true } or { ok: false, errors: string[] }.
 *
 * Shape (the soup_worker.py output is `result`; the other three fields say which window it judged):
 *   sessionId   string  chat the window belongs to
 *   turn        integer | null   turn of the window; null when it spans several turns
 *   singleTurn  boolean true only when every message of the window shares one turn
 *   result      object  { drift_detected: boolean, kl_divergence: number, threshold: number,
 *                         n_reference?: integer >= 0, n_live?: integer >= 0 }  (n_* optional, extra fields allowed)
 */
export function validateDriftEvidence(value) {
  const errors = []
  if (!isObject(value)) return { ok: false, errors: ['evidence must be an object'] }
  if (!sessionOk(value.sessionId)) errors.push('sessionId must be a non-empty string')
  if (!isTurn(value.turn)) errors.push('turn must be an integer or null')
  if (typeof value.singleTurn !== 'boolean') errors.push('singleTurn must be a boolean')
  const result = value.result
  if (!isObject(result)) errors.push('result must be an object')
  else {
    if (typeof result.drift_detected !== 'boolean') errors.push('result.drift_detected must be a boolean')
    if (!isNum(result.kl_divergence)) errors.push('result.kl_divergence must be a finite number')
    if (!isNum(result.threshold) || result.threshold <= 0) errors.push('result.threshold must be a positive number')
    // WHY optional: the real worker always sends them, but no consumer depends on them, and existing
    // tests drive the runtime with workers that omit them. When present they must be sane.
    for (const key of ['n_reference', 'n_live']) {
      if (result[key] !== undefined && !isCount(result[key])) errors.push(`result.${key} must be a non-negative integer when present`)
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true }
}

/** Build the (frozen) drift evidence. Throws when the parts do not satisfy the contract. */
export function createDriftEvidence({ sessionId, turn, singleTurn, result }) {
  const evidence = { sessionId, turn, singleTurn, result: { ...result } }
  const check = validateDriftEvidence(evidence)
  if (!check.ok) throw new TypeError(`Invalid drift evidence: ${check.errors.join('; ')}`)
  return freeze(evidence)
}

// ---- Intervention evidence: DERIVED from drift evidence by a consumer (Gentle Mentor) when it acts.
// It references the drift evidence it answered (Evidence -> Consumers -> Derived evidence -> Consumers).
export const INTERVENTION_EVIDENCE_VERSION = 1
export const INTERVENTION_EVIDENCE_EVENT = `qdev-soup/intervention-evidence/v${INTERVENTION_EVIDENCE_VERSION}`
export const INTERVENTION_ACTIONS = Object.freeze(['reminder', 'escalation', 'reset', 'carry'])

/**
 * Check an intervention evidence object (published by Gentle Mentor when it acts).
 *   sessionId   string
 *   turn        integer | null   turn Mentor acted in
 *   action      'reminder' | 'escalation' | 'reset' | 'carry'
 *   attempt     integer | null   reminder number (1, 2); null for the other actions
 *   strikes     integer >= 0     Mentor's qualifying-drift count AFTER the action
 *   carry       integer >= 0     strikes carried across turns AFTER the action
 *   respondsTo  { sessionId, turn, kl_divergence, threshold } | null
 *               the drift evidence this action answers (identity + measured numbers). null only
 *               for reset/carry when the escalating drift is unknown (e.g. after a restart).
 */
export function validateInterventionEvidence(value) {
  const errors = []
  if (!isObject(value)) return { ok: false, errors: ['evidence must be an object'] }
  if (!sessionOk(value.sessionId)) errors.push('sessionId must be a non-empty string')
  if (!isTurn(value.turn)) errors.push('turn must be an integer or null')
  if (!INTERVENTION_ACTIONS.includes(value.action)) errors.push(`action must be one of ${INTERVENTION_ACTIONS.join(', ')}`)
  if (!(value.attempt === null || isCount(value.attempt))) errors.push('attempt must be a non-negative integer or null')
  if (value.action === 'reminder' && !(Number.isInteger(value.attempt) && value.attempt >= 1)) errors.push('a reminder needs attempt >= 1')
  if (!isCount(value.strikes)) errors.push('strikes must be a non-negative integer')
  if (!isCount(value.carry)) errors.push('carry must be a non-negative integer')
  const ref = value.respondsTo
  if (ref === null) {
    if (value.action === 'reminder' || value.action === 'escalation') errors.push('a reminder/escalation must reference the drift evidence (respondsTo)')
  } else if (!isObject(ref)) errors.push('respondsTo must be an object or null')
  else {
    if (!sessionOk(ref.sessionId)) errors.push('respondsTo.sessionId must be a non-empty string')
    if (!isTurn(ref.turn)) errors.push('respondsTo.turn must be an integer or null')
    if (!isNum(ref.kl_divergence)) errors.push('respondsTo.kl_divergence must be a finite number')
    if (!isNum(ref.threshold)) errors.push('respondsTo.threshold must be a finite number')
  }
  return errors.length ? { ok: false, errors } : { ok: true }
}

/** Reference a drift evidence by identity (session, turn) plus the numbers it carried. */
export const referenceTo = (drift) => drift && {
  sessionId: drift.sessionId, turn: drift.turn,
  kl_divergence: drift.result.kl_divergence, threshold: drift.result.threshold,
}

/** Build the (frozen) intervention evidence. Throws when it does not satisfy the contract. */
export function createInterventionEvidence({ sessionId, turn, action, attempt = null, strikes, carry, respondsTo = null }) {
  const evidence = { sessionId, turn, action, attempt, strikes, carry, respondsTo: respondsTo ? { ...respondsTo } : null }
  const check = validateInterventionEvidence(evidence)
  if (!check.ok) throw new TypeError(`Invalid intervention evidence: ${check.errors.join('; ')}`)
  return freeze(evidence)
}
