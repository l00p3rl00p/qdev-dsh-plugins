/**
 * Read-only probes for every seam this plugin reports.
 *
 * DESIGN CONSTRAINT — read this before modifying.
 *
 * This module OBSERVES platform interfaces. It never creates an exporter, a
 * collector, a receiver, a pipeline, or an OTLP channel, and it never mutates
 * another component's configuration. That is what keeps native telemetry
 * transport intact across this plugin's install, removal, upgrade, and reload.
 *
 * A probe that cannot run produces NO evidence (or `ok: false` evidence). It
 * must never fall back to "assume healthy", because the whole point of this
 * plugin is to distinguish CONFIGURED from OPERATIONAL.
 *
 * @module dsh-telemetry-seams/seams/probe
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { connect } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import {
  healthFromEvidence,
  type CollectorPipeline,
  type SeamEvidence,
  type SeamInventory,
  type SeamRecord,
} from './types.js'

/** Configuration accepted from `cordis.patch.yml`. */
export interface ProbeConfig {
  collector: {
    otlpGrpc: string
    otlpHttp: string
    health: string
    zpages: string
    probeTimeoutMillis: number
  }
  includeInternal: boolean
}

/** Everything the probe layer needs to describe its own host. */
export interface ProbeEnvironment {
  dshVersion: string
  profile: string
  sessionId?: string
  /** Absolute path to the DSH home directory (`~/.dsh`). */
  dshHome: string
  /** Absolute path to the active session store root. */
  sessionRoot: string
}

/**
 * Split `host:port` into its parts.
 *
 * Uses lastIndexOf so an IPv6 literal in brackets still splits at the real
 * port separator rather than the first colon inside the address.
 */
export function splitHostPort(value: string): { host: string; port: number } | null {
  const index = value.lastIndexOf(':')
  if (index <= 0) return null
  const host = value.slice(0, index)
  const port = Number(value.slice(index + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { host, port }
}

/**
 * Test whether a TCP endpoint accepts a connection.
 *
 * This is a *transport reachability* check only. A successful connect proves
 * something is listening; it deliberately does NOT claim that any data was
 * accepted, exported, or stored.
 */
export function probeTcp(target: string, timeoutMillis: number): Promise<SeamEvidence> {
  const at = new Date().toISOString()
  const parsed = splitHostPort(target)
  if (parsed === null) {
    return Promise.resolve({
      probe: 'tcp-connect',
      kind: 'connectivity',
      ok: false,
      detail: `unparseable endpoint "${target}"`,
      at,
    })
  }
  return new Promise<SeamEvidence>((resolve) => {
    const socket = connect({ host: parsed.host, port: parsed.port })
    // `settled` guards the race between connect/error/timeout so exactly one
    // evidence record is emitted per probe.
    let settled = false
    const finish = (ok: boolean, detail: string): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ probe: 'tcp-connect', ok, detail, at })
    }
    socket.setTimeout(timeoutMillis)
    socket.once('connect', () => finish(true, `${target} accepted TCP connection`))
    socket.once('timeout', () => finish(false, `${target} timed out after ${timeoutMillis}ms`))
    socket.once('error', (error: Error) => finish(false, `${target} ${error.message}`))
  })
}

/**
 * Fetch a URL with a hard deadline and return its body, or null.
 *
 * `AbortSignal.timeout` bounds the whole request including body read, so a
 * hung collector cannot stall the inventory tool.
 */
export async function fetchText(url: string, timeoutMillis: number): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMillis) })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/**
 * Parse the Collector's `pipelinez` HTML into structured pipelines.
 *
 * The zpages table interleaves data cells with separator cells containing
 * `&nbsp;&nbsp;|&nbsp;&nbsp;`. The actual layout per row is:
 *
 *   cells[0]  = pipeline name
 *   cells[1]  = | separator
 *   cells[2]  = inputType
 *   cells[3]  = | separator
 *   cells[4]  = mutatesData
 *   cells[5]  = | separator
 *   cells[6]  = receivers (anchor links with zcomponentname=NAME)
 *   cells[7]  = | separator
 *   cells[8]  = processors
 *   cells[9]  = | separator
 *   cells[10] = exporters
 *
 * Component names are extracted from anchor query params:
 * `?zpipelinename=...&zcomponentname=NAME&zcomponentkind=KIND`
 *
 * Returns [] when the shape is unrecognized, which the caller reports as
 * "pipeline topology unavailable" rather than inventing a pipeline list.
 */
