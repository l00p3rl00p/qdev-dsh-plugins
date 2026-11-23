// Shared shapes for the SOUP plugin's consumers. The SOUP monitor itself needs none of these.
export type Table<V> = { entries(): Iterable<[string, V]>; get(id: string): V | undefined; put(id: string, value: V): Promise<unknown> }
export type Resolved = { python: string; escalationBypass: boolean; enabled: boolean; detectorEnabled: boolean; reanchoring: boolean; preset: number; baselineCount: number; windowCount: number }
export type MentorContext = { message?: string; plan?: string; amendments?: string[]; escalationBypass?: boolean }
export type RegisterEntry = { id: string; turn: number; drift: number; sent: 'first' | 'full'; at: number }
export type TestOutcome = { result: 'passed' | 'failed'; summary: string }
export type LiveHistoryStored = {
  history: Array<{ at: number; kl: number; threshold: number; drift: boolean }>
  markers: Array<{ at: number; kind: 'crossing' | 'reminder' | 'escalation' | 'clarification' }>
  tools?: Array<{ callId: string; name: string; startedAt: number; endedAt: number | null; error: boolean; reason?: string; outcome?: TestOutcome }>
  decisions?: Array<{ at: number; kind: string; detail: string }>
}
// The evidence the detector (the first producer) and Gentle Mentor publish; defined in soup-core.mjs.
export type DriftEvidence = Readonly<{
  sessionId: string; turn: number | null; singleTurn: boolean
  result: Readonly<{ drift_detected: boolean; kl_divergence: number; threshold: number; n_reference?: number; n_live?: number }>
}>
export type InterventionEvidence = Readonly<{
  sessionId: string; turn: number | null; action: 'reminder' | 'escalation' | 'reset' | 'carry'
  attempt: number | null; strikes: number; carry: number
  respondsTo: Readonly<{ sessionId: string; turn: number | null; kl_divergence: number; threshold: number }> | null
}>
export type MentorStoredState = { carry: number; decisionPending: boolean }
export type DeliveryRecord = {
  kind: 'reminder' | 'escalation' | 'clarification'
  attempt?: number
  sessionId: string
  turn: number
  messageId?: string
  requestedAt: number
  deliveredAt?: number
  eventSeq?: number
  state: 'pending' | 'delivered' | 'failed' | 'answered'
  error?: string
}
// What one Mentor action reported for one decision (mentor-actions.mjs runActions).
export type ActionResult = { name: string; kind: 'reminder' | 'escalation'; sessionId?: string; turn: number | null; attempt: number | null; ok: boolean; error?: string; at?: number }
export type SessionLiveRecord = {
  sessionEvents: number
  assistantMessages: number
  baselineSize: number
  windowSize: number
  pending: boolean
  evaluations: number
  drifts: number
  klTotal: number
  // What Gentle Mentor did in this chat, counted from its published intervention evidence.
  interventions?: { total: number; reminders: number; escalations: number; resets: number; carries: number }
  // Last 50 calculations and threshold/intervention markers for the Live & Mentor chart. Memory only.
  history: Array<{ at: number; kl: number; threshold: number; drift: boolean }>
  markers: Array<{ at: number; kind: 'crossing' | 'reminder' | 'escalation' | 'clarification' }>
  mentorActivity?: 'ready' | 'reminding' | 'error'
  mentorError?: { at: number; message: string }
  lastEventAt?: number
  lastEventType?: string
  lastStartedAt?: number
  lastCompletedAt?: number
  lastResult?: {
    sessionId: string
    turn: number | null
    singleTurn: boolean
    klDivergence: number
    threshold: number
    driftDetected: boolean
    completedAt: number
  }
  lastError?: { at: number; message: string; phase?: string }
}
export type RuntimeStatus = {
  identity: { name: string; version: string; description: string; source: string }
  configuration: {
    enabled: boolean
    detectorEnabled: boolean
    reanchoring: boolean
    preset: number
    threshold: number
    baselineCount: number
    windowCount: number
    python: string
  }
  lifecycle: { state: 'active' | 'disposing'; startedAt: number; liveAgents: number; subscriptions: number; degraded: string[] }
  trajectory: {
    state: 'disabled' | 'waiting' | 'observing'
    sessionEvents: number
    assistantMessages: number
    replayedEvents: number
    sessionsObserved: number
    lastEventAt?: number
    lastEventType?: string
    lastSessionId?: string
    baselineSize: number
    baselineTarget: number
    windowSize: number
    windowTarget: number
  }
  detector: {
    state: 'disabled' | 'idle' | 'running' | 'error'
    evaluations: number
    drifts: number
    lastStartedAt?: number
    lastCompletedAt?: number
    averageKlDivergence?: number
    averageThresholdRatio?: number
    recentThresholdRatio?: number
    lastDriftAt?: number
    lastDriftTurn?: number | null
    droppedEvents: number
    humanSummary: 'Waiting for measurements' | 'Stable' | 'Approaching threshold' | 'Drifting' | 'Severe drift'
    lastResult?: { sessionId: string; turn: number | null; klDivergence: number; threshold: number; driftDetected: boolean; singleTurn: boolean }
  }
  mentor: {
    state: 'disabled' | 'ready' | 'reminding' | 'escalated' | 'error'
    reminders: DeliveryRecord[]
    escalation?: DeliveryRecord
    lastOutcome?: string
    // Newest last, six kept: what each Mentor action reported (see mentor-actions.mjs). Absent until an action has run.
    actionResults?: ActionResult[]
    driftCount: number
    carriedDrifts: number
    resetDecision?: { required: boolean; sessionId: string; turn: number | null }
  }
  // Counted by a peer consumer from Gentle Mentor's intervention evidence (status.mjs).
  interventions: { total: number; reminders: number; escalations: number; resets: number; carries: number; lastAt?: number }
  errors: Array<{ at: number; message: string; phase?: string; sessionId?: string }>
}
export type Effective = Omit<RuntimeStatus['configuration'], 'threshold'>
export type MentorSnapshot = { sessionId: string; turn: number | null; driftCount: number; carry: number; decisionPending: boolean; escalated: boolean }
export type Intervention = { controller: AbortController; record: DeliveryRecord }
export type Reporter = (error: unknown, details?: { phase?: string; sessionId?: string }) => void
