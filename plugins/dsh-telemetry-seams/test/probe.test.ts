/**
 * Probe unit tests — verify the pure functions in seams/probe.ts and seams/types.ts.
 * No network calls, no filesystem writes, no DSH context required.
 */
import { describe, it, expect } from 'vitest'
import { healthFromEvidence } from '../src/seams/types.js'
import { splitHostPort, parsePipelines } from '../src/seams/probe.js'

// ---------------------------------------------------------------------------
// healthFromEvidence
// ---------------------------------------------------------------------------

describe('healthFromEvidence', () => {
  it('returns unknown for empty evidence', () => {
    expect(healthFromEvidence([])).toBe('unknown')
  })

  it('returns operational when all evidence is ok', () => {
    expect(
      healthFromEvidence([
        { probe: 'a', ok: true, detail: 'good', at: '2026-01-01T00:00:00Z' },
        { probe: 'b', ok: true, detail: 'good', at: '2026-01-01T00:00:00Z' },
      ]),
    ).toBe('operational')
  })

  it('returns configured when some but not all evidence is ok', () => {
    expect(
      healthFromEvidence([
        { probe: 'a', ok: true, detail: 'good', at: '2026-01-01T00:00:00Z' },
        { probe: 'b', ok: false, detail: 'bad', at: '2026-01-01T00:00:00Z' },
      ]),
    ).toBe('configured')
  })

  it('returns unavailable when all evidence is not ok', () => {
    expect(
      healthFromEvidence([
        { probe: 'a', ok: false, detail: 'bad', at: '2026-01-01T00:00:00Z' },
        { probe: 'b', ok: false, detail: 'bad', at: '2026-01-01T00:00:00Z' },
      ]),
    ).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// splitHostPort
// ---------------------------------------------------------------------------

describe('splitHostPort', () => {
  it('splits a simple host:port', () => {
    expect(splitHostPort('otel-collector:4317')).toEqual({ host: 'otel-collector', port: 4317 })
  })

  it('splits an IP:port', () => {
    expect(splitHostPort('172.23.0.12:4318')).toEqual({ host: '172.23.0.12', port: 4318 })
  })

  it('returns null for a bare host with no port', () => {
    expect(splitHostPort('otel-collector')).toBeNull()
  })

  it('returns null for port 0', () => {
    expect(splitHostPort('host:0')).toBeNull()
  })

  it('returns null for a non-numeric port', () => {
    expect(splitHostPort('host:grpc')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parsePipelines
// ---------------------------------------------------------------------------

describe('parsePipelines', () => {
  it('returns empty array for empty HTML', () => {
    expect(parsePipelines('')).toEqual([])
  })

  it('returns empty array for HTML with no pipeline rows', () => {
    expect(parsePipelines('<table><tr><th>header</th></tr></table>')).toEqual([])
  })

  it('parses a pipeline row with real 11-cell zpages format (separator cells)', () => {
    // Real zpages format: data cells interleaved with | separator cells.
    // cells[0]=name, [1]=|, [2]=inputType, [3]=|, [4]=mutates, [5]=|,
    // [6]=receivers, [7]=|, [8]=processors, [9]=|, [10]=exporters
    const sep = '<td>&nbsp;&nbsp;|&nbsp;&nbsp;</td>'
    const html = `
      <table>
        <tr>
          <td>logs</td>${sep}
          <td>logs</td>${sep}
          <td>true</td>${sep}
          <td><a href="?zpipelinename=logs&zcomponentname=otlp&zcomponentkind=receiver">otlp</a></td>${sep}
          <td><a href="?zpipelinename=logs&zcomponentname=memory_limiter&zcomponentkind=processor">memory_limiter</a></td>${sep}
          <td><a href="?zpipelinename=logs&zcomponentname=opensearch&zcomponentkind=exporter">opensearch</a></td>
        </tr>
      </table>
    `
    const result = parsePipelines(html)
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('logs')
    expect(result[0]?.inputType).toBe('logs')
    expect(result[0]?.receivers).toContain('otlp')
    expect(result[0]?.processors).toContain('memory_limiter')
    expect(result[0]?.exporters).toContain('opensearch')
  })

  it('regression: does NOT extract components from old 6-cell format (too few cells)', () => {
    // The old code assumed 6 cells; this test proves rows with < 11 cells are skipped.
    const html = `
      <table>
        <tr>
          <td>logs</td>
          <td>logs</td>
          <td>false</td>
          <td><a href="?zpipelinename=logs&zcomponentname=otlp&zcomponentkind=receiver">otlp</a></td>
          <td><a href="?zpipelinename=logs&zcomponentname=memory_limiter&zcomponentkind=processor">memory_limiter</a></td>
          <td><a href="?zpipelinename=logs&zcomponentname=opensearch&zcomponentkind=exporter">opensearch</a></td>
        </tr>
      </table>
    `
    // 6-cell rows are now skipped (require 11); result is empty.
    expect(parsePipelines(html)).toHaveLength(0)
  })

  it('skips the header row (FullName)', () => {
    const html = `
      <table>
        <tr>
          <td>FullName</td><td>InputType</td><td>MutatesData</td>
          <td>Receivers</td><td>Processors</td><td>Exporters</td>
        </tr>
      </table>
    `
    expect(parsePipelines(html)).toEqual([])
  })
})