export function parsePipelines(html: string): CollectorPipeline[] {
  const pipelines: CollectorPipeline[] = []
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  const componentPattern = /zcomponentname=([^&"]+)/g

  for (const rowMatch of html.matchAll(rowPattern)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1])
    // A full pipeline row has 11 cells (5 data + 6 separators).
    // Rows with fewer than 11 cells are headers or empty rows — skip them.
    if (cells.length < 11) continue
    const name = stripTags(cells[0])
    const inputType = stripTags(cells[2])
    // Skip the header row.
    if (name === 'FullName' || name === '') continue

    const names = (cell: string): string[] => {
      const found: string[] = []
      for (const m of cell.matchAll(componentPattern)) {
        const decoded = decodeURIComponent(m[1])
        if (!found.includes(decoded)) found.push(decoded)
      }
      return found
    }

    pipelines.push({
      name,
      inputType,
      receivers: names(cells[6]),
      processors: names(cells[8]),
      exporters: names(cells[10]),
    })
  }
  return pipelines
}

/** Remove HTML tags and collapse whitespace from a zpages table cell. */
function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Count files under a directory without recursing indefinitely. */
async function countFiles(root: string, suffix?: string): Promise<number> {
  let total = 0
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = join(root, entry)
    try {
      const info = await stat(full)
      if (info.isDirectory()) total += await countFiles(full, suffix)
      else if (suffix === undefined || entry.endsWith(suffix)) total += 1
    } catch {
      // An unreadable entry contributes nothing; it must not abort the sweep.
    }
  }
  return total
}

/**
 * Build the full seam inventory for this host.
 *
 * Ordering is deliberate and matters for correctness: the Collector probes run
 * first so their evidence can be attached to the transport seams, and the
 * session-store sweep runs before the persistence seams so a missing store
 * downgrades those seams instead of leaving them looking configured.
 *
 * @param ctx - the mounting plugin context, used only to detect mounted services.
 * @param config - collector endpoints and probe deadline.
 * @param env - host identity and filesystem roots.
 */
