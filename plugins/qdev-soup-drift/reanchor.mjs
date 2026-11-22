import { createInterventionEvidence } from './soup-core.mjs'
import { runActions, validateActions } from './mentor-actions.mjs'

// Feature 5: the first qualifying drift injects exactly this sentence and nothing else.
export const FIRST_DRIFT_MESSAGE = 'I think what you are doing is interesting; however, I would like to return focus to the current plan.'
// The Gentle Mentor message used by the second qualifying drift. Editable per chat in Feature 4.
export const GENTLE_MENTOR_MESSAGE = "I noticed you might be drifting slightly off plan. Can you use this to get back on track and help me succeed? If you have questions for me, need clarification, or would like me to clarify anything, I'm happy to help so we can both succeed."
// Second drift: the Gentle Mentor message, then the current plan, then any amendments (one "- " line each).
export const secondDriftReminder = ({ message = GENTLE_MENTOR_MESSAGE, plan, amendments = [] }) => [
  message,
  '',
  'Current plan:',
  '',
  plan,
  ...(amendments.length ? ['', 'Plan amendments:', ...amendments.map((item) => `- ${item}`)] : []),
].join('\n')
export const HUMAN_QUESTION = "I'm having some difficulty staying aligned with the original plan. Could you help me clarify what I'm missing before I continue?"

const textOf = (message) => message?.content
  ?.filter((block) => block?.type === 'text' && typeof block.text === 'string')
  .map((block) => block.text)
  .join('\n')
  .trim() ?? ''

const safeCount = (value) => Number.isInteger(value) && value >= 0 ? value : 0

