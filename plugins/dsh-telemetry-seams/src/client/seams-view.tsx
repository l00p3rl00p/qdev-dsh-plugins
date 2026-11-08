/**
 * Telemetry Seams — conversation.view tab component.
 *
 * Read-only inventory: shows every seam with its health, source, collection,
 * destination, and observed evidence. Provides a re-probe button that calls
 * the host tool via the agent remote, and a gaps section when gaps exist.
 *
 * Design constraints from lessons learned:
 * - Use native DSH slot registration, never DOM walking.
 * - Health labels must come from actual probe evidence; never fabricate.
 * - Configured ≠ Operational; both states are shown distinctly.
 */
import React, { useState, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { SeamInventory, SeamRecord, SeamState } from '../seams/types.js'

// ---------------------------------------------------------------------------
// Styles — inherit host theme tokens throughout
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  height: '100%',
  overflow: 'hidden',
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px 10px',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  flexShrink: 0,
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
}

const metaStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--dsw-alias-label-secondary)',
  marginTop: 2,
}

const scrollStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 18px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
  padding: '10px 14px',
  background: 'var(--dsw-alias-bg-module-platform)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  flexWrap: 'wrap',
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
  minWidth: 80,
  flexShrink: 0,
}

const valueStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--dsw-alias-label-primary)',
  wordBreak: 'break-word',
}

const seamIdStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: '18px',
}

const sectionHeadStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--dsw-alias-label-secondary)',
  margin: '8px 0 4px',
}

const buttonStyle: CSSProperties = {
  padding: '5px 12px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  lineHeight: '18px',
}

const autoProbeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 4,
  fontSize: 11,
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
  userSelect: 'none',
}

const gapCardStyle: CSSProperties = {
  ...cardStyle,
  borderColor: 'var(--dsw-alias-state-warning-primary, #f59e0b)',
  background: 'var(--dsw-alias-state-warning-bg, rgba(245,158,11,0.08))',
}

const errorStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  background: 'var(--dsw-alias-state-error-bg, rgba(239,68,68,0.08))',
  border: '1px solid var(--dsw-alias-state-error-primary, #ef4444)',
  color: 'var(--dsw-alias-state-error-primary, #ef4444)',
  fontSize: 12,
}

const internalBadgeStyle: CSSProperties = {
  ...badgeBase,
  background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.12))',
  color: 'var(--dsw-alias-label-secondary)',
}

// ---------------------------------------------------------------------------
// Health badge
// ---------------------------------------------------------------------------

function healthColor(state: SeamState): CSSProperties {
  switch (state) {
    case 'operational':
      return {
        ...badgeBase,
        background: 'var(--dsw-alias-state-success-bg, rgba(34,197,94,0.12))',
        color: 'var(--dsw-alias-state-success-primary, #22c55e)',
      }
    case 'configured':
      return {
        ...badgeBase,
        background: 'rgba(59,130,246,0.12)',
        color: '#3b82f6',
      }
    case 'supported':
      return {
        ...badgeBase,
        background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.12))',
        color: 'var(--dsw-alias-label-secondary)',
      }
    case 'unavailable':
      return {
        ...badgeBase,
        background: 'var(--dsw-alias-state-error-bg, rgba(239,68,68,0.08))',
        color: 'var(--dsw-alias-state-error-primary, #ef4444)',
      }
    default:
      return {
        ...badgeBase,
        background: 'rgba(245,158,11,0.10)',
        color: 'var(--dsw-alias-state-warning-primary, #f59e0b)',
      }
  }
}

