// Host-independent session bookkeeping (P2): which runtime belongs to which session and which
// detectors are running. The host supplies the DSH-specific lookups as plain functions.

export function createSessionRegistry({ resolveAgent, attachAgent, replay, report }) {
  const runtimes = new Map()
  const running = new Set()
  const reportedDrops = new Set() // sessions that already have their ONE 'drop' diagnostic
  let droppedEvents = 0
  const droppedBySession = new Map()

  // P3: an event that cannot be observed is never silent. Count it, and say why once per session.
  function drop(id, reason) {
    droppedEvents += 1
    droppedBySession.set(id, (droppedBySession.get(id) ?? 0) + 1)
    if (reportedDrops.has(id)) return false
    reportedDrops.add(id)
    report(new Error(`SOUP dropped session events: ${reason}`), { phase: 'drop', sessionId: id })
    return false
  }

  // Resolve (or lazily create via replay) the runtime for a session, then observe the event.
  // Returns true only if the event reached a runtime. When an agent becomes resolvable later,
  // the existing replay path seeds from the session history before this event (beforeSeq).
  // That only fills the BASELINE up to baselineCount; it does not backfill the live window or
  // recover every event that was dropped earlier. Dropped events are counted, not replayed.
  function observe(id, event) {
    let runtime = runtimes.get(id)
    if (!runtime) {
      const agent = resolveAgent(id)
      if (!agent) return drop(id, 'no agent is available for this session')
      attachAgent(agent)
      replay(agent, Number(event?.seq))
      runtime = runtimes.get(id)
      if (!runtime) return drop(id, 'no runtime could be created for this session')
      reportedDrops.delete(id)
    }
    runtime.observe(id, event)
    return true
  }

  return {
    observe,
    get droppedEvents() { return droppedEvents },
    /** Events of ONE session that could not reach a runtime (for the per-chat view). */
    droppedFor: (id) => droppedBySession.get(id) ?? 0,
    runtimes,
    running,
    // A consumer failure must not clear the running flag of a live evaluation.
    noteDetectorError(details = {}) {
      if (details.sessionId && details.phase !== 'consumer' && !String(details.phase ?? '').startsWith('consumer:')) running.delete(details.sessionId)
    },
  }
}
