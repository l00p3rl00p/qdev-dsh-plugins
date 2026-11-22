// GENTLE MENTOR ACTIONS. WHY: Mentor DECIDES (reminder 1, reminder 2, ask the human on the third strike, reset/carry; see
// reanchor.mjs). HOW a decision is carried out is a separate thing: an ACTION. Today the one action is "inject a reminder
// into the chat". Later an action might start another skill, a Python script or a Rust program; that is added as another
// action, not by editing the decision code.
//
// Host-independent on purpose: no Cordis, no DSH, no zod imports. The Harness-specific pieces reach the inject action
// through ONE small adapter object (see createInjectAction).
//
// Contract
//   action  = { name: string, run(request) }           run may be sync or async and may return a result object or nothing
//   request = { kind: 'reminder' | 'escalation', attempt, strikes, respondsTo, text }   (frozen)
//     respondsTo = the drift evidence reference { sessionId, turn, kl_divergence, threshold } this action answers
//   result  = nothing (counts as ok) or { ok?: boolean, error?: string }; ok === false means the action failed
// Each action is isolated: a throw or a rejection is reported (phase 'consumer', consumer 'action:<name>') and never stops
// the other actions, the measurement, or Mentor's own state. There is no registry, no bus and no SDK: Mentor is handed an
// ordered list at construction.

const message = (error) => (error instanceof Error ? error.message : String(error))

// Fail early, at construction, on a malformed action list (a silent skip at drift time would hide the mistake).
export function validateActions(actions) {
  if (!Array.isArray(actions)) throw new TypeError('actions must be an array')
  for (const action of actions) {
    if (!action || typeof action.name !== 'string' || !action.name || typeof action.run !== 'function') {
      throw new TypeError('each action needs a name (string) and run(request) (function)')
    }
  }
  return [...actions]
}

// Start every action in list order. Synchronous parts run synchronously (so the first action's effect is visible
// before the next one starts); an async action is not awaited, so a slow one never delays Mentor or the others.
export function runActions(actions, request, { reportError = () => {}, onResult = () => {} } = {}) {
  const base = { kind: request.kind, sessionId: request.respondsTo?.sessionId, turn: request.respondsTo?.turn ?? null, attempt: request.attempt }
  // Callbacks are the host's; a throwing one must not break the loop either.
  const safe = (fn, ...args) => { try { fn(...args) } catch { /* nothing further can be reported */ } }
  for (const action of actions) {
    const failed = (error) => {
      safe(reportError, error, { sessionId: base.sessionId, turn: base.turn, phase: 'consumer', consumer: `action:${action.name}` })
      safe(onResult, { name: action.name, ...base, ok: false, error: message(error) })
    }
    const settled = (result) => safe(onResult, {
      name: action.name, ...base, ok: result?.ok !== false, ...(result?.ok === false && result.error ? { error: String(result.error) } : {}),
    })
    try {
      const returned = action.run(request)
      if (typeof returned?.then === 'function') returned.then(settled, failed)
      else settled(returned)
    } catch (error) { failed(error) }
  }
}

const HUMAN_ANSWER_TEXT = (answer) => {
  const item = answer.answers[0]
  return item?.custom?.trim() || item?.selected?.join(', ') || 'Continue with the original plan.'
}

