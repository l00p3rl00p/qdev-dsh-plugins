/**
 * Telemetry Seams — Typert Remote client descriptor.
 * Pattern: identical to ACC typert.remote-client.ts (lessons §3).
 */
import { z } from 'zod'
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SeamInventory } from './seams/types.js'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    telemetrySeamsInventory: {
      probe(): Promise<RemoteResult<SeamInventory>>
    }
  }
}

// Loose Zod schema — SeamInventory is a complex nested type; we accept any
// object from the wire and let TypeScript narrow it on the client side.
const seamInventorySchema = z.object({
  generatedAt: z.string(),
  host: z.object({
    dshVersion: z.string(),
    profile: z.string(),
    sessionId: z.string().optional(),
  }),
  collector: z.object({
    endpoint: z.string(),
    reachable: z.boolean(),
    upSince: z.string().optional(),
    uptime: z.string().optional(),
    pipelines: z.array(
      z.object({
        name: z.string(),
        inputType: z.string(),
        receivers: z.array(z.string()),
        processors: z.array(z.string()),
        exporters: z.array(z.string()),
      }),
    ),
  }),
  seams: z.array(z.any()),
  gaps: z.array(z.string()),
})

export const TELEMETRY_REMOTE = createTypertRemoteInfo(
  {
    package: 'dsh-telemetry-seams',
    methods: {
      'telemetrySeamsInventory/probe': {
        service: 'telemetrySeamsInventory',
        description: 'Run all telemetry seam probes and return a fresh inventory.',
        invocation: { kind: 'direct' },
        parameters: [],
        result: {
          mode: 'strict',
          typeSymbol: 'dsh-telemetry-seams#telemetrySeamsInventory/probe:result',
          create: () => seamInventorySchema,
          jsonSchema: { type: 'object' },
        },
        sourceLocation: { file: 'src/inventory-service.ts', line: 34, column: 3 },
      },
    },
  },
  z,
)