export function createReanchor({
  inject,
  escalate,
  reportMissing = () => {},
  reportStale = () => {},
  initialState = {},
  onStateChange = () => {},
  // Feature 4: per-chat Gentle Mentor context { message?, plan?, amendments? }. Read at each intervention.
  contextFor = () => ({}),
  // Escalation bypass (spec B1-B3). Off by default, so existing behaviour is unchanged.
  // When on, a chat never escalates: drifts send the first-drift sentence, and every 10th drift sends the full message.
  bypassFor = () => false,
  onRegister = () => {},
  // DERIVED evidence: Mentor publishes what it did (see soup-core.mjs). It is a consumer of drift evidence AND a
  // producer of intervention evidence; who listens is not its business.
  publish = () => {},
  reportEvidenceError = () => {},
  // HOW a decision is carried out (mentor-actions.mjs). An ordered list of { name, run(request) }; each is isolated.
  // When the list is non-empty it REPLACES the inject/escalate callbacks above (they are not called), so a decision is
  // never carried out twice. With no actions the callbacks behave exactly as before (existing tests pin that).
  actions = [],
  reportActionError = () => {},
  onActionResult = () => {},
}) {
  const secondDriftFields = (id, original) => {
    const override = contextFor(id) ?? {}
    return { message: override.message ?? GENTLE_MENTOR_MESSAGE, plan: override.plan ?? original, amendments: override.amendments ?? [] }
  }
  const actionList = validateActions(actions)
  if (!actionList.length && (typeof inject !== 'function' || typeof escalate !== 'function')) throw new TypeError('Callbacks required')
  // WHY here and not in the policy below: the strikes/reminder/ask-the-human DECISION is unchanged; only the hand-off of
  // a made decision goes through this one place. Actions run after the old-style callback slot and BEFORE `announce`.
  const carryOut = (kind, current, respondsTo, text, legacy) => {
    if (!actionList.length) return legacy()
    runActions(actionList, Object.freeze({
      kind, attempt: kind === 'reminder' ? current.detections : null, strikes: current.detections, respondsTo: Object.freeze({ ...respondsTo }), text,
    }), { reportError: reportActionError, onResult: onActionResult })
  }
  const state = new Map()

  function get(id) {
    const key = String(id)
    if (!state.has(key)) {
      const saved = initialState[key] ?? {}
      const carry = safeCount(saved.carry)
      state.set(key, {
        intent: null,
        turn: null,
        detections: carry,
        carry,
        escalated: false,
        decisionPending: saved.decisionPending === true,
      })
    }
    return state.get(key)
  }

  function publicState(id, current = get(id)) {
    return {
      sessionId: String(id),
      turn: current.turn,
      driftCount: current.detections,
      carry: current.carry,
      decisionPending: current.decisionPending,
      escalated: current.escalated,
    }
  }

  function changed(id, current) {
    onStateChange(publicState(id, current))
  }

  // Evidence is derived and optional: building or publishing it must never change the policy outcome.
  function announce(id, current, action, extra) {
    try {
      publish(createInterventionEvidence({
        sessionId: String(id), turn: current.turn, action, strikes: current.detections, carry: current.carry, ...extra,
      }))
    } catch (error) {
      try { reportEvidenceError(error, { sessionId: String(id), turn: current.turn, phase: 'evidence' }) } catch { /* last resort */ }
    }
  }

  return {
    observe(id, event) {
      const current = get(id)
      if (event?.type === 'user/message' && event.data?.source?.kind === 'user' && current.intent === null) {
        current.intent = structuredClone(event.data)
      }
      if (event?.type === 'turn/start' && Number.isInteger(event.data?.turn) && event.data.turn !== current.turn) {
        current.turn = event.data.turn
        current.detections = current.carry
        current.escalated = false
      }
    },
    drift(id, report) {
      if (report?.drift_detected !== true) return 'no-drift'
      const current = get(id)
      const original = textOf(current.intent)
      const reportTurn = Number.isInteger(report.turn) ? report.turn : null
      if (!original || !Number.isInteger(current.turn)) {
        reportMissing({ id, turn: current.turn, report })
        return 'missing-intent'
      }
      if (reportTurn !== current.turn) {
        reportStale({ id, turn: current.turn, reportTurn, report })
        return 'stale-turn'
      }
      if (current.decisionPending) return 'awaiting-reset-decision'
      // Reference to the drift evidence this action answers (identity + the measured numbers).
      const respondsTo = { sessionId: String(id), turn: reportTurn, kl_divergence: report.kl_divergence, threshold: report.threshold }
      if (bypassFor(id)) {
        // Spec B2-B3: never escalate. Every 10th drift sends the full message; the rest send the first sentence.
        current.detections += 1
        const full = current.detections % 10 === 0
        const reminder = full ? secondDriftReminder(secondDriftFields(id, original)) : FIRST_DRIFT_MESSAGE
        onRegister({ id, turn: current.turn, drift: current.detections, sent: full ? 'full' : 'first', at: Date.now() })
        carryOut('reminder', current, respondsTo, reminder, () => inject({ id, turn: current.turn, attempt: current.detections, original: current.intent, reminder, report }))
        announce(id, current, 'reminder', { attempt: current.detections, respondsTo })
        return 'injected'
      }
      if (current.escalated) return 'already-escalated'
      current.detections += 1
      if (current.detections >= 3) {
        current.carry = Math.max(3, current.detections)
        current.decisionPending = true
        current.escalated = true
        changed(id, current)
        // Remembered so a later reset/carry decision can reference the drift that caused the escalation.
        current.escalatedOn = respondsTo
        carryOut('escalation', current, respondsTo, HUMAN_QUESTION, () => escalate({ id, turn: current.turn, detections: current.detections, original: current.intent, question: HUMAN_QUESTION, report }))
        announce(id, current, 'escalation', { respondsTo })
        return 'human'
      }
      const normalReminder = current.detections === 1 ? FIRST_DRIFT_MESSAGE : secondDriftReminder(secondDriftFields(id, original))
      onRegister({ id, turn: current.turn, drift: current.detections, sent: current.detections === 1 ? 'first' : 'full', at: Date.now() })
      carryOut('reminder', current, respondsTo, normalReminder, () => inject({ id, turn: current.turn, attempt: current.detections, original: current.intent, reminder: normalReminder, report }))
      announce(id, current, 'reminder', { attempt: current.detections, respondsTo })
      return 'injected'
    },
    decide(id, reset) {
      const current = get(id)
      if (!current.decisionPending) return { accepted: false, reason: 'no-pending-decision', ...publicState(id, current) }
      if (reset === true) {
        current.carry = 0
        current.detections = 0
      } else {
        current.carry = Math.max(3, current.carry, current.detections)
        current.detections = current.carry
      }
      current.decisionPending = false
      current.escalated = false
      changed(id, current)
      announce(id, current, reset === true ? 'reset' : 'carry', { respondsTo: current.escalatedOn ?? null })
      current.escalatedOn = null
      return { accepted: true, reset: reset === true, ...publicState(id, current) }
    },
    snapshot(id) {
      return publicState(id)
    },
    // Read-only: the captured original plan text for the Live & Mentor view. Never edited here.
    plan(id) {
      return textOf(get(id).intent)
    },
    dispose() {
      state.clear()
    },
  }
}
