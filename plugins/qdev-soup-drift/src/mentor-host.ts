import type { Context } from '@deepseek-ai/cordis'
// @ts-expect-error JavaScript status module has no declaration file.
import { createInterventionStatusHandler } from '../status.mjs'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
// @ts-expect-error JavaScript runtime has no declaration file.
import { createPluginRuntime } from '../runtime.mjs'
// @ts-expect-error JavaScript monitor module has no declaration file.
import { toSignal } from '../monitor.mjs'
import type { Live } from './live.js'
import type { StatusBoard } from './status-board.js'
import type { DeliveryRecord, DriftEvidence, InterventionEvidence, Effective, Intervention, MentorContext, MentorStoredState, RegisterEntry, Resolved, Table } from './types.js'

// Host-native seam: Cordis already routes named events between plugins (ctx.on / ctx.parallel), so no bus of our
// own is introduced. Provisional names; the version is part of the name (DRIFT_/INTERVENTION_EVIDENCE_EVENT in soup-core.mjs).
declare module '@deepseek-ai/cordis' {
  interface Events {
    'qdev-soup/drift-evidence/v1'(evidence: DriftEvidence): void
    'qdev-soup/intervention-evidence/v1'(evidence: InterventionEvidence): void
    // 0.9.0 contract, kept for older peers; shape is monitor.mjs toSignal().
    'qdev-soup/signal'(signal: Record<string, unknown>): void
  }
}

const messageText = (answer: { answers: Array<{ selected: string[]; custom?: string }> }): string => {
  const item = answer.answers[0]
  return item?.custom?.trim() || item?.selected?.join(', ') || 'Continue with the original plan.'
}

