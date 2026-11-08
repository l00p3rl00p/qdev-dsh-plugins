# SOUP Drift roadmap

## Proven baseline
Package `qdev-trajectory-drift-soup`, version 0.5.3. Live drift detection and Gentle Mentor intervention were demonstrated in the QDev Harness.

## Next — CHAT 2.0 (frozen scope)
1. Finish native Settings values and persistence.
2. Provide per-chat live view, with overrides of global sensitivity/threshold defaults.
3. Show and edit the active Gentle Mentor message and governing plan/amendments.
4. Keep first qualifying drift as one reminder; on second, inject reminder plus active plan; retain three-count escalation guard.
5. Allow per-chat intervention suppression **without stopping** observation or telemetry.
6. Show per-chat threshold graph and intervention history.

## Acceptance
Complete the agreed CHAT 2.0 checklist against actual DSH sessions; preserve the verified observation → SOUP evaluation → Gentle Mentor → DSH loop. Preserve the independent SOUP worker and real Python tests. Move source ownership to its own Git repository before converting the parent folder to a submodule.

## Later work
Original SOUP application visualization is separate from CHAT 2.0.
