export const GENTLE_REMINDER = (intent) => `I noticed you might be drifting slightly off plan. Here's the original plan:\n\n${intent}\n\nCan you use this to get back on track and help me succeed? If you have questions for me, need clarification, or would like me to clarify anything, I'm happy to help so we can both succeed.`
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
}) {
  if (typeof inject !== 'function' || typeof escalate !== 'function') throw new TypeError('Callbacks required')
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
      if (current.escalated) return 'already-escalated'
      current.detections += 1
      if (current.detections >= 3) {
        current.carry = Math.max(3, current.detections)
        current.decisionPending = true
        current.escalated = true
        changed(id, current)
        escalate({ id, turn: current.turn, detections: current.detections, original: current.intent, question: HUMAN_QUESTION, report })
        return 'human'
      }
      inject({ id, turn: current.turn, attempt: current.detections, original: current.intent, reminder: GENTLE_REMINDER(original), report })
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
      return { accepted: true, reset: reset === true, ...publicState(id, current) }
    },
    snapshot(id) {
      return publicState(id)
    },
    dispose() {
      state.clear()
    },
  }
}
