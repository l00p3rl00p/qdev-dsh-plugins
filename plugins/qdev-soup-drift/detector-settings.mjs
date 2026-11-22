// DETECTOR component settings. WHY: the detector (the producer) owns its own settings definition -
// defaults, validation, per-chat sparse override eligibility and its enable flag - so it can be used
// and configured with no knowledge of Gentle Mentor or any other consumer. session-settings.mjs only
// COMPOSES this with the other components' definitions. Stored key names are unchanged (backward
// compatible with saved Loader config and per-chat records).
import { z } from 'zod'

const fields = {
  python: z.string().refine((value) => value.trim().length > 0, 'Python executable must not be empty'),
  detectorEnabled: z.boolean(),
  preset: z.number().int().min(0).max(4),
  baselineCount: z.number().int().min(1).max(100),
  windowCount: z.number().int().min(1).max(100),
}

const defaults = Object.freeze({ python: 'python3', detectorEnabled: true, preset: 2, baselineCount: 4, windowCount: 4 })
const clamp = (value, low, high, fallback) => Math.max(low, Math.min(high, Math.trunc(value ?? fallback)))

export const detectorSettings = Object.freeze({
  name: 'detector',
  /** The flag that switches THIS component on/off (the global master is separate). */
  enableKey: 'detectorEnabled',
  fields,
  defaults,
  /** Clamp raw global Config values exactly as the Host always did (missing -> default). */
  normalize: (raw = {}) => ({
    python: raw.python ?? defaults.python,
    detectorEnabled: raw.detectorEnabled ?? defaults.detectorEnabled,
    preset: clamp(raw.preset, 0, 4, defaults.preset),
    baselineCount: clamp(raw.baselineCount, 1, 100, defaults.baselineCount),
    windowCount: clamp(raw.windowCount, 1, 100, defaults.windowCount),
  }),
  /** The detector's configuration, derived from the effective settings. Reads detector keys only. */
  toDetectorConfig: (effective) => ({
    python: effective.python,
    preset: effective.preset,
    baselineCount: effective.baselineCount,
    windowCount: effective.windowCount,
    enabled: effective.enabled && effective.detectorEnabled,
  }),
})
