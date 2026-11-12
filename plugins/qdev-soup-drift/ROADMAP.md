# SOUP Drift — upcoming features

## CHAT 2.0 — frozen feature scope

- **Per-chat live SOUP view:** see trajectory drift during each session.
- **Per-chat settings:** override global sensitivity and threshold choices.
- **Editable Gentle Mentor context:** view and edit the active message, plan and amendments.
- **Progressive intervention:** first qualifying drift delivers one reminder; second delivers the reminder plus the active plan; existing three-count human escalation remains.
- **Per-chat intervention control:** suppress intervention for one chat without suppressing observation or telemetry.
- **Drift visualization:** threshold graph and intervention/event history per chat.
- **Persistent native settings:** retain effective configuration across reopen and restart.

Status: 0.7.0 delivers the per-chat Live & Mentor view (card, KL chart, reset decision, read-only Gentle Mentor). Editing of the Gentle Mentor context remains open.

## Open items

- **Persist the Live & Mentor history across Harness restarts.** Today the last 50 calculations and the markers are memory only, and the view says "History resets when the Harness restarts." Options: (1) store them per chat in SOUP's `storageDomain`, the same pattern as the Gentle Mentor state, and drop the reset footnote; (2) send each calculation to OTEL as evidence, which needs a read path back into the plugin. Recommended: option 1 first.

## Future feature — separate scope

- **Original SOUP application visualization:** expose the real upstream SOUP application's capabilities without duplicating its engine.

Only prospective features belong in release roadmaps. Implementation and acceptance work remain in [BACKLOG.md](../../BACKLOG.md).
