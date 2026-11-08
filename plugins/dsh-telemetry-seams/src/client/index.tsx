/**
 * Telemetry Seams — client entry.
 *
 * Registers the conversation.view tab. The "Run probe" button calls
 * InventoryService.probe() via ctx.remote — the correct DSH Remote pattern
 * (lessons §3: mount remote namespace, inject in child fiber, read via scope).
 */
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { TELEMETRY_REMOTE } from '../remote-client.js'
import { SeamsView } from './seams-view.js'
import type { SeamInventory } from '../seams/types.js'

export const name = 'telemetry-seams-client'
// Lessons §3: slots + uiConversation both required; remote for the probe call.
export const inject = ['slots', 'uiConversation', 'remote']

const VIEW_ID = 'telemetry-seams'

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  // Mount creates remote.telemetrySeamsInventory; must be read from a child
  // fiber that injects the namespace — same pattern as ACC (lessons §3).
  const disposeRemote = await ctx.remote.$mount(TELEMETRY_REMOTE)

  ctx.inject(['slots', 'uiConversation', 'remote.telemetrySeamsInventory'], (scope) => {
    scope.slots.inject('conversation.view', () =>
      scope.slots.register(
        {
          name: 'conversation.view',
          id: VIEW_ID,
          order: 30,
          label: () => 'Telemetry Seams',
        },
        function TelemetrySeamsTab() {
          const loadInventory = React.useCallback(async (_signal: AbortSignal): Promise<SeamInventory> => {
            // Signal is not passed as a named argument — the Typert Remote
            // infrastructure carries it separately. parameters: [] in the spec.
            const result = await scope.remote.telemetrySeamsInventory.probe()
            if (!result.ok) throw result.error
            return result.value as SeamInventory
          }, [])
          return React.createElement(SeamsView, { loadInventory })
        },
      ),
    )
  })

  return disposeRemote
}
