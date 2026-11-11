# Components

The authoritative cross-plugin inventory. Detailed behavior belongs to each plugin's README, roadmap, package manifest and tests.

| Component | Identity | Source version | Capability | Source authority |
| --- | --- | --- | --- | --- |
| [Auto Code Correct](plugins/dsh-auto-code-correct) | `dsh-auto-code-correct` | 0.1.13 | Correction, language readiness and operation evidence | [ACC repository](https://github.com/l00p3rl00p/dsh-auto-code-correct) |
| [SOUP Drift + Gentle Mentor](plugins/qdev-soup-drift) | `qdev-trajectory-drift-soup` | 0.5.3 | Live trajectory drift detection and intervention | [Scratchpad SOUP](https://github.com/l00p3rl00p/quatrus-scratchpad/tree/main/plugins/qdev-soup-drift) |
| [Telemetry Seams](plugins/dsh-telemetry-seams) | `dsh-telemetry-seams` | 0.1.2 | Read-only telemetry seam inventory, health probes and UI | [Scratchpad Telemetry](https://github.com/l00p3rl00p/quatrus-scratchpad/tree/main/plugins/dsh-telemetry-seams) |

## Ownership

Each plugin owns its source, `README.md`, `ROADMAP.md`, `LESSONS.md`, package manifest, tests, CI and versioned release. The parent owns [overall priorities](BACKLOG.md), [general lessons](LESSONS.md), and the [collection-level verification](.github/workflows/plugins.yml).

## Lifecycle status

The source for all three plugins is staged in the transfer branch. ACC and SOUP have verified package checks from the first transfer. The Telemetry Seams package check is proposed on the follow-up branch and is not automatically proof of live installation. The intended Git submodule conversion remains pending. See [Architecture](ARCHITECTURE.md) for precise boundaries.
