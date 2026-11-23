// Shared helpers for the proof-*.test.mjs files. Not a test file itself (name lacks ".test.").
// Real SOUP worker only: tests that need it skip with a visible reason when SOUP_PYTHON is unset.
export const PY = process.env.SOUP_PYTHON
export const opts = { skip: PY ? false : 'SOUP_PYTHON with soup_cli not set' }
export const event = (text, turn = 1) => ({ type: 'assistant/message', data: { turn, message: { content: [{ type: 'text', text }] } } })
export const obs = (text, turn = 1) => ({ text, turn })
export const REF = 'keep following the plan'
export const LIVE = 'different unrelated output topic'
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export async function until(cond, ms = 15000) {
  const end = Date.now() + ms
  while (!cond() && Date.now() < end) await sleep(30)
  return cond()
}
