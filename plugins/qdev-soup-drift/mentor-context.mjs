// Feature 4: per-chat Gentle Mentor context. A missing key means "use the default".
// The Host reads this record at each second-drift intervention, so an edit changes the prompt actually sent.
import { z } from 'zod'

export const MENTOR_LIMITS = Object.freeze({ message: 4000, plan: 20000, amendments: 50, amendmentLength: 2000 })
export const MENTOR_FIELDS = Object.freeze(['message', 'plan', 'amendments'])

export const MentorContextRecord = z.object({
  message: z.string().min(1).max(MENTOR_LIMITS.message).optional(),
  plan: z.string().min(1).max(MENTOR_LIMITS.plan).optional(),
  amendments: z.array(z.string().min(1).max(MENTOR_LIMITS.amendmentLength)).max(MENTOR_LIMITS.amendments).optional(),
  // Per-chat escalation bypass (spec B1). Absent means off.
  escalationBypass: z.boolean().optional(),
}).strict()

// Apply one field edit. value === null restores the default for that field.
// An empty amendment list is stored as absent, so "no amendments" and "default" are the same thing.
export function applyMentorEdit(current, field, value) {
  if (!MENTOR_FIELDS.includes(field)) throw new Error(`Unknown Gentle Mentor field: ${String(field)}`)
  const next = { ...current }
  if (value === null) delete next[field]
  else next[field] = value
  if (field === 'amendments' && Array.isArray(next.amendments) && next.amendments.length === 0) delete next.amendments
  return MentorContextRecord.parse(next)
}
