import { z } from 'zod'
import { PRESETS } from './drift.mjs'

const fields = {
  python: z.string().refine((value) => value.trim().length > 0, 'Python executable must not be empty'),
  enabled: z.boolean(),
  detectorEnabled: z.boolean(),
  reanchoring: z.boolean(),
  preset: z.number().int().min(0).max(4),
  baselineCount: z.number().int().min(1).max(100),
  windowCount: z.number().int().min(1).max(100),
}
const names = Object.keys(fields)
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
// Zod object parsing can materialize inherited known keys. Only JSON-own fields
// constitute a sparse override; prototypes must never turn inheritance into intent.
const ownFields = (value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value)) : value
const Overrides = z.preprocess(ownFields,
  z.object(Object.fromEntries(names.map((key) => [key, fields[key].optional()]))).strict()
    .superRefine((value, ctx) => {
      for (const key of Object.keys(value)) {
        if (value[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: 'Use unset to inherit a setting' })
      }
    }))

/** Native storageDomain record schema. Omission, not equality to a default, means inheritance. */
export const SessionSettingsRecord = z.preprocess(ownFields, z.object({ revision, overrides: Overrides }).strict())
const GlobalSettings = z.object(fields).strict()
const field = z.enum(names)
const Command = z.discriminatedUnion('op', [
  z.object({ expectedRevision: revision, op: z.literal('set'), field, value: z.unknown() }).strict(),
  z.object({ expectedRevision: revision, op: z.literal('unset'), field }).strict(),
])

export class SessionSettingsError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'SessionSettingsError'
    this.code = code
    if (options.settings) this.settings = structuredClone(options.settings)
  }
}

function invalid(message) {
  return new SessionSettingsError('invalid-settings', message)
}

function sessionKey(id) {
  // Match the native per-record backend's safe key vocabulary; identifiers are never paths.
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(id)) {
    throw invalid('Invalid session identifier')
  }
  return id
}

// Handles sharing one native table also share the write boundary. Different chats
// are independent; a failed write never poisons the next queued mutation.
const tableQueues = new WeakMap()

/**
 * Sparse per-chat settings over a Host-owned native KvTable. This module does not
 * own the domain lifecycle, create a backend, or change global configuration.
 * read is synchronous; mutate resolves after durability and synchronous onCommitted.
 */
export function createSessionSettings({ table, getGlobal, onCommitted = () => {} }) {
  if (!table || typeof table.get !== 'function' || typeof table.put !== 'function' ||
      typeof getGlobal !== 'function' || typeof onCommitted !== 'function') {
    throw new TypeError('A native table, global settings reader and optional commit callback are required')
  }
  let queues = tableQueues.get(table)
  if (!queues) tableQueues.set(table, queues = new Map())

  function recordOf(id) {
    const stored = table.get(id)
    if (stored === undefined) return { revision: 0, overrides: {} }
    const parsed = SessionSettingsRecord.safeParse(stored)
    if (!parsed.success) throw invalid('Invalid stored session settings')
    return parsed.data
  }

  function snapshot(id, record = recordOf(id)) {
    const global = getGlobal()
    const parsed = GlobalSettings.safeParse(Object.fromEntries(names.map((key) => [key, global?.[key]])))
    if (!parsed.success) throw invalid('Invalid global settings')
    const base = parsed.data
    const overrides = structuredClone(record.overrides)
    const effective = { ...base }
    const sources = {}
    for (const key of names) {
      const owned = Object.hasOwn(overrides, key)
      if (owned) effective[key] = overrides[key]
      sources[key] = owned ? 'chat' : 'global'
    }
    effective.enabled = base.enabled && effective.enabled
    if (!base.enabled) sources.enabled = 'global-master'
    return {
      sessionId: id, revision: record.revision, base, overrides, effective, sources,
      threshold: PRESETS[effective.preset], masterEnabled: base.enabled,
    }
  }

  function read(sessionId) {
    return snapshot(sessionKey(sessionId))
  }

  async function mutate(sessionId, input) {
    const id = sessionKey(sessionId)
    const parsed = Command.safeParse(ownFields(input))
    if (!parsed.success) throw invalid('Invalid settings mutation')
    const command = parsed.data
    if (command.op === 'set') {
      const value = fields[command.field].safeParse(command.value)
      if (!Object.hasOwn(input, 'value') || !value.success) throw invalid('Invalid setting value')
      command.value = value.data
    }
    const previous = queues.get(id) ?? Promise.resolve()
    const pending = previous.catch(() => {}).then(async () => {
      const current = recordOf(id)
      if (command.expectedRevision !== current.revision) {
        throw new SessionSettingsError('revision-conflict', 'Chat settings changed; refresh before saving', { settings: snapshot(id, current) })
      }
      const owned = Object.hasOwn(current.overrides, command.field)
      if ((command.op === 'unset' && !owned) || (command.op === 'set' && owned && current.overrides[command.field] === command.value)) {
        return snapshot(id, current)
      }
      if (current.revision === Number.MAX_SAFE_INTEGER) throw invalid('Settings revision limit reached')
      const next = { revision: current.revision + 1, overrides: { ...current.overrides } }
      if (command.op === 'unset') delete next.overrides[command.field]
      else next.overrides[command.field] = command.value
      // Check globals before writing too; malformed effective settings must not be durable.
      snapshot(id, next)
      try {
        await table.put(id, structuredClone(next))
      } catch (cause) {
        throw new SessionSettingsError('storage-failed', 'Unable to persist chat settings', { cause })
      }
      const committed = snapshot(id, next)
      // No rollback is possible after durable success. The Host callback must be
      // synchronous and non-throwing; its snapshot is detached from both table and result.
      onCommitted(id, structuredClone(committed))
      return committed
    })
    queues.set(id, pending)
    try {
      return await pending
    } finally {
      if (queues.get(id) === pending) queues.delete(id)
    }
  }

  return { read, mutate }
}