// Builds one runtime per chat: the SOUP monitor plus every consumer wired to its signal (mentor, status, live view).
export function createRuntimeFactory({ ctx, resolved, agents, runtimes, pendingMessages, interventions, runningDetectors, effectiveSettings,
  initialMentorState, mentorContexts, registerTable, live, board, noteMissing }: {
  ctx: Context
  resolved: Resolved
  agents: Map<string, Agent>
  runtimes: Map<string, ReturnType<typeof createPluginRuntime>>
  pendingMessages: Map<string, DeliveryRecord>
  interventions: Map<string, Intervention>
  runningDetectors: Set<string>
  effectiveSettings: (id: string) => Effective
  initialMentorState: Record<string, MentorStoredState>
  mentorContexts: Map<string, MentorContext>
  registerTable: Table<RegisterEntry>
  live: Live
  board: StatusBoard
  noteMissing: (service: string) => void
}) {
  const { ensureSessionLive, persistLive } = live
  // Status is a PEER consumer of Mentor's derived evidence (intervention evidence), not part of Mentor.
  const interventionStatus = createInterventionStatusHandler({ status: board.status })
  // WHY ctx.parallel and not ctx.emit: Cordis `emit` calls listeners in a bare map, so one throwing listener stops
  // every later listener and the exception escapes into SOUP. `parallel` runs every listener and aggregates failures
  // into one rejection, recorded here as a consumer diagnostic (never a measurement failure).
  // `consumer` names the channel so a status error says which peer channel failed. The 0.9.0 signal is not gated on
  // lifecycle (it was always published); the evidence channels are.
  const publishNative = (sessionId: string, consumer: string, send: () => Promise<void>, gated = true): void => {
    if (gated && board.status.lifecycle.state !== 'active') return
    const report = (error: unknown): void => {
      const failures = error instanceof AggregateError ? error.errors : [error]
      for (const failure of failures) board.recordError(failure, { phase: 'consumer', consumer, sessionId } as { phase: string; sessionId: string })
    }
    try { send().catch(report) } catch (error) { report(error) }
  }
  // Event names are literals so they are type-checked against the Events augmentation above.
  const nativeDrift = (evidence: DriftEvidence): void => publishNative(evidence.sessionId, 'peer:qdev-soup/drift-evidence/v1', () => ctx.parallel('qdev-soup/drift-evidence/v1', evidence))
  const nativeIntervention = (evidence: InterventionEvidence): void => publishNative(evidence.sessionId, 'peer:qdev-soup/intervention-evidence/v1', () => ctx.parallel('qdev-soup/intervention-evidence/v1', evidence))
  const { status, abortIntervention, recordError, noteEvaluation, updateMentorStatus } = board
  const deliver = (agent: Agent, record: DeliveryRecord, text: string, form: 'reminder' | 'escalation' | 'clarification', report?: { kl_divergence?: number; threshold?: number }): void => {
    const effective = effectiveSettings(String(agent.id))
    if (!effective.enabled || !effective.reanchoring) {
      record.state = 'failed'
      record.error = 'Intervention disabled for this chat'
      return
    }
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: {
        kind: 'qdev-trajectory-drift-soup' as const,
        form,
        ...(record.attempt === undefined ? {} : { attempt: record.attempt }),
        ...(typeof report?.kl_divergence === 'number' ? { kl: report.kl_divergence } : {}),
        ...(typeof report?.threshold === 'number' ? { threshold: report.threshold } : {}),
      },
    })
    record.messageId = String(message.id)
    pendingMessages.set(record.messageId, record)
    agent.inject(message)
  }

  const getRuntime = (id: string): ReturnType<typeof createPluginRuntime> => {
    const existing = runtimes.get(id)
    if (existing) return existing
    const runtime = createPluginRuntime({
    ...effectiveSettings(id),
    initialMentorState: { [id]: initialMentorState[id] },
    contextFor: (sessionKey: string) => mentorContexts.get(String(sessionKey)) ?? {},
    // Spec B1: the bypass is on only when the global switch AND this chat's switch are both on.
    bypassFor: (sessionKey: string) => resolved.escalationBypass === true && mentorContexts.get(String(sessionKey))?.escalationBypass === true,
    onRegister: (entry: { id: string; turn: number; drift: number; sent: 'first' | 'full'; at: number }) => {
      // Spec B4-B5: the register is appended on every drift and never cleared.
      void registerTable.put(`${entry.id}:${entry.drift}:${entry.at}`, entry).catch((error: unknown) => ctx.logger.warn('SOUP register write failed: %s', error instanceof Error ? error.message : String(error)))
    },
    onMentorStateChange: updateMentorStatus,
    inject: ({ id, turn, attempt, reminder, report }: { id: string; turn: number; attempt: number; reminder: string; report: { kl_divergence: number; threshold: number } }) => {
      const live = ensureSessionLive(id)
      live.mentorActivity = 'reminding'
      const record: DeliveryRecord = { kind: 'reminder', attempt, sessionId: id, turn, requestedAt: Date.now(), state: 'pending' }
      status.mentor.reminders.push(record)
      status.mentor.reminders.splice(0, Math.max(0, status.mentor.reminders.length - 6))
      status.mentor.state = 'reminding'
      const agent = agents.get(id)
      if (!agent) {
        record.state = 'failed'
        record.error = 'No live receiving agent'
        live.mentorActivity = 'error'
        status.mentor.state = 'error'
        ctx.logger.warn('SOUP reminder could not be injected: no agent session=%s', id)
        return
      }
      deliver(agent, record, reminder, 'reminder', report)
    },
    escalate: ({ id, turn, question, report }: { id: string; turn: number; question: string; report: { kl_divergence: number; threshold: number } }) => {
      // Never replace a live controller without aborting it: a late answer from an
      // older question must not reset the current guard or inject clarification.
      abortIntervention(id)
      const record: DeliveryRecord = { kind: 'escalation', sessionId: id, turn, requestedAt: Date.now(), state: 'pending' }
      status.mentor.escalation = record
      status.mentor.state = 'escalated'
      const agent = agents.get(id)
      if (!agent) {
        record.state = 'failed'
        record.error = 'No live receiving agent'
        status.mentor.state = 'error'
        return
      }
      deliver(agent, record, `SOUP measured repeated trajectory drift and paused automatic reanchoring. ${question}`, 'escalation', report)
      const questions = ctx.get('userQuestions')
      if (!questions) {
        // Without the human-question service the escalation message is still delivered; only the dialog is unavailable.
        noteMissing('userQuestions')
        record.state = 'failed'
        record.error = 'User questions service unavailable'
        status.mentor.state = 'error'
        ctx.logger.warn('SOUP escalation question unavailable: no userQuestions service session=%s', id)
        return
      }
      const controller = new AbortController()
      interventions.set(id, { controller, record })
      const signal = controller.signal
      void questions.ask({
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
        const effective = effectiveSettings(id)
        if (signal.aborted || !effective.enabled || !effective.reanchoring) return
        record.state = 'answered'
        const resetAnswer = answer.answers.find((item) => item.id === 'reset-drift-count')
        if (resetAnswer) runtime.decideDriftReset(id, resetAnswer.selected.includes('Yes — reset to 0'))
        const clarification: DeliveryRecord = { kind: 'clarification', sessionId: id, turn, requestedAt: Date.now(), state: 'pending' }
        deliver(agent, clarification, `Human clarification after SOUP escalation:\n\n${messageText(answer)}`, 'clarification')
        status.mentor.lastOutcome = resetAnswer?.selected.includes('Yes — reset to 0')
          ? 'Human clarification delivered; drift count reset to 0.'
          : 'Human clarification delivered; three qualifying drifts carried forward.'
      }).catch((error: unknown) => {
        if (signal.aborted) return
        record.state = 'failed'
        record.error = error instanceof Error ? error.message : String(error)
        status.mentor.state = 'error'
        recordError(error, { phase: 'human-escalation', sessionId: id })
      }).finally(() => {
        if (interventions.get(id)?.controller === controller) interventions.delete(id)
      })
    },
    notify: ({ sessionId, turn, singleTurn, result }: { sessionId: string; turn: number | null; singleTurn: boolean; result: { kl_divergence: number; threshold: number } }) => {
      status.detector.drifts += 1
      ctx.logger.warn('SOUP DRIFT session=%s turn=%s KL=%s threshold=%s singleTurn=%s', sessionId, turn ?? '-', result.kl_divergence, result.threshold, singleTurn)
    },
    reportMissing: ({ id }: { id: string }) => {
      status.mentor.lastOutcome = 'Original intent unavailable; reminder suppressed.'
      ctx.logger.warn('SOUP original intent unavailable session=%s', id)
    },
    reportStale: ({ id, turn, reportTurn }: { id: string; turn: number; reportTurn: number | null }) => {
      status.mentor.lastOutcome = 'Stale cross-turn drift result suppressed.'
      ctx.logger.info('SOUP stale drift suppressed session=%s currentTurn=%s reportTurn=%s', id, turn, reportTurn ?? '-')
    },
    onObservation: ({ sessionId, baselineSize, baselineTarget, windowSize, windowTarget, pending }: { sessionId: string; baselineSize: number; baselineTarget: number; windowSize: number; windowTarget: number; pending: boolean }) => {
      const live = ensureSessionLive(sessionId)
      live.baselineSize = baselineSize
      live.windowSize = windowSize
      live.pending = pending
      if (pending) runningDetectors.add(sessionId)
      else runningDetectors.delete(sessionId)
      if (status.detector.state !== 'disabled') {
        status.detector.state = runningDetectors.size ? 'running' : live.lastError ? 'error' : 'idle'
      }
      status.trajectory.state = 'observing'
      status.trajectory.lastSessionId = sessionId
      status.trajectory.baselineSize = baselineSize
      status.trajectory.baselineTarget = baselineTarget
      status.trajectory.windowSize = windowSize
      status.trajectory.windowTarget = windowTarget
    },
    onEvaluationStart: ({ sessionId }: { sessionId: string }) => {
      const live = ensureSessionLive(sessionId)
      live.pending = true
      live.lastStartedAt = Date.now()
      delete live.lastError
      runningDetectors.add(sessionId)
      status.detector.state = 'running'
      status.detector.lastStartedAt = live.lastStartedAt
    },
    onEvaluation: ({ sessionId, turn, singleTurn, result }: { sessionId: string; turn: number | null; singleTurn: boolean; result: { kl_divergence: number; threshold: number; drift_detected: boolean } }) => {
      // The monitor's delivered value: any plugin can listen for 'qdev-soup/signal' on the context without
      // importing this package. Published before any bookkeeping so no consumer can stand between measurement and delivery.
      // Isolated like the evidence channels (ctx.parallel, guarded): a throwing or rejecting peer cannot stop the
      // bookkeeping below. Event name and payload are the 0.9.0 contract, unchanged.
      publishNative(sessionId, 'peer:qdev-soup/signal', () => ctx.parallel('qdev-soup/signal', toSignal({ sessionId, turn, singleTurn, result })), false)
      const live = ensureSessionLive(sessionId)
      live.evaluations += 1
      if (result.drift_detected) live.drifts += 1
      live.klTotal += result.kl_divergence
      live.history.push({ at: Date.now(), kl: result.kl_divergence, threshold: result.threshold, drift: result.drift_detected })
      if (live.history.length > 50) live.history.splice(0, live.history.length - 50)
      if (result.drift_detected) live.markers.push({ at: Date.now(), kind: 'crossing' })
      if (live.markers.length > 50) live.markers.splice(0, live.markers.length - 50)
      persistLive(sessionId, live)
      live.lastCompletedAt = Date.now()
      live.lastResult = {
        sessionId,
        turn,
        singleTurn,
        klDivergence: result.kl_divergence,
        threshold: result.threshold,
        driftDetected: result.drift_detected,
        completedAt: live.lastCompletedAt,
      }
      delete live.lastError
      if (live.pending) runningDetectors.add(sessionId)
      else runningDetectors.delete(sessionId)
      status.detector.state = runningDetectors.size ? 'running' : 'idle'
      status.detector.evaluations += 1
      noteEvaluation({ turn, result })
      status.detector.lastCompletedAt = live.lastCompletedAt
      status.detector.lastResult = {
        sessionId,
        turn,
        singleTurn,
        klDivergence: result.kl_divergence,
        threshold: result.threshold,
        driftDetected: result.drift_detected,
      }
    },
    onError: (error: unknown, details: { phase?: string; sessionId?: string } = {}) => {
      // A downstream consumer failure (notify/Mentor/observers) or a drop diagnostic is not a measurement failure.
      const measurement = !['consumer', 'drop', 'evidence'].includes(details.phase ?? '') && !details.phase?.startsWith('consumer:')
      if (details.sessionId && measurement) {
        const live = ensureSessionLive(details.sessionId)
        if (live.pending) runningDetectors.add(details.sessionId)
        else runningDetectors.delete(details.sessionId)
        live.lastError = {
          at: Date.now(),
          message: error instanceof Error ? error.message : String(error),
          ...(details.phase === undefined ? {} : { phase: details.phase }),
        }
      }
      recordError(error, details)
    },
    })
    // Peer consumers wired beside Mentor: the status counter and the native Cordis publication.
    runtime.subscribe('intervention', (evidence: InterventionEvidence) => {
      interventionStatus(evidence)
      const record = ensureSessionLive(evidence.sessionId)
      const counts = record.interventions ??= { total: 0, reminders: 0, escalations: 0, resets: 0, carries: 0 }
      const key = ({ reminder: 'reminders', escalation: 'escalations', reset: 'resets', carry: 'carries' } as const)[evidence.action]
      counts[key] += 1
      counts.total += 1
    }, 'status-interventions')
    runtime.subscribe('evaluation', nativeDrift, 'native-drift-evidence')
    runtime.subscribe('intervention', nativeIntervention, 'native-intervention-evidence')
    runtimes.set(id, runtime)
    return runtime
  }
  return getRuntime
}