export async function buildInventory(
  ctx: Context,
  config: ProbeConfig,
  env: ProbeEnvironment,
): Promise<SeamInventory> {
  const generatedAt = new Date().toISOString()
  const seams: SeamRecord[] = []
  const gaps: string[] = []

  // ---------------------------------------------------------------- collector
  const healthBody = await fetchText(config.collector.health, config.collector.probeTimeoutMillis)
  let collectorUpSince: string | undefined
  let collectorUptime: string | undefined
  if (healthBody !== null) {
    try {
      const parsed = JSON.parse(healthBody) as { upSince?: string; uptime?: string }
      collectorUpSince = parsed.upSince
      collectorUptime = parsed.uptime
    } catch {
      // Health body present but not the expected JSON: reachability still holds.
    }
  }

  const zpagesBody = await fetchText(config.collector.zpages, config.collector.probeTimeoutMillis)
  const pipelines = zpagesBody === null ? [] : parsePipelines(zpagesBody)

  const collectorReachable = healthBody !== null || pipelines.length > 0
  const collectorEvidence: SeamEvidence = {
    probe: 'collector-health',
    kind: 'connectivity',
    ok: collectorReachable,
    detail:
      healthBody !== null
        ? `health endpoint reported ${healthBody.trim().slice(0, 120)}`
        : `health endpoint ${config.collector.health} did not answer`,
    at: generatedAt,
  }
  const pipelineEvidence: SeamEvidence = {
    probe: 'collector-pipelines',
    kind: 'connectivity',
    ok: pipelines.length > 0,
    detail:
      pipelines.length > 0
        ? `zpages reported ${pipelines.length} pipeline(s): ${pipelines.map((p) => p.name).join(', ')}`
        : `no pipelines parsed from ${config.collector.zpages}`,
    at: generatedAt,
  }

  if (!collectorReachable) {
    gaps.push(
      `Collector at ${config.collector.health} is unreachable, so every collector-owned seam is reported from configuration only.`,
    )
  }

  // OTLP transport seams. Reachability is proven by a real TCP connect, but the
  // destination is deliberately named as the collector, not the warehouse: this
  // plugin cannot see past the collector from inside the DSH container.
  for (const [id, endpoint, protocol] of [
    ['collector.otlp.grpc', config.collector.otlpGrpc, 'gRPC'],
    ['collector.otlp.http', config.collector.otlpHttp, 'HTTP/JSON'],
  ] as const) {
    const tcp = await probeTcp(endpoint, config.collector.probeTimeoutMillis)
    seams.push({
      id,
      kind: 'transport',
      owner: 'collector',
      provides: `OTLP ${protocol} ingress for logs, traces, metrics, and profiles`,
      source: `application exporters targeting ${endpoint}`,
      collection: 'OTLP receiver (push)',
      destination: 'collector pipelines (logs/traces/metrics/profiles)',
      enabled: true,
      status: tcp.ok ? 'operational' : 'unavailable',
      health: healthFromEvidence([tcp, pipelineEvidence]),
      evidence: [tcp, pipelineEvidence],
      note: 'Presence of this plugin does not affect this endpoint.',
    })
  }

  // One seam per collector pipeline, describing the real receiver/processor/
  // exporter chain read from the collector's own diagnostics.
  for (const pipeline of pipelines) {
    seams.push({
      id: `collector.pipeline.${pipeline.name}`,
      kind: (['logs', 'metrics', 'traces', 'profiles'] as const).includes(pipeline.name as never)
        ? (pipeline.name as 'logs' | 'metrics' | 'traces' | 'profiles')
        : 'transport',
      owner: 'collector',
      provides: `Collector ${pipeline.name} pipeline: ${pipeline.receivers.join(', ') || 'no receivers'} → ${pipeline.exporters.join(', ') || 'no exporters'}`,
      source: pipeline.receivers.join(', ') || 'unreported',
      collection: pipeline.processors.length > 0 ? pipeline.processors.join(' → ') : 'no processors',
      destination: pipeline.exporters.join(', ') || 'unreported',
      enabled: true,
      status: pipelineEvidence.ok ? 'operational' : 'unknown',
      health: healthFromEvidence([pipelineEvidence, collectorEvidence]),
      evidence: [pipelineEvidence, collectorEvidence],
    })
  }

  // ------------------------------------------------------------- dsh services
  // Service presence is read from the live Cordis context. Detection is
  // defensive because these services are optional in a given composition: an
  // absent service is `supported` (the platform ships it, this profile lacks
  // it), never an error.
  const serviceSeams: Array<{
    id: string
    key: string
    provides: string
    collection: string
    destination: string
  }> = [
    {
      id: 'dsh.otel.service',
      key: 'otel',
      provides: 'Shared OTel service that mints independent ordinary-event and session-log channels',
      collection: 'ctx.otel.createEventReporter / createSessionLogReporter',
      destination: 'caller-selected OTLP/HTTP endpoint (no default)',
    },
    {
      id: 'dsh.productTelemetry.service',
      key: 'productTelemetry',
      provides: 'Product analytics sender for selected usage events',
      collection: 'ctx.productTelemetry.emit(record)',
      destination: 'configured OTLP/HTTP logs endpoint',
    },
    {
      id: 'dsh.sessionTelemetry.service',
      key: 'sessionTelemetry',
      provides: 'Session-event capture backend: one record per canonical session event',
      collection: 'ctx.sessionTelemetry.emit(record) from the capture coordinator',
      destination: 'backend-selected pipeline',
    },
  ]

  for (const service of serviceSeams) {
    // `ctx.get` returns undefined for an unmounted service rather than throwing.
    // Cordis types the context index loosely, so the cast is confined here.
    const mounted = getService(ctx, service.key)
    const evidence: SeamEvidence = {
      probe: 'service-mounted',
      kind: 'configuration',
      ok: mounted,
      detail: mounted
        ? `ctx.${service.key} is mounted in this profile`
        : `ctx.${service.key} is not mounted in this profile`,
      at: generatedAt,
    }
    seams.push({
      id: service.id,
      kind: 'logs',
      owner: 'dsh',
      provides: service.provides,
      source: 'DSH host runtime',
      collection: service.collection,
      destination: service.destination,
      enabled: mounted,
      status: mounted ? 'configured' : 'supported',
      // Mounting proves the interface is wired, NOT that records were delivered,
      // so this can reach at most `configured` from a mount probe alone.
      health: healthFromEvidence([evidence]),
      evidence: [evidence],
      internal: !isPubliclyDocumented(service.key),
      note: mounted
        ? 'Mounted; delivery to a collector is not proven by mounting alone.'
        : 'Shipped by DSH but not mounted in this profile.',
    })
  }

  // ------------------------------------------------------- session persistence
  // Session logs may be plain .jsonl or compressed .jsonl.zstd depending on
  // the DSH version. Count both so the probe correctly reflects the actual state.
  const sessionFiles =
    (await countFiles(env.sessionRoot, '.jsonl')) + (await countFiles(env.sessionRoot, '.jsonl.zstd'))
  const projectionFiles = await countFiles(
    join(env.dshHome, 'storages', 'session_projcache', 'sessions'),
    '.json',
  )
  const sessionRootExists = existsSync(env.sessionRoot)

  seams.push({
    id: 'dsh.session.persistence.jsonl',
    kind: 'session-persistence',
    owner: 'dsh',
    provides: 'Durable canonical session log: the authoritative append-only record of every session event',
    source: env.sessionRoot,
    collection: 'DSH session persistence (append on every canonical event)',
    destination: 'local disk (JSONL)',
    enabled: sessionRootExists,
    status: sessionRootExists ? (sessionFiles > 0 ? 'operational' : 'configured') : 'unavailable',
    health: healthFromEvidence([
      {
        probe: 'session-log-present',
        kind: 'connectivity',
        ok: sessionRootExists && sessionFiles > 0,
        detail: sessionRootExists
          ? `found ${sessionFiles} session log file(s) under ${env.sessionRoot}`
          : `session root ${env.sessionRoot} does not exist`,
        at: generatedAt,
      },
    ]),
    evidence: [
      {
        probe: 'session-log-present',
        kind: 'connectivity',
        ok: sessionRootExists && sessionFiles > 0,
        detail: sessionRootExists
          ? `found ${sessionFiles} session log file(s) under ${env.sessionRoot}`
          : `session root ${env.sessionRoot} does not exist`,
        at: generatedAt,
      },
    ],
  })

  seams.push({
    id: 'dsh.session.projection.cache',
    kind: 'session-projection',
    owner: 'dsh',
    provides: 'Cached session projections used to rehydrate UI state without replaying the canonical log',
    source: join(env.dshHome, 'storages', 'session_projcache', 'sessions'),
    collection: 'session projection cache (write-behind)',
    destination: 'local disk (JSON)',
    enabled: projectionFiles > 0,
    status: projectionFiles > 0 ? 'operational' : 'unknown',
    health: healthFromEvidence([
      {
        probe: 'projection-cache-present',
        kind: 'connectivity',
        ok: projectionFiles > 0,
        detail: `found ${projectionFiles} projection cache file(s)`,
        at: generatedAt,
      },
    ]),
    evidence: [
      {
        probe: 'projection-cache-present',
        kind: 'connectivity',
        ok: projectionFiles > 0,
        detail: `found ${projectionFiles} projection cache file(s)`,
        at: generatedAt,
      },
    ],
  })

  // --------------------------------------------------------------- env wiring
  // Environment variables are the deployment's declared intent. They are
  // CONFIGURED evidence, not OPERATIONAL evidence, and are reported that way.
  const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const telemetryUrl = process.env.DSH_TELEMETRY_OTLP_URL
  const telemetryMode = process.env.DSH_TELEMETRY_MODE

  seams.push({
    id: 'qdev.env.otel-endpoint',
    kind: 'transport',
    owner: 'qdev',
    provides: 'Deployment-declared OTLP endpoint inherited by standard OpenTelemetry SDK clients',
    source: 'OTEL_EXPORTER_OTLP_ENDPOINT',
    collection: 'process environment',
    destination: otelEndpoint ?? 'unset',
    enabled: otelEndpoint !== undefined,
    status: otelEndpoint === undefined ? 'unavailable' : 'configured',
    health: healthFromEvidence([
      {
        probe: 'env-present',
        kind: 'configuration',
        ok: otelEndpoint !== undefined,
        detail:
          otelEndpoint === undefined ? 'OTEL_EXPORTER_OTLP_ENDPOINT is not set' : `set to ${otelEndpoint}`,
        at: generatedAt,
      },
    ]),
    evidence: [
      {
        probe: 'env-present',
        kind: 'configuration',
        ok: otelEndpoint !== undefined,
        detail:
          otelEndpoint === undefined ? 'OTEL_EXPORTER_OTLP_ENDPOINT is not set' : `set to ${otelEndpoint}`,
        at: generatedAt,
      },
    ],
  })

  seams.push({
    id: 'qdev.session-exporter.config',
    kind: 'logs',
    owner: 'qdev',
    provides: 'DSH first-party session exporter endpoint and sharing mode',
    source: 'DSH_TELEMETRY_OTLP_URL + DSH_TELEMETRY_MODE',
    collection: 'process environment',
    destination: telemetryUrl ?? 'unset',
    enabled: telemetryUrl !== undefined || telemetryMode !== undefined,
    status: telemetryUrl === undefined && telemetryMode === undefined ? 'unknown' : 'configured',
    health: healthFromEvidence([
      {
        probe: 'env-present',
        kind: 'configuration',
        ok: telemetryUrl !== undefined || telemetryMode !== undefined,
        detail:
          telemetryUrl === undefined && telemetryMode === undefined
            ? 'neither DSH_TELEMETRY_OTLP_URL nor DSH_TELEMETRY_MODE is visible to this process'
            : `DSH_TELEMETRY_OTLP_URL=${telemetryUrl ?? 'unset'}, DSH_TELEMETRY_MODE=${telemetryMode ?? 'unset'}`,
        at: generatedAt,
      },
    ]),
    evidence: [
      {
        probe: 'env-present',
        kind: 'configuration',
        ok: telemetryUrl !== undefined || telemetryMode !== undefined,
        detail:
          telemetryUrl === undefined && telemetryMode === undefined
            ? 'neither DSH_TELEMETRY_OTLP_URL nor DSH_TELEMETRY_MODE is visible to this process'
            : `DSH_TELEMETRY_OTLP_URL=${telemetryUrl ?? 'unset'}, DSH_TELEMETRY_MODE=${telemetryMode ?? 'unset'}`,
        at: generatedAt,
      },
    ],
    note:
      telemetryUrl === undefined
        ? 'Declared in the compose overlay, which is not mounted in this container; delivery cannot be verified from here.'
        : 'Configured by environment; delivery requires collector-side confirmation.',
  })

  if (telemetryUrl === undefined && telemetryMode === undefined) {
    gaps.push(
      'The first-party session exporter variables are not visible inside this container, so session-exporter delivery is UNKNOWN rather than verified.',
    )
  }

  return {
    generatedAt,
    host: { dshVersion: env.dshVersion, profile: env.profile, sessionId: env.sessionId },
    collector: {
      endpoint: config.collector.health,
      reachable: collectorReachable,
      upSince: collectorUpSince,
      uptime: collectorUptime,
      pipelines,
    },
    seams: seams.sort((a, b) => a.id.localeCompare(b.id)),
    gaps,
  }
}

