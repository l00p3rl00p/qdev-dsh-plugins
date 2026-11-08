/**
 * Telemetry Seams — Host plugin entry.
 *
 * Registers the telemetry_seams_inventory tool AND mounts the InventoryService
 * so the browser tab can call probe() via ctx.remote without an agent turn.
 *
 * @module dsh-telemetry-seams
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { InventoryService } from './inventory-service.js'
import {
  buildInventory,
  resolveDshHome,
  readDshVersion,
  type ProbeConfig,
  type ProbeEnvironment,
} from './seams/probe.js'

export const name = 'telemetry-seams'
export const inject = ['tools', 'typert']

export interface TelemetrySeamsConfig {
  collector: {
    otlpGrpc: string
    otlpHttp: string
    health: string
    zpages: string
    probeTimeoutMillis: number
  }
  includeInternal: boolean
}

const DSH_PACKAGE_ROOT = '/usr/local/lib/node_modules/@deepseek-ai/dsh'

export function apply(ctx: Context, config: TelemetrySeamsConfig): void {
  const probeConfig: ProbeConfig = {
    collector: config.collector,
    includeInternal: config.includeInternal,
  }

  // Mount the Remote service so the browser tab can call probe() directly.
  ctx.plugin(InventoryService, probeConfig)

  ctx.tools.register(
    defineTool({
      name: 'telemetry_seams_inventory',
      description:
        'Discover and health-check every telemetry and information seam in this DSH deployment. ' +
        'Returns a structured inventory of session persistence, live session events, application logs, ' +
        'metrics, traces, and OTLP transport interfaces. Each seam includes its source, collection method, ' +
        'destination, enabled status, lifecycle state (supported/configured/operational/unavailable/unknown), ' +
        'and observed evidence. Use to audit what telemetry is wired vs merely configured.',
      parameters: {
        includeInternal: {
          type: 'boolean',
          description:
            'Include seams for DSH interfaces that exist internally but are not publicly exported. ' +
            'Defaults to the plugin-level includeInternal setting.',
        },
        forceRefresh: {
          type: 'boolean',
          description: 'Reserved — probes always run fresh.',
        },
      },
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      timeoutMs: 20_000,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const dshHome = resolveDshHome(homedir())
        const env: ProbeEnvironment = {
          dshVersion: await readDshVersion(DSH_PACKAGE_ROOT),
          profile: process.env.DSH_PROFILE ?? 'unknown',
          sessionId: exec.agent?.id,
          dshHome,
          sessionRoot: join(dshHome, 'sessions'),
        }
        const pc: ProbeConfig = {
          collector: config.collector,
          includeInternal: args.includeInternal ?? config.includeInternal,
        }
        const inventory = await buildInventory(ctx, pc, env)
        const lines: string[] = [
          '# Telemetry Seams Inventory',
          `Generated: ${inventory.generatedAt}`,
          `DSH: ${inventory.host.dshVersion} · Profile: ${inventory.host.profile}`,
          '',
          '## Collector',
          `Endpoint: ${inventory.collector.endpoint}`,
          `Reachable: ${inventory.collector.reachable}`,
          inventory.collector.uptime ? `Uptime: ${inventory.collector.uptime}` : '',
          inventory.collector.pipelines.length > 0
            ? `Pipelines (${inventory.collector.pipelines.length}): ${inventory.collector.pipelines.map((p) => p.name).join(', ')}`
            : 'Pipelines: none detected',
          '',
          `## Seams (${inventory.seams.length})`,
        ]
        for (const seam of inventory.seams) {
          const icon =
            seam.health === 'operational'
              ? '✅'
              : seam.health === 'configured'
                ? '🔵'
                : seam.health === 'supported'
                  ? '⚪'
                  : seam.health === 'unavailable'
                    ? '🔴'
                    : '❓'
          lines.push(
            '',
            `### ${icon} ${seam.id}`,
            `Kind: ${seam.kind} · Owner: ${seam.owner} · Status: ${seam.status} · Health: ${seam.health}`,
            `Provides: ${seam.provides}`,
            `Source: ${seam.source}`,
            `Collection: ${seam.collection}`,
            `Destination: ${seam.destination}`,
            seam.internal ? '⚠ Internal interface (not publicly exported)' : '',
            seam.note ? `Note: ${seam.note}` : '',
            seam.evidence.length > 0
              ? `Evidence: ${seam.evidence.map((e) => `${e.ok ? '✓' : '✗'} ${e.probe}: ${e.detail}`).join('; ')}`
              : 'Evidence: none',
          )
        }
        if (inventory.gaps.length > 0) {
          lines.push('', '## Gaps', ...inventory.gaps.map((g) => `- ${g}`))
        }
        lines.push('', '```json', JSON.stringify(inventory, null, 2), '```')
        return lines.filter((l) => l !== '').join('\n')
      },
    }),
  )
}
