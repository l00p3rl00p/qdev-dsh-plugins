<div align="center">

# QDev DSH Plugins

**One catalog. Independent plugins. Verifiable releases.**

The catalog, backlog, and shared lessons for independently developed Quatrus plugins.

[![Platform](https://img.shields.io/badge/Platform-DeepSeek_Harness-FF1744?style=flat-square)](https://github.com/deepseek-ai) [![Configuration](https://img.shields.io/badge/Configuration-Native_Plugins-8B5CF6?style=flat-square)](.github/workflows/plugins.yml) [![Technology](https://img.shields.io/badge/Technology-TypeScript-00D6C2?style=flat-square&logo=typescript&logoColor=white)](plugins/dsh-auto-code-correct/package.json)

**Explore the project**

[![Getting started](https://img.shields.io/badge/Getting_Started-EAF2EF?style=for-the-badge&labelColor=EAF2EF)](#getting-started)
[![Architecture](https://img.shields.io/badge/Architecture-233C40?style=for-the-badge)](ARCHITECTURE.md)
[![Environment](https://img.shields.io/badge/Environment-233C40?style=for-the-badge)](ENVIRONMENT.md)
[![Runbook](https://img.shields.io/badge/Runbook-233C40?style=for-the-badge)](RUNBOOK.md)
[![Components](https://img.shields.io/badge/Components-233C40?style=for-the-badge)](COMPONENTS.md)
[![Roadmap](https://img.shields.io/badge/Roadmap-233C40?style=for-the-badge)](ROADMAP.md)
[![Backlog](https://img.shields.io/badge/Backlog-233C40?style=for-the-badge)](BACKLOG.md)
[![Lessons](https://img.shields.io/badge/Lessons-233C40?style=for-the-badge)](LESSONS.md)
[![Contributing](https://img.shields.io/badge/Contributing-233C40?style=for-the-badge)](CONTRIBUTING.md)
[![Attribution](https://img.shields.io/badge/Attribution-233C40?style=for-the-badge)](ATTRIBUTION.md)

</div>

---

## One plugin at a time

This repository coordinates independently developed DeepSeek Harness plugins. The parent owns the shared backlog, cross-plugin verification, and general lessons. Every plugin owns its own source, releases, tests, roadmap, and lessons.

A plugin's source can change and ship without requiring changes to the other plugins. The parent records which verified revision belongs in the collection.

## Plugin catalog

| Plugin | Package | Version | Scope |
| --- | --- | --- | --- |
| **[Auto Code Correct (ACC)](plugins/dsh-auto-code-correct)** | `dsh-auto-code-correct` | 0.1.12 | Language tooling, bounded correction, readiness, and operation evidence |
| **[SOUP Drift + Gentle Mentor](plugins/qdev-soup-drift)** | `qdev-trajectory-drift-soup` | 0.5.3 | Live trajectory drift detection and in-session intervention |
| **[Telemetry Seams](plugins/dsh-telemetry-seams)** | `dsh-telemetry-seams` | 0.1.2 | Read-only inventory and health probes of native telemetry interfaces |

Each plugin's README is the operator entry point. Its `ROADMAP.md` lists upcoming features; `LESSONS.md` keeps its implementation-specific discoveries.

## What you need

| | Dependency | Purpose |
| --- | --- | --- |
| **Required for plugin execution** | Compatible DeepSeek Harness | Native Host and Web plugin runtime |
| **Required for building from source** | Node.js 24 and pnpm | Builds, checks, and packages the transferred plugins |
| **SOUP only** | Python with official `soup_cli` | Runs SOUP drift analysis through its worker |
| **Optional for repository browsing** | Git with submodule support | Needed once independent plugin repositories are mounted as actual submodules |

## Getting started

The current transfer branch contains **staged source copies**, not active Git submodules yet. Build and verify a staged plugin independently:

```sh
cd plugins/dsh-auto-code-correct
pnpm install
pnpm run verify
```

For SOUP, first make the official `soup_cli` Python package available and set `SOUP_PYTHON` to that interpreter as described in its [operator guide](plugins/qdev-soup-drift/README.md). Telemetry Seams has its own [build and probe instructions](plugins/dsh-telemetry-seams/README.md).

These checks do not install into the running QDev Harness. Packaging checks and live session behavior are distinct release gates.

## Repository structure

```text
qdev-dsh-plugins/
├── README.md                 # Project landing page
├── BACKLOG.md                # Overall priorities
├── LESSONS.md                # General DSH/plugin lessons
├── ARCHITECTURE.md           # Repository boundaries
├── ENVIRONMENT.md            # Runtime/build requirements
├── RUNBOOK.md                # Package and recovery operations
├── COMPONENTS.md             # Plugin inventory
├── ROADMAP.md                # Upcoming features only
├── CONTRIBUTING.md           # Contribution contract
├── ATTRIBUTION.md            # Credits and provenance
├── .github/workflows/       # Collection-level checks
└── plugins/                 # Independent plugin repositories (target: git submodules)
    ├── dsh-auto-code-correct/
    │   ├── README.md
    │   ├── ROADMAP.md
    │   └── LESSONS.md
    ├── qdev-soup-drift/
    │   ├── README.md
    │   ├── ROADMAP.md
    │   └── LESSONS.md
    └── dsh-telemetry-seams/
        ├── README.md
        ├── ROADMAP.md
        └── LESSONS.md
```

**Current ownership:** This repository is the **only active development, build, and release source** for ACC, SOUP, and Telemetry Seams. ACC lives at [`plugins/dsh-auto-code-correct/`](plugins/dsh-auto-code-correct/). The former standalone `l00p3rl00p/dsh-auto-code-correct` repository and Scratchpad plugin copies are **deprecated archives**. Plugin directories are ordinary Git-tracked directories in this repo, not functioning Git submodules; do not install from or push fixes to the deprecated repos.

## Lessons and release discipline

- **[General lessons](LESSONS.md):** reusable DSH configuration, loader/slot activation, UI action proof, packaging and recovery contracts.
- **Plugin-specific lessons:** exact integration discoveries and repeatable configuration recipes, including ACC's formatter/linter coexistence rules.
- **[Overall backlog](BACKLOG.md):** shared priorities and dependencies. Implementation tasks stay in the backlog; roadmaps list only upcoming features.
- **[GitHub Actions — proven three-plugin pipeline](.github/workflows/plugins.yml):** builds, tests, validates browser-loader contracts, installs verified archives into clean profiles, and publishes checksums plus source commits.
- **[Reusable strict plugin workflow](.github/workflows/strict-plugin-package.yml):** an input-driven packaging gate copied from [QDev Generic Plugins](https://github.com/l00p3rl00p/qdev-generic-plugins), for a compatible native DSH Web package. It requires a real plugin path, package name and DSH version; no dummy package runs automatically.
- **Live runtime acceptance:** check actual Web mounting, controls and persistent behavior separately from clean-profile package verification.

No source transfer automatically updates an installed plugin or authorizes removing the original repositories.

## Project reference

| Question | Source |
| --- | --- |
| What plugins are in scope? | [Plugin catalog](#plugin-catalog) |
| How are they organized? | [Repository structure](#repository-structure) |
| What is next across all plugins? | [Overall backlog](BACKLOG.md) |
| What rules apply everywhere? | [General lessons](LESSONS.md) |
| What is specific to ACC? | [ACC roadmap](plugins/dsh-auto-code-correct/ROADMAP.md) · [ACC lessons](plugins/dsh-auto-code-correct/LESSONS.md) |
| What is specific to SOUP? | [SOUP roadmap](plugins/qdev-soup-drift/ROADMAP.md) · [SOUP lessons](plugins/qdev-soup-drift/LESSONS.md) |
| What is specific to Telemetry Seams? | [Telemetry roadmap](plugins/dsh-telemetry-seams/ROADMAP.md) · [Telemetry lessons](plugins/dsh-telemetry-seams/LESSONS.md) |
| How is packaging verified? | [Proven package pipeline](.github/workflows/plugins.yml) · [Reusable strict workflow](.github/workflows/strict-plugin-package.yml) · [Runbook](RUNBOOK.md) |
| What documentation applies? | [Architecture](ARCHITECTURE.md) · [Environment](ENVIRONMENT.md) · [Components](COMPONENTS.md) |
| How do I contribute and who contributed? | [Contributing](CONTRIBUTING.md) · [Attribution](ATTRIBUTION.md) |

<div align="center"><sub>Quatrus: Trust Intelligence · Govern Intelligently · Preserve Intent<br>Created by <a href="https://github.com/l00p3rl00p">l00p3rl00p</a></sub></div>
