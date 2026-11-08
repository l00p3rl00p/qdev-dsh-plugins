/**
 * Telemetry Seams — Host Remote service.
 * Pattern: identical to ACC AccReadinessService (lessons §3).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { buildInventory, resolveDshHome, readDshVersion, type ProbeConfig } from './seams/probe.js'
import type { SeamInventory } from './seams/types.js'

const DSH_PACKAGE_ROOT = '/usr/local/lib/node_modules/@deepseek-ai/dsh'

export class InventoryService extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly probeConfig: ProbeConfig,
  ) {
    super(ctx, 'telemetrySeamsInventory')
    // Register Remote marker explicitly for Node 22 (no stage-3 decorator
    // transform at runtime) — same workaround as ACC AccReadinessService.
    Remote(this.probe, {
      kind: 'method',
      name: 'probe',
      static: false,
      private: false,
      access: { has: () => true, get: () => this.probe },
      addInitializer: (initializer) => initializer.call(this),
      metadata: undefined,
    } as ClassMethodDecoratorContext<object, (this: object) => Promise<SeamInventory>>)
  }

  async probe(): Promise<SeamInventory> {
    const dshHome = resolveDshHome(homedir())
    const env = {
      dshVersion: await readDshVersion(DSH_PACKAGE_ROOT),
      profile: process.env.DSH_PROFILE ?? 'unknown',
      sessionId: undefined,
      dshHome,
      sessionRoot: join(dshHome, 'sessions'),
    }
    return buildInventory(this.ctx, this.probeConfig, env)
  }
}
