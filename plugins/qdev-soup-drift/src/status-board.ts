import type { Context } from '@deepseek-ai/cordis'
// @ts-expect-error JavaScript runtime has no declaration file.
import { PRESETS } from '../runtime.mjs'
// @ts-expect-error JavaScript status module has no declaration file.
import { createStatus, createDriftSummary, deriveOperationalState, recordError as recordStatusError } from '../status.mjs'
import { PACKAGE_NAME, SOURCE, VERSION } from './constants.js'
import type { Effective, Intervention, MentorSnapshot, Resolved, RuntimeStatus, Table, MentorStoredState } from './types.js'
import type { Agent } from '@deepseek-ai/dsh-agent'

// The status object served at the status route, and the bookkeeping that keeps it current.
export function createStatusBoard({ ctx, resolved, degraded, agents, runningDetectors, interventions, effectiveSettings, mentorTable }: {
  ctx: Context
  resolved: Resolved
  degraded: string[]
  agents: Map<string, Agent>
  runningDetectors: Set<string>
  interventions: Map<string, Intervention>
  effectiveSettings: (id: string) => Effective
  mentorTable: Table<MentorStoredState>
}) {
  // The shape and the rules (initial object, error recording, operational state, drift summary) live in the
  // host-independent status.mjs; this module only binds them to the Harness (logger, agents, storage).
  const status: RuntimeStatus = createStatus({
    identity: {
      name: PACKAGE_NAME,
      version: VERSION,
      description: 'SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.',
      source: SOURCE,
    },
    resolved,
    threshold: PRESETS[resolved.preset],
    degraded,
  })

  const abortIntervention = (id: string): void => {
    const pending = interventions.get(id)
    if (!pending) return
    pending.controller.abort()
    pending.record.state = 'failed'
    pending.record.error = 'Cancelled by SOUP settings or session disposal'
    interventions.delete(id)
  }
  const refreshOperationalState = (): void => {
    const next = deriveOperationalState({
      resolved,
      configurations: [...agents.keys()].map(effectiveSettings),
      runningCount: runningDetectors.size,
      trajectoryState: status.trajectory.state,
      resetRequired: Boolean(status.mentor.resetDecision?.required),
    })
    status.trajectory.state = next.trajectory
    status.detector.state = next.detector
    status.mentor.state = next.mentor
  }

  const recordError = (error: unknown, details: { phase?: string; sessionId?: string } = {}): void => {
    const message = recordStatusError(status, error, details)
    ctx.logger.error('SOUP drift error phase=%s session=%s: %s', details.phase ?? 'runtime', details.sessionId ?? '-', message)
  }
  // P4: cumulative averages stay, but humanSummary follows the RECENT evaluations.
  const driftSummary = createDriftSummary()
  const mentorSnapshots = new Map<string, {
    sessionId: string
    turn: number | null
    driftCount: number
    carry: number
    decisionPending: boolean
    escalated: boolean
  }>()
  const updateMentorStatus = (snapshot: {
    sessionId: string
    turn: number | null
    driftCount: number
    carry: number
    decisionPending: boolean
    escalated: boolean
  }, persist = true): void => {
    mentorSnapshots.set(snapshot.sessionId, snapshot)
    status.mentor.driftCount = snapshot.driftCount
    status.mentor.carriedDrifts = snapshot.carry
    const pending = [...mentorSnapshots.values()].find((item) => item.decisionPending)
    if (pending) {
      status.mentor.resetDecision = { required: true, sessionId: pending.sessionId, turn: pending.turn }
    } else {
      delete status.mentor.resetDecision
      if (status.mentor.state === 'escalated') status.mentor.state = 'ready'
    }
    if (persist) {
      void mentorTable.put(snapshot.sessionId, {
        carry: snapshot.carry,
        decisionPending: snapshot.decisionPending,
      }).catch((error: unknown) => recordError(error, { phase: 'mentor-state-persist', sessionId: snapshot.sessionId }))
    }
  }

  // Called once per finished SOUP calculation.
  const noteEvaluation = ({ turn, result }: { turn: number | null; result: { kl_divergence: number; threshold: number; drift_detected: boolean } }): void => {
    driftSummary.record({ turn, result, at: Date.now() })
    driftSummary.applyTo(status.detector)
  }
  return { status, abortIntervention, refreshOperationalState, recordError, noteEvaluation, mentorSnapshots, updateMentorStatus }
}
export type StatusBoard = ReturnType<typeof createStatusBoard>
