# QDev DSH plugin backlog

This is the cross-plugin prioritization queue. Each independently versioned plugin owns its implementation details in `ROADMAP.md`.

## Current order
1. **Telemetry Seams — evidence-backed observability:** maintain real, non-synthetic proof of configured versus operational telemetry paths; preserve the read-only inventory contract.
2. **SOUP Drift — CHAT 2.0:** implement the already-agreed per-chat controls and visualization, without regressing verified live drift detection and Gentle Mentor intervention.
3. **ACC — operational readiness:** complete and verify stable language readiness, settings persistence, package/load safety, and visible correction outcomes.

## Cross-plugin gates
- Keep each plugin independently buildable, testable, installable, and removable.
- Strict package checks include native DSH loading, browser loader compatibility, clean-profile installation and release artifacts.
- Distinguish automated checks from real running-session acceptance.
- Preserve each plugin's existing package identity and scoped emergency removal command.
- Do not replace working code, silently rewrite history, or deploy simply because a source transfer occurred.
- Maintain a common lessons record in [plugins/plugin-lessons.md](plugins/plugin-lessons.md); plugin-local investigations live in each plugin's `LESSONS.md`.

## Repository architecture
`plugins/<plugin>` is the intended **Git submodule mount** of an independent repository, not a second source of truth. Main repo tracks the chosen commit of each plugin, shared policies and the integration test matrix. Use independent commits and PRs in the plugin repo for work on just one plugin. Update the parent submodule pointer only after verification.

**Migration status:** ACC has an independent upstream already. SOUP and Telemetry Seams currently originate from Scratchpad subdirectories and require standalone Git repositories before converting these directories to submodules. Until then, this branch has self-contained copies of source for preservation and verification, not functioning Git submodules.
