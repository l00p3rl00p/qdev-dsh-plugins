# QDev DeepSeek Harness Plugins

The coordination repository for independently versioned DeepSeek Harness plugins.

**Target topology:** each `plugins/<name>` directory is a **Git submodule** pointing to a dedicated plugin repository. Changes, releases, and history belong to the individual plugin; the parent pins tested commits and maintains cross-plugin governance.

| Plugin | Directory | Package identity | Current source version |
| --- | --- | --- | --- |
| Auto Code Correct (ACC) | [plugins/dsh-auto-code-correct](plugins/dsh-auto-code-correct) | `dsh-auto-code-correct` | 0.1.12 |
| SOUP Drift + Gentle Mentor | [plugins/qdev-soup-drift](plugins/qdev-soup-drift) | `qdev-trajectory-drift-soup` | 0.5.3 |
| Telemetry Seams | [plugins/dsh-telemetry-seams](plugins/dsh-telemetry-seams) | `dsh-telemetry-seams` | 0.1.2 |

## Planning and learning

- [Overall backlog](BACKLOG.md) — priorities and inter-plugin dependencies.
- [General lessons learned](LESSONS.md) — common Web loader, packaging, deployment and emergency removal rules.
- Each plugin has its own `ROADMAP.md`, `LESSONS.md`, README, tests and packaging contract.

## Independent development model

Work in a **single child repository** for an individual plugin. Release/test it there, then update the parent submodule reference to its verified commit. Do not duplicate live source or automatically propagate changes back into Scratchpad.

## Transfer state

This branch is a **staging snapshot**, not the final Git submodule arrangement. ACC already has its [own Git repository](https://github.com/l00p3rl00p/dsh-auto-code-correct). SOUP and Telemetry Seams are currently sourced from [quatrus-scratchpad](https://github.com/l00p3rl00p/quatrus-scratchpad) subfolders; they need dedicated GitHub repositories before their directories can become genuine submodules. The GitHub connector available here cannot create repositories, so these folders must not be represented as Git links to non-existent remotes. No live QDev installation is changed.

GitHub Actions currently validates the **staged copied source** (ACC strict package contract, SOUP official worker, Telemetry Seams read-only plugin). When submodules are created, update checkout to `submodules: recursive` and paths/filters to run the same checks against the pinned child commits before merging the topology change.

Historical SOUP v1 and unrelated Scratchpad experiments are intentionally excluded.
