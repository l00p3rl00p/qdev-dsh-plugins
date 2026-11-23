import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
// @ts-expect-error JavaScript settings module has no declaration file.
import { createKeyedQueue, SessionSettingsError } from '../session-settings.mjs'
// @ts-expect-error JavaScript module has no declaration file.
import { applyMentorEdit, MENTOR_LIMITS } from '../mentor-context.mjs'
import { SESSION_SETTINGS_PATH, SESSION_STATUS_PATH, STATUS_PATH } from './constants.js'
import type { Intervention, MentorContext, Resolved, RuntimeStatus, Table } from './types.js'

// Derived from the Mentor limits so the reader and the schema cannot drift apart. The largest valid
// request is one full plan (MENTOR_LIMITS.plan characters). JSON escaping and non-ASCII text can
// expand each character to several bytes, so allow 6 bytes per character plus fixed JSON overhead.
const MAX_BODY_BYTES = MENTOR_LIMITS.plan * 6 + 4096
const readJsonBody = async (request: AsyncIterable<Uint8Array | string>): Promise<unknown> => {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    size += bytes.byteLength
    if (size > MAX_BODY_BYTES) throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(bytes)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(body))
}

// HTTP surface: the status route (web server) and the per-chat settings/status routes (native Connection).
// Every route is optional; the SOUP monitor never depends on any of them.
export function registerRoutes({ ctx, status, resolved, agents, runtimes, interventions, sessionSettings, sessionLiveView, mentorContexts, contextTable, noteMissing }: {
  ctx: Context
  status: RuntimeStatus
  resolved: Resolved
  agents: Map<string, Agent>
  runtimes: Map<string, any>
  interventions: Map<string, Intervention>
  sessionSettings: any
  sessionLiveView: (id: string, attached?: boolean) => unknown
  mentorContexts: Map<string, MentorContext>
  contextTable: Table<MentorContext>
  noteMissing: (service: string) => void
}) {
  // Mentor saves are read-modify-write on the whole per-chat record: serialize them per chat so two overlapping
  // saves to different fields cannot both start from the same old record and drop each other's field.
  const enqueueMentorSave = createKeyedQueue()
  // Native Connection owns authentication, trust and owner-only admission for this
  // exact Fetch route. Optional UI services must never gate the monitoring core.
  ctx.inject(['connection', 'sessionPersistence'], (uiCtx) => {
    const reply = (data: unknown, code = 200): Response => Response.json(data, {
      status: code, headers: { 'cache-control': 'no-store' },
    })
    const view = (id: string) => ({ ...sessionSettings.read(id), writable: resolved.enabled })
    const presence = async (id: string): Promise<{ attached: boolean; exists: boolean }> => {
      const attached = agents.has(id) || Boolean(ctx.agents.get(id as Session['id']))
      return { attached, exists: attached || Boolean(await uiCtx.sessionPersistence.stat(id as Session['id'])) }
    }
    const exists = async (id: string): Promise<boolean> => (await presence(id)).exists
    uiCtx.connection.fetch.register({
      path: SESSION_STATUS_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        if (status.lifecycle.state !== 'active') return reply({ ok: false, error: 'plugin-disposed' }, 503)
        try {
          const ids = new URL(request.url).searchParams.getAll('sessionId')
          if (ids.length !== 1) return reply({ ok: false, error: 'invalid-status', message: 'One session identifier is required' }, 400)
          sessionSettings.read(ids[0])
          const found = await presence(ids[0])
          if (!found.exists) return reply({ ok: false, error: 'session-not-found' }, 404)
          return reply({ ok: true, live: sessionLiveView(ids[0], found.attached) })
        } catch (error) {
          if (error instanceof SessionSettingsError) {
            return reply({ ok: false, error: 'invalid-status', message: String(error) }, 400)
          }
          return reply({ ok: false, error: 'status-unavailable', message: 'Unable to read live chat status' }, 500)
        }
      },
    })
    uiCtx.connection.fetch.register({
      path: SESSION_SETTINGS_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      async fetch(request) {
        if (status.lifecycle.state !== 'active') return reply({ ok: false, error: 'plugin-disposed' }, 503)
        try {
          if (request.method === 'GET') {
            const ids = new URL(request.url).searchParams.getAll('sessionId')
            if (ids.length !== 1) return reply({ ok: false, error: 'invalid-settings', message: 'One session identifier is required' }, 400)
            const settings = view(ids[0])
            if (!await exists(ids[0])) return reply({ ok: false, error: 'session-not-found' }, 404)
            return reply({ ok: true, settings })
          }
          if (request.headers.get('x-qdev-soup-action') !== 'session-settings') {
            return reply({ ok: false, error: 'action-header-required' }, 403)
          }
          if (!request.headers.get('content-type')?.startsWith('application/json')) {
            return reply({ ok: false, error: 'json-required' }, 415)
          }
          if (!resolved.enabled) return reply({ ok: false, error: 'soup-disabled', message: 'Enable the global SOUP master before editing chat settings' }, 409)
          const text = await request.text()
          if (Buffer.byteLength(text) > 16_384) return reply({ ok: false, error: 'request-too-large' }, 413)
          let body: unknown
          try { body = JSON.parse(text) } catch { return reply({ ok: false, error: 'invalid-settings', message: 'Invalid JSON' }, 400) }
          if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ ok: false, error: 'invalid-settings' }, 400)
          const { sessionId, ...command } = body as Record<string, unknown>
          if (typeof sessionId !== 'string') return reply({ ok: false, error: 'invalid-settings' }, 400)
          view(sessionId)
          if (!await exists(sessionId)) return reply({ ok: false, error: 'session-not-found' }, 404)
          if (!resolved.enabled) return reply({ ok: false, error: 'soup-disabled' }, 409)
          const settings = await sessionSettings.mutate(sessionId, command)
          return reply({ ok: true, settings: { ...settings, writable: resolved.enabled } })
        } catch (error) {
          if (error instanceof SessionSettingsError) {
            const failure = error as Error & { code: string; settings?: Record<string, unknown> }
            return reply({
              ok: false, error: failure.code, message: failure.message,
              ...(failure.settings ? { settings: { ...failure.settings, writable: resolved.enabled } } : {}),
            }, failure.code === 'revision-conflict' ? 409 : failure.code === 'storage-failed' ? 503 : 400)
          }
          return reply({ ok: false, error: 'settings-unavailable', message: 'Unable to read or apply chat settings' }, 500)
        }
      },
    })
  })

  if (!ctx.get('webServer')) noteMissing('webServer')
  ctx.effect(() => ctx.get('webServer')?.register({
    kind: 'exact',
    path: STATUS_PATH,
    handler: async (request, response) => {
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.setHeader('cache-control', 'no-store')
      if (request.method === 'GET') {
        response.statusCode = 200
        response.end(JSON.stringify(status))
        return
      }
      if (request.method === 'POST' && !resolved.enabled) {
        response.statusCode = 409
        response.end(JSON.stringify({ ok: false, error: 'soup-disabled' }))
        return
      }
      if (request.method !== 'POST') {
        response.statusCode = 405
        response.setHeader('allow', 'GET, POST')
        response.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }))
        return
      }
      const rejection = ctx.get('connection')?.requestRejection(request)
      if (rejection !== undefined) {
        response.statusCode = rejection
        response.end(JSON.stringify({ ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden' }))
        return
      }
      const actionHeader = request.headers['x-qdev-soup-action']
      if (actionHeader !== 'reset-drift-count' && actionHeader !== 'session-mentor') {
        response.statusCode = 403
        response.end(JSON.stringify({ ok: false, error: 'action-header-required' }))
        return
      }
      try {
        const body = await readJsonBody(request)
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object')
        if (actionHeader === 'session-mentor') {
          // Feature 4: save one Gentle Mentor field for one chat. Refused when monitoring is off.
          const mentorSessionId = Reflect.get(body, 'sessionId')
          if (typeof mentorSessionId !== 'string' || !mentorSessionId) throw new Error('sessionId is required')
          sessionSettings.read(mentorSessionId)
          // Edits happen in an open chat: the agent must be attached right now.
          if (!agents.has(mentorSessionId) && !ctx.agents.get(mentorSessionId as Session['id'])) {
            response.statusCode = 409
            response.end(JSON.stringify({ ok: false, error: 'chat-not-attached' }))
            return
          }
          if (!resolved.enabled) {
            response.statusCode = 409
            response.end(JSON.stringify({ ok: false, error: 'monitoring-off' }))
            return
          }
          const field = Reflect.get(body, 'field')
          const value = Reflect.get(body, 'value')
          // The whole read -> validate -> durable write -> in-memory update runs inside the per-chat queue.
          const outcome = await enqueueMentorSave(mentorSessionId, async (): Promise<{ ok: true } | { ok: false; message: string }> => {
            let next: MentorContext
            try {
              next = applyMentorEdit(mentorContexts.get(mentorSessionId) ?? {}, field, value)
            } catch (error) {
              return { ok: false, message: error instanceof Error ? error.message : String(error) }
            }
            await contextTable.put(mentorSessionId, next)
            mentorContexts.set(mentorSessionId, next)
            return { ok: true }
          })
          if (!outcome.ok) {
            response.statusCode = 400
            response.end(JSON.stringify({ ok: false, error: 'invalid-mentor-edit', message: outcome.message }))
            return
          }
          response.statusCode = 200
          response.end(JSON.stringify({ ok: true, view: sessionLiveView(mentorSessionId, true) }))
          return
        }
        const action = Reflect.get(body, 'action')
        const reset = Reflect.get(body, 'reset')
        const requestedSession = Reflect.get(body, 'sessionId')
        if (action !== 'reset-drift-count' || typeof reset !== 'boolean') throw new Error('Invalid reset action')
        const sessionId = typeof requestedSession === 'string' && requestedSession
          ? requestedSession
          : status.mentor.resetDecision?.sessionId
        if (!sessionId) throw new Error('No session is awaiting a reset decision')
        const result = runtimes.get(sessionId)?.decideDriftReset(sessionId, reset) ?? { accepted: false, reason: 'no-live-runtime' }
        if (result.accepted) {
          const pending = interventions.get(sessionId)
          if (pending) {
            pending.controller.abort()
            pending.record.state = 'answered'
            delete pending.record.error
            interventions.delete(sessionId)
          }
        }
        response.statusCode = result.accepted ? 200 : 409
        response.end(JSON.stringify({ ok: result.accepted, result }))
      } catch (error) {
        response.statusCode = 400
        response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
      }
    },
  }) ?? (() => {}))
}
