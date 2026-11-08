/**
 * Telemetry Seams inventory vocabulary.
 *
 * This module is dependency-free on purpose: the same record shape is produced
 * by the Host probe layer, handed to the model-facing tool, and rendered by the
 * browser tab. Nothing here owns transport — every field describes an interface
 * that some other DSH or Collector component already implements.
 *
 * @module dsh-telemetry-seams/seams/types
 */

/**
 * Lifecycle state of one seam, from "the platform ships it" through "it is
 * demonstrably carrying data". These are deliberately distinct: configuration
 * is not operation, and the UI must never conflate them.
 */
export type SeamState =
  /** The platform ships this interface; this deployment does not mount it. */
  | 'supported'
  /** Mounted and wired, with no evidence yet that data flows. */
  | 'configured'
  /** Evidence shows the seam is actively carrying or serving data now. */
  | 'operational'
  /** Known seam that this deployment cannot reach or that is switched off. */
  | 'unavailable'
  /** Not enough evidence to classify. Never reported as healthy. */
  | 'unknown'

/** Which platform layer owns the interface. */
export type SeamOwner = 'dsh' | 'collector' | 'qdev'

/** Coarse category, used for grouping in the UI. */
export type SeamKind =
  | 'session-persistence'
  | 'session-events'
  | 'session-projection'
  | 'logs'
  | 'metrics'
  | 'traces'
  | 'profiles'
  | 'transport'
  | 'query'

/**
 * Evidence kind determines the maximum health a seam can reach.
 *
 * - `connectivity`: TCP connect, HTTP response, file present — real data-flow
 *   signals. A passing probe can reach `operational`.
 * - `configuration`: service mount check, env var present — proves wiring,
 *   not data flow. A passing probe caps at `configured`.
 */
export type SeamEvidenceKind = 'connectivity' | 'configuration'

/**
 * One piece of observed evidence for a seam.
 *
 * Evidence is the only thing permitted to raise a seam above `configured`.
 * Each entry records what was probed, what came back, and whether the probe
 * itself succeeded — a failed probe yields `ok: false` and can never be read
 * as a healthy signal.
 *
 * The `kind` field gates the maximum reachable health: `configuration` probes
 * (service mount, env var) cap at `configured`; `connectivity` probes (TCP,
 * HTTP, file) can reach `operational`.
 */
export interface SeamEvidence {
  /** Short machine-ish label, e.g. `collector-health` or `session-log-present`. */
  probe: string
  /** Whether the probe completed AND indicated the seam is live. */
  ok: boolean
  /** Human-readable observed result. */
  detail: string
  /** ISO-8601 timestamp of the observation. */
  at: string
  /**
   * Kind of evidence. `connectivity` can reach `operational`; `configuration`
   * caps at `configured`. Defaults to `connectivity` when absent (wire compat).
   */
  kind?: SeamEvidenceKind
}

/**
 * One discovered telemetry or information seam.
 *
 * Every property required by the seam inventory contract lives here. `health`
 * is a summary of `evidence`; when evidence is empty the health is `unknown`.
 */
export interface SeamRecord {
  /** Stable identifier, e.g. `dsh.session.persistence.jsonl`. */
  id: string
  /** Coarse category for grouping. */
  kind: SeamKind
  /** Owning platform layer. */
  owner: SeamOwner
  /** What this seam provides, in one sentence. */
  provides: string
  /** Concrete origin of the data: service, file, bus, or endpoint. */
  source: string
  /** How the data is collected: service call, event subscription, file read, scrape. */
  collection: string
  /** Where the data ends up, or `none` when it is not exported. */
  destination: string
  /** Whether this deployment currently has the seam mounted or switched on. */
  enabled: boolean
  /** Lifecycle classification. */
  status: SeamState
  /** Summary health derived strictly from `evidence`. */
  health: SeamState
  /** Observed evidence; empty means unverified. */
  evidence: SeamEvidence[]
  /**
   * True when the interface exists inside DSH but is not part of the public
   * package export surface — the "internal interface not yet exported" case.
   */
  internal?: boolean
  /** Optional operator note, e.g. why a seam is unavailable. */
  note?: string
}

/** The complete inventory plus probe-run metadata. */
export interface SeamInventory {
  /** ISO-8601 timestamp of the probe run. */
  generatedAt: string
  /** Host identity that produced the inventory. */
  host: {
    dshVersion: string
    profile: string
    sessionId?: string
  }
  /** Collector endpoint observations, if the collector was reachable. */
  collector: {
    endpoint: string
    reachable: boolean
    upSince?: string
    uptime?: string
    pipelines: CollectorPipeline[]
  }
  /** Every discovered seam, in stable id order. */
  seams: SeamRecord[]
  /** Gaps found during comparison against native capabilities. */
  gaps: string[]
}

/** One pipeline as reported by the Collector's zpages extension. */
export interface CollectorPipeline {
  name: string
  inputType: string
  receivers: string[]
  processors: string[]
  exporters: string[]
}

/**
 * Derive summary health from evidence alone. Empty evidence is never healthy.
 *
 * Rules:
 * - No evidence → `unknown`
 * - Any failing evidence → `unavailable` (if no ok evidence) or `configured`
 * - All ok, but only `configuration` kind → `configured` (proves wiring, not flow)
 * - Any ok `connectivity` evidence + no failures → `operational`
 */
export function healthFromEvidence(evidence: readonly SeamEvidence[]): SeamState {
  if (evidence.length === 0) return 'unknown'
  const anyOk = evidence.some((e) => e.ok)
  if (!anyOk) return 'unavailable'
  const allOk = evidence.every((e) => e.ok)
  if (!allOk) return 'configured'
  // All ok — but can we claim operational? Only if at least one connectivity probe passed.
  const hasConnectivity = evidence.some((e) => e.ok && (e.kind === 'connectivity' || e.kind === undefined))
  return hasConnectivity ? 'operational' : 'configured'
}
