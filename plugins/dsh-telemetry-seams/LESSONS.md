# Telemetry Seams-specific lessons

Shared package and recovery rules: [../plugin-lessons.md](../plugin-lessons.md).

- A mounted `ctx.otel` or `ctx.sessionTelemetry` service proves local wiring, not delivery to a collector/database.
- TCP reachability and zpages indicate transport/pipeline presence, not persisted end-to-end telemetry.
- Session logs may use compressed `.jsonl.zstd` files; probes must account for supported persistence formats.
- A missing `DSH_PROFILE` removes useful attribution; preserve unknown provenance rather than inventing a profile.
- Session JSONL absence may be expected under `FEEDBACK_ONLY` and is not inherently a failure.
- Agent and UI views should use the same inventory service. Keep it read-only; it must not become an exporter.
