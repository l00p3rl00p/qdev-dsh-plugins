# Telemetry Seams roadmap

## Current baseline
Native read-only `dsh-telemetry-seams` version 0.1.2; operator guide documents installation into DSH Web and `telemetry_seams_inventory` plus conversation-tab probes.

## Next
1. Keep configured/supported/operational/unavailable states distinct, with real evidence attached to every probe.
2. Validate the active DSH profile provenance from a DSH-owned API/config service when available.
3. Improve real data-delivery evidence beyond service mount/TCP health for OTEL and downstream backends, without owning transport.
4. Preserve opt-in, one-time auto-probe rather than a background polling loop.
5. Verify tests, browser package contract, clean-profile install and actual running-session tab/tool behavior.

## Acceptance
A user or agent can inspect the status and evidence for each seam without adding, rerouting, or emitting telemetry. Move source ownership to its own Git repository before conversion to a parent submodule.
