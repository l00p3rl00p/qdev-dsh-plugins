# Telemetry Seams-specific lessons

## Protect known-good execution paths

- Once an execution path is proven to work, treat that behavior as **immutable by default**. Do not change it merely to improve diagnostics, observability, presentation, packaging, or operator convenience.
- Add observation around a working path; do not insert transformations into the live value/control path unless the change is explicitly required by the feature itself.
- Security handling belongs at the boundary where information is copied, persisted, or displayed. Preserve the authoritative runtime value until the consumer that actually needs it has received it.
- Experimental changes must be isolated in a branch, worktree, disposable profile, or test-only path. Do not alter the known-good implementation in place to test an idea.
- Before replacing working behavior, prove the replacement against the same real execution boundary. Mocks, static checks, and package success are not substitutes for the live behavior that was already known to work.
- If a regression appears after an ancillary change, restore the last known-good behavior first, then investigate the ancillary feature separately.
- Lessons and diagnostics should describe the engineering principle and validation boundary without exposing secrets, credentials, or unnecessary security-sensitive implementation details.

Shared package and recovery rules: [../plugin-lessons.md](../plugin-lessons.md).

- A mounted `ctx.otel` or `ctx.sessionTelemetry` service proves local wiring, not delivery to a collector/database.
- TCP reachability and zpages indicate transport/pipeline presence, not persisted end-to-end telemetry.
- Session logs may use compressed `.jsonl.zstd` files; probes must account for supported persistence formats.
- A missing `DSH_PROFILE` removes useful attribution; preserve unknown provenance rather than inventing a profile.
- Session JSONL absence may be expected under `FEEDBACK_ONLY` and is not inherently a failure.
- Agent and UI views should use the same inventory service. Keep it read-only; it must not become an exporter.