function healthIcon(state: SeamState): string {
  switch (state) {
    case 'operational':
      return '✅'
    case 'configured':
      return '🔵'
    case 'supported':
      return '⚪'
    case 'unavailable':
      return '🔴'
    default:
      return '❓'
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthBadge({ state }: { state: SeamState }): React.JSX.Element {
  return <span style={healthColor(state)}>{state}</span>
}

function SeamCard({ seam }: { seam: SeamRecord }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={cardStyle}>
      <div style={seamIdStyle}>
        <span>{healthIcon(seam.health)}</span>
        <span>{seam.id}</span>
        {seam.internal === true && <span style={internalBadgeStyle}>internal</span>}
        <span style={{ marginLeft: 'auto' }}>
          <HealthBadge state={seam.health} />
        </span>
      </div>

      <div style={{ ...valueStyle, color: 'var(--dsw-alias-label-secondary)', marginTop: 2 }}>
        {seam.provides}
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Kind</span>
        <span style={valueStyle}>{seam.kind}</span>
        <span style={{ ...labelStyle, marginLeft: 12 }}>Owner</span>
        <span style={valueStyle}>{seam.owner}</span>
        <span style={{ ...labelStyle, marginLeft: 12 }}>Status</span>
        <HealthBadge state={seam.status} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Source</span>
        <span style={valueStyle}>{seam.source}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Collection</span>
        <span style={valueStyle}>{seam.collection}</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Destination</span>
        <span style={valueStyle}>{seam.destination}</span>
      </div>

      {seam.note !== undefined && (
        <div style={{ ...valueStyle, color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' }}>
          {seam.note}
        </div>
      )}

      {seam.evidence.length > 0 && (
        <button
          type="button"
          style={{ ...buttonStyle, alignSelf: 'flex-start', marginTop: 4 }}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Hide evidence' : `Show evidence (${seam.evidence.length})`}
        </button>
      )}

      {expanded &&
        seam.evidence.map((e, i) => (
          <div
            key={i}
            style={{
              ...valueStyle,
              padding: '4px 8px',
              borderRadius: 6,
              background: e.ok
                ? 'var(--dsw-alias-state-success-bg, rgba(34,197,94,0.08))'
                : 'var(--dsw-alias-state-error-bg, rgba(239,68,68,0.06))',
              fontSize: 11,
            }}
          >
            <strong>
              {e.ok ? '✓' : '✗'} {e.probe}
            </strong>
            : {e.detail}
            <span style={{ color: 'var(--dsw-alias-label-secondary)', marginLeft: 6 }}>
              {new Date(e.at).toLocaleTimeString()}
            </span>
          </div>
        ))}
    </div>
  )
}

function CollectorSection({ inventory }: { inventory: SeamInventory }): React.JSX.Element {
  const { collector } = inventory
  return (
    <div style={cardStyle}>
      <div style={seamIdStyle}>
        <span>{collector.reachable ? '✅' : '🔴'}</span>
        <span>OTEL Collector</span>
        <span style={{ marginLeft: 'auto' }}>
          <span style={healthColor(collector.reachable ? 'operational' : 'unavailable')}>
            {collector.reachable ? 'reachable' : 'unreachable'}
          </span>
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Endpoint</span>
        <span style={valueStyle}>{collector.endpoint}</span>
      </div>
      {collector.uptime !== undefined && (
        <div style={rowStyle}>
          <span style={labelStyle}>Uptime</span>
          <span style={valueStyle}>{collector.uptime}</span>
        </div>
      )}
      {collector.pipelines.length > 0 && (
        <div style={rowStyle}>
          <span style={labelStyle}>Pipelines</span>
          <span style={valueStyle}>{collector.pipelines.map((p) => p.name).join(', ')}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export interface SeamsViewProps {
  /** Call the host tool and return the inventory, or throw on failure. */
  loadInventory: (signal: AbortSignal) => Promise<SeamInventory>
}

const AUTO_PROBE_STORAGE_KEY = 'dsh-telemetry-seams.auto-probe-on-open'

function readAutoProbePreference(): boolean {
  try {
    return window.localStorage.getItem(AUTO_PROBE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function SeamsView({ loadInventory }: SeamsViewProps): React.JSX.Element {
  const [inventory, setInventory] = useState<SeamInventory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoProbe, setAutoProbe] = useState(readAutoProbePreference)

  const probe = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const result = await loadInventory(signal)
        if (!signal.aborted) setInventory(result)
      } catch (err) {
        if (!signal.aborted) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [loadInventory],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_PROBE_STORAGE_KEY, String(autoProbe))
    } catch {
      // Storage can be unavailable in restricted browser contexts; the checkbox still works for this mount.
    }
  }, [autoProbe])

  useEffect(() => {
    if (!autoProbe) return
    const ctrl = new AbortController()
    void probe(ctrl.signal)
    return () => ctrl.abort()
  }, [autoProbe, probe])

  // Group seams by kind
  const groups = inventory
    ? Object.entries(
        inventory.seams.reduce<Record<string, SeamRecord[]>>((acc, s) => {
          ;(acc[s.kind] ??= []).push(s)
          return acc
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b))
    : []

  return (
    <div style={rootStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Telemetry Seams</h2>
          {inventory !== null && (
            <div style={metaStyle}>
              {inventory.seams.length} seams · DSH {inventory.host.dshVersion} · Profile{' '}
              {inventory.host.profile} · {new Date(inventory.generatedAt).toLocaleTimeString()}
            </div>
          )}
          <label style={autoProbeStyle} title="Runs one probe when this tab opens; no background polling.">
            <input
              type="checkbox"
              checked={autoProbe}
              onChange={(event) => setAutoProbe(event.currentTarget.checked)}
            />
            Probe automatically when tab opens
          </label>
        </div>
        <button
          type="button"
          style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
          disabled={loading}
          onClick={() => {
            const ctrl = new AbortController()
            void probe(ctrl.signal)
          }}
        >
          {loading ? 'Probing…' : inventory === null ? 'Run probe' : 'Re-probe'}
        </button>
      </div>

      {/* Body */}
      <div style={scrollStyle}>
        {error !== null && <div style={errorStyle}>Error: {error}</div>}

        {inventory === null && !loading && error === null && (
          <div style={{ color: 'var(--dsw-alias-label-secondary)', padding: '24px 0', textAlign: 'center' }}>
            Click <strong>Run probe</strong> to discover and health-check all telemetry seams.
          </div>
        )}

        {inventory !== null && (
          <>
            <CollectorSection inventory={inventory} />

            {groups.map(([kind, seams]) => (
              <React.Fragment key={kind}>
                <div style={sectionHeadStyle}>{kind}</div>
                {seams.map((s) => (
                  <SeamCard key={s.id} seam={s} />
                ))}
              </React.Fragment>
            ))}

            {inventory.gaps.length > 0 && (
              <>
                <div style={sectionHeadStyle}>Gaps</div>
                {inventory.gaps.map((g, i) => (
                  <div key={i} style={gapCardStyle}>
                    <span style={{ fontSize: 12 }}>⚠ {g}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
