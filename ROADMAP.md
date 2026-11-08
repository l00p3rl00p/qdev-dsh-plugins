# Roadmap

The parent repository tracks the **coordination and adoption milestones**. The actionable cross-plugin priority queue remains [BACKLOG.md](BACKLOG.md). Each plugin owns its implementation roadmap in its own `ROADMAP.md`.

## Coordination milestones

1. Preserve all three source implementations and shared lessons during consolidation.
2. Establish independent Git repositories for SOUP and Telemetry Seams; keep the existing ACC repository canonical.
3. Convert the three staged plugin directories into genuine Git submodules, with reviewed URLs and pinned verified commits.
4. Update the parent CI to checkout submodules recursively, verify each selected commit, and publish artifacts tied to source commits.
5. Keep all plugin development, release history, roadmaps and plugin-specific lessons inside the independent repositories.
6. Confirm deployment into QDev only through explicit, verified operator action; this parent repository remains a catalog.

## Plugin roadmaps

- [ACC](plugins/dsh-auto-code-correct/ROADMAP.md)
- [SOUP Drift](plugins/qdev-soup-drift/ROADMAP.md)
- [Telemetry Seams](plugins/dsh-telemetry-seams/ROADMAP.md)

## Scope and release gates

No background rewrites of Scratchpad, automatic installed-version changes, speculative submodule links, or cross-plugin releases. A passing CI package build is not a substitute for a live Web UI action and evidence. Follow [Runbook](RUNBOOK.md) and [Lessons](LESSONS.md).
