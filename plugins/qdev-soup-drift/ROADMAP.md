# SOUP Drift — upcoming features

## CHAT 2.0 — frozen feature scope

- **Per-chat live SOUP view:** see trajectory drift during each session.
- **Per-chat settings:** override global sensitivity and threshold choices.
- **Editable Gentle Mentor context:** view and edit the active message, plan and amendments.
- **Progressive intervention:** first qualifying drift delivers one reminder; second delivers the reminder plus the active plan; existing three-count human escalation remains.
- **Per-chat intervention control:** suppress intervention for one chat without suppressing observation or telemetry.
- **Drift visualization:** threshold graph and intervention/event history per chat.
- **Persistent native settings:** retain effective configuration across reopen and restart.

Status (this branch): the per-chat Live & Mentor view (card, KL chart, reset decision), persisted history, and editable Gentle Mentor context are built. Current version: package.json.

## Open items

- **Done in this branch:** the Live & Mentor history (last 50 calculations and markers) is stored per chat in the `qdev_soup_live_history` storage domain and restored after a Host restart. The reset footnote is removed.
- **Parked:** OTEL telemetry. SOUP should emit telemetry through a DSH method, not through a plugin read path. Not started.

## Future feature — separate scope

- **Original SOUP application visualization:** expose the real upstream SOUP application's capabilities without duplicating its engine.

Only prospective features belong in release roadmaps. Implementation and acceptance work remain in [BACKLOG.md](../../BACKLOG.md).
