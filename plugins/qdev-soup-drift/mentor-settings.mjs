// GENTLE MENTOR component settings. WHY: Mentor is one consumer of drift evidence and owns its own
// settings definition, separate from the detector's. Today it has a single stored key, `reanchoring`
// (the enable flag). The strike policy (two reminders, escalate on the third) and the reset-vs-carry
// choice are NOT settings: they are fixed policy and a human answer, and are not invented here.
import { z } from 'zod'

const fields = { reanchoring: z.boolean() }
const defaults = Object.freeze({ reanchoring: true })

export const mentorSettings = Object.freeze({
  name: 'mentor',
  /** The flag that switches THIS component on/off (the global master is separate). */
  enableKey: 'reanchoring',
  fields,
  defaults,
  normalize: (raw = {}) => ({ reanchoring: raw.reanchoring ?? defaults.reanchoring }),
  /** Mentor acts only when the master switch and its own flag are both on. */
  isActive: (effective) => effective.enabled && effective.reanchoring,
})