/**
 * Check whether a Cordis service is mounted without declaring inject on it.
 *
 * Direct property access on `ctx` triggers Cordis's inject guard and throws
 * "cannot get property X without inject" for any service this plugin hasn't
 * declared. `ctx.reflect.get(key)` is the safe inspection path: it returns
 * the service instance or undefined without touching the guard, keeping this
 * plugin fully independent of every service it only observes.
 */
function getService(ctx: Context, key: string): boolean {
  try {
    const value = ctx.reflect.get(key)
    return value !== undefined && value !== null
  } catch {
    return false
  }
}

/**
 * Whether a service key is part of DSH's documented public surface.
 *
 * Used only to flag "internal interface" in the UI. The list is intentionally
 * small and explicit rather than inferred, so the flag never becomes a guess.
 */
function isPubliclyDocumented(key: string): boolean {
  return key === 'otel' || key === 'productTelemetry'
}

/** Resolve the DSH home directory from the environment, defaulting to `~/.dsh`. */
export function resolveDshHome(home: string | undefined): string {
  const explicit = process.env.DSH_HOME
  if (explicit !== undefined && isAbsolute(explicit)) return explicit
  return join(home ?? process.env.HOME ?? '.', '.dsh')
}

/** Read the running DSH version from the installed package manifest. */
export async function readDshVersion(packageRoot: string): Promise<string> {
  try {
    const raw = await readFile(join(packageRoot, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