// The built-in action: put the reminder (or the escalation message and the human question) into the chat's inbox.
// This is the former delivery code of src/mentor-host.ts, moved without a change in behaviour.
//
// adapter = the Harness side, supplied by the host (all required unless marked):
//   enabled(sessionId) -> boolean            this chat is enabled AND reanchoring is on
//   agentFor(sessionId) -> agent | undefined the live receiving agent
//   live(sessionId) -> { mentorActivity }    the per-chat live record (marker/activity bookkeeping stays with the host)
//   mentor                                   the status.mentor object (state, reminders, escalation, lastOutcome)
//   makeMessage({ text, form, attempt?, kl?, threshold? }) -> message with an id   builds the host's user message
//   track(record)                            remember a record by record.messageId until the inbox confirms it
//   send(agent, message)                     put the message into the agent's inbox
//   warn(text)                               log a warning
//   abort(sessionId)                         cancel a live human question for this chat
//   interventions: Map                       sessionId -> { controller, record } of the live human question
//   questions() -> service | undefined       the optional human-question service
//   noteMissing(service)                     record that an optional service is absent
//   decide(sessionId, reset)                 hand the human's reset/carry answer back to Mentor
//   recordError(error, details)              record an error in status
export function createInjectAction(adapter) {
  const { enabled, agentFor, live, mentor, makeMessage, track, send, warn, abort, interventions, questions, noteMissing, decide, recordError } = adapter

  const deliver = (agent, record, text, form, report) => {
    if (!enabled(String(agent.id))) {
      record.state = 'failed'
      record.error = 'Intervention disabled for this chat'
      return
    }
    const message = makeMessage({
      text,
      form,
      ...(record.attempt === undefined ? {} : { attempt: record.attempt }),
      ...(typeof report?.kl_divergence === 'number' ? { kl: report.kl_divergence } : {}),
      ...(typeof report?.threshold === 'number' ? { threshold: report.threshold } : {}),
    })
    record.messageId = String(message.id)
    track(record)
    send(agent, message)
  }

  const reminder = ({ attempt, respondsTo, text }) => {
    const id = respondsTo.sessionId
    const turn = respondsTo.turn
    const liveRecord = live(id)
    liveRecord.mentorActivity = 'reminding'
    const record = { kind: 'reminder', attempt, sessionId: id, turn, requestedAt: Date.now(), state: 'pending' }
    mentor.reminders.push(record)
    mentor.reminders.splice(0, Math.max(0, mentor.reminders.length - 6))
    mentor.state = 'reminding'
    const agent = agentFor(id)
    if (!agent) {
      record.state = 'failed'
      record.error = 'No live receiving agent'
      liveRecord.mentorActivity = 'error'
      mentor.state = 'error'
      warn(`SOUP reminder could not be injected: no agent session=${id}`)
      return { ok: false, error: record.error }
    }
    deliver(agent, record, text, 'reminder', respondsTo)
    return record.state === 'failed' ? { ok: false, error: record.error } : { ok: true }
  }

  const escalation = ({ respondsTo, text: question }) => {
    const id = respondsTo.sessionId
    const turn = respondsTo.turn
    const report = respondsTo
    // Never replace a live controller without aborting it: a late answer from an
    // older question must not reset the current guard or inject clarification.
    abort(id)
    const record = { kind: 'escalation', sessionId: id, turn, requestedAt: Date.now(), state: 'pending' }
    mentor.escalation = record
    mentor.state = 'escalated'
    const agent = agentFor(id)
    if (!agent) {
      record.state = 'failed'
      record.error = 'No live receiving agent'
      mentor.state = 'error'
      return { ok: false, error: record.error }
    }
    deliver(agent, record, `SOUP measured repeated trajectory drift and paused automatic reanchoring. ${question}`, 'escalation', report)
    const service = questions()
    if (!service) {
      // Without the human-question service the escalation message is still delivered; only the dialog is unavailable.
      noteMissing('userQuestions')
      record.state = 'failed'
      record.error = 'User questions service unavailable'
      mentor.state = 'error'
      warn(`SOUP escalation question unavailable: no userQuestions service session=${id}`)
      return { ok: false, error: record.error }
    }
    const controller = new AbortController()
    interventions.set(id, { controller, record })
    const signal = controller.signal
    void service.ask({
      agent,
      signal,
      questions: [{
        id: 'trajectory-clarification',
        header: 'Trajectory drift',
        question,
        detail: `SOUP detected a third qualifying drift window (KL ${report.kl_divergence.toFixed(4)}, threshold ${report.threshold}). Your response will be delivered to the agent.`,
      }, {
        id: 'reset-drift-count',
        header: 'Drift accountability',
        question: 'Reset the accumulated qualifying-drift count?',
        detail: 'Reset starts the reminder policy from zero. Keep carries the three strikes forward, so the next qualifying drift escalates immediately.',
        options: [
          { label: 'Yes — reset to 0', description: 'Give the corrected trajectory a fresh two-reminder allowance.' },
          { label: 'No — carry 3 forward', description: 'Keep accountability across turns; the next qualifying drift escalates.' },
        ],
      }],
    }).then((answer) => {
      if (signal.aborted || !enabled(id)) return
      record.state = 'answered'
      const resetAnswer = answer.answers.find((item) => item.id === 'reset-drift-count')
      if (resetAnswer) decide(id, resetAnswer.selected.includes('Yes — reset to 0'))
      const clarification = { kind: 'clarification', sessionId: id, turn, requestedAt: Date.now(), state: 'pending' }
      deliver(agent, clarification, `Human clarification after SOUP escalation:\n\n${HUMAN_ANSWER_TEXT(answer)}`, 'clarification')
      mentor.lastOutcome = resetAnswer?.selected.includes('Yes — reset to 0')
        ? 'Human clarification delivered; drift count reset to 0.'
        : 'Human clarification delivered; three qualifying drifts carried forward.'
    }).catch((error) => {
      if (signal.aborted) return
      record.state = 'failed'
      record.error = error instanceof Error ? error.message : String(error)
      mentor.state = 'error'
      recordError(error, { phase: 'human-escalation', sessionId: id })
    }).finally(() => {
      if (interventions.get(id)?.controller === controller) interventions.delete(id)
    })
    return record.state === 'failed' ? { ok: false, error: record.error } : { ok: true }
  }

  return {
    name: 'inject',
    run: (request) => (request.kind === 'escalation' ? escalation(request) : reminder(request)),
  }
}
