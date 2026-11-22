import type { Context } from '@deepseek-ai/cordis'
// @ts-expect-error JavaScript status module has no declaration file.
import { createInterventionStatusHandler } from '../status.mjs'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
// @ts-expect-error JavaScript runtime has no declaration file.
import { createPluginRuntime } from '../runtime.mjs'
// @ts-expect-error JavaScript actions module has no declaration file.
import { createInjectAction } from '../mentor-actions.mjs'
// @ts-expect-error JavaScript monitor module has no declaration file.
import { toSignal } from '../monitor.mjs'
import type { Live } from './live.js'
import type { StatusBoard } from './status-board.js'
import type { ActionResult, DeliveryRecord, DriftEvidence, InterventionEvidence, Effective, Intervention, MentorContext, MentorStoredState, RegisterEntry, Resolved, Table } from './types.js'

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
  // Mentor DECIDES (reanchor.mjs); the inject action CARRIES OUT a reminder or an escalation (mentor-actions.mjs). This
  // adapter is everything Harness-specific that action needs. The splice confirmation (src/index.ts, agent/inbox/spliced)
  // and abortIntervention (status-board.ts) stay where they are: they react to Harness events (inbox, settings, disposal),
  // not to a Mentor decision, and they reach the action's records only through pendingMessages / interventions.
  const injectAction = createInjectAction({
    enabled: (id: string) => { const effective = effectiveSettings(id); return effective.enabled && effective.reanchoring },
    agentFor: (id: string) => agents.get(id),
    live: ensureSessionLive,
    mentor: status.mentor,
    makeMessage: ({ text, form, attempt, kl, threshold }: { text: string; form: 'reminder' | 'escalation' | 'clarification'; attempt?: number; kl?: number; threshold?: number }) => createUserMessage({
      content: [{ type: 'text', text }],
      source: {
        kind: 'qdev-trajectory-drift-soup' as const,
        form,
        ...(attempt === undefined ? {} : { attempt }),
        ...(typeof kl === 'number' ? { kl } : {}),
        ...(typeof threshold === 'number' ? { threshold } : {}),
      },
    }),
    track: (record: DeliveryRecord) => { pendingMessages.set(String(record.messageId), record) },
    send: (agent: Agent, message: ReturnType<typeof createUserMessage>) => { agent.inject(message) },
    warn: (text: string) => ctx.logger.warn(text),
    abort: abortIntervention,
    interventions,
    questions: () => ctx.get('userQuestions'),
    noteMissing,
    // runtime is assigned below, before any drift can reach this call.
    decide: (id: string, reset: boolean) => runtimes.get(id)?.decideDriftReset(id, reset),
    recordError,
  })
  // Each action's outcome, newest last, six kept (like status.mentor.reminders). A new field; no existing field changes.
  const noteActionResult = (result: ActionResult): void => {
    const list = status.mentor.actionResults ??= []
    list.push({ ...result, at: Date.now() })
    list.splice(0, Math.max(0, list.length - 6))
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
    actions: [injectAction],
    onActionResult: noteActionResult,
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
