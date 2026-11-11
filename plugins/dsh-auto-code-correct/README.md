> **CANONICAL ACC SOURCE.** This is the only active ACC development and release location. Do not edit, build from, or publish the deprecated standalone ACC repository or Scratchpad copies.

<div align="center">

# dsh-auto-code-correct (ACC)

**Automatic code correction and verification for DeepSeek Harness.**

A native DeepSeek Harness Cordis plugin that reuses existing language tools and reports remaining diagnostics after edits.

[![Platform](https://img.shields.io/badge/Platform-DeepSeek%20Harness-233C40?style=flat-square)](https://github.com/deepseek-ai) [![Configuration](https://img.shields.io/badge/Configuration-Cordis%20Plugin-6853B7?style=flat-square)](cordis.patch.yml) [![Language](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](package.json) [![License](https://img.shields.io/badge/License-MIT-436477?style=flat-square)](LICENSE)

**Explore the project**

[![Getting started](https://img.shields.io/badge/Getting_Started-EAF2EF?style=for-the-badge&logo=rocket&logoColor=203D39&labelColor=EAF2EF)](#getting-started)
[![Architecture](https://img.shields.io/badge/Architecture-233C40?style=for-the-badge)](ARCHITECTURE.md)
[![Environment](https://img.shields.io/badge/Environment-233C40?style=for-the-badge)](ENVIRONMENT.md)
[![Runbook](https://img.shields.io/badge/Runbook-233C40?style=for-the-badge)](RUNBOOK.md)
[![Contributing](https://img.shields.io/badge/Contributing-233C40?style=for-the-badge)](CONTRIBUTING.md)

</div>

---

## Correct code with the tools you already have

ACC runs after supported, successful DeepSeek Harness file edits, applies configured fixers, runs read-only checks, and returns remaining diagnostics to the agent. Each completed ACC operation is also recorded in the native **AutoCorrect** conversation tab with its real name, status, timing, output, and observed fixer change. Tool discovery and language settings are managed through native DSH capabilities.

## What you need

| | Requirement | Purpose |
| --- | --- | --- |
| **Required** | DeepSeek Harness | Compatible DSH version as declared in [package.json](package.json) |
| **Developer builds only** | Node.js and pnpm | Needed when building from source, not for Web UI installation |
| **As enabled** | Language quality tools | Reuse available linters, formatters, and language servers |
| **Not required** | Separate Docker service | ACC is a native plugin, not an independent service |

**LSP integration ownership:** ACC does not install additional DSH LSP service providers or the third-party `dsh-lsp-actions` plugin. It uses an existing LSP service when available and recognizes already registered action tools; when an operator installs `dsh-lsp-actions` separately through DSH Plugins, ACC can reuse that implementation instead of mounting another tool surface. Ruff, ty, rust-analyzer, and TypeScript language executables remain user/build-provisioned external programs. Missing optional LSP integration must not block ACC's post-edit correction pipeline or readiness UI.

## Delivered components

| Component | Source | Runtime surface |
| --- | --- | --- |
| Host correction pipeline | `src/index.ts` | Native `tools/execute` / `tools/post-execute` |
| Operation contract | `src/operation-record.ts` | Durable ACC-owned `auto-code-correct/operation` session event |
| Native settings page | `src/client/index.tsx` | Plugins → Installed → ACC configuration |
| AutoCorrect results tab | `src/client/autocorrect-view.tsx` | Always-visible conversation view beside Chat and Trajectory |
| Tool manager and hygiene | `src/cli.ts`, `src/hygiene-hook.ts` | `/acc` commands and Git pre-commit hook |
| LSP integration | `src/lsp-routing.test.ts`, `src/index.ts` | Native DSH LSP services and actions |

The AutoCorrect tab is an ACC-owned results view, not a replacement for DSH Chat or Trajectory. It projects completed operations from durable ACC-owned session events; it does not alter native tool results or fabricate tool/PTC events. Native nested operation rows inside the shipped Chat/Trajectory tool tree still require a future generic DSH operation seam.

## Emergency escape — recover DSH without the browser

If installing or updating ACC makes the DSH Web interface unusable, remove **only ACC** from its installed Web profile from the Mac Terminal:

```sh
docker exec -it quatrus-harness-deepseek-harness bash -lc 'dsh plugin --profile web remove dsh-auto-code-correct'
docker restart quatrus-harness-deepseek-harness
```

If ACC still loads, inspect `dsh --profile web --dump-config` and the effective profile/home Cordis patch for a separately configured ACC insertion; disable only that insertion through the native configuration path and restart once. Do **not** delete `~/.dsh`, clear sessions, remove other plugins, or rebuild the entire Docker stack. Full operator details: [ACC Runbook](RUNBOOK.md#emergency-recovery--bad-web-plugin) and [shared plugin lessons](https://github.com/l00p3rl00p/qdev-dsh-plugins/blob/main/plugins/plugin-lessons.md).

> **Superseded 2026-11-11 (ACC 0.1.13):** the Typert readiness remote described below was removed. The client no longer mounts a remote; tool availability is reported by `/acc status`.

ACC 0.1.9 also corrects the Environment readiness panel's native Remote-service injection. It reads the mounted `remote.accReadiness` namespace through an explicitly injected child Cordis scope. The verified package must show readiness on first load and after **Refresh**, without the `without inject` error. See [Runbook](RUNBOOK.md#confirm-installed-readiness-dashboard-acc-019) for live acceptance; CI covers the injection source contract but cannot substitute for an installed browser session.

## Browser safety and recovery

**Mandatory DSH plugin lessons:** [All-plugin lessons learned](https://github.com/l00p3rl00p/qdev-dsh-plugins/blob/main/plugins/plugin-lessons.md), including the ACC-specific findings.

ACC's Web settings and AutoCorrect tab can fail before the DSH Plugins UI is accessible if the published `lib/client.js` retains a dependency the DSH browser ModuleLoader cannot resolve. The versioned GitHub Actions packager now executes `pnpm run verify`, including `scripts/check-package.mjs`, which checks the **built** browser bundle's loader registration and external `require()` calls, self-tests the scanner against the original failure, and smoke-executes the generated client factory under a guarded DSH-style loader. A green Host-side install alone never proves browser startup. Only install the tarball built from the verified source revision; after installation verify browser startup and real ACC behavior. To recover without the UI, use the explicit CLI removal procedure in the [Runbook](RUNBOOK.md#emergency-recovery--bad-web-plugin). The project source checkout is not the installed plugin copy.

## Install or update directly from GitHub (native DSH)

Use **Plugins → Add plugin** in the running DSH Web UI and paste this exact Git source spec (not the GitHub `tree/main` webpage URL):

```text
github:l00p3rl00p/qdev-dsh-plugins#main&path:/plugins/dsh-auto-code-correct
```

The equivalent native CLI command, if the Web UI is unavailable, is:

```sh
dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#main&path:/plugins/dsh-auto-code-correct'
```

> **Superseded 2026-11-11:** the build-on-install text below is historical. `prepare` was removed and the built runtime is committed with the source, so no `allowBuilds` entry or Git build approval is needed. See "Prebuilt install payload" at the end of this file.

**Git build approval (native DSH Web):** First use **Plugins → Add plugin** with the Git spec above. If pnpm refuses the source `prepare` script, DSH's own Plugin Manager records the exact pending `allowBuilds` key and offers **Allow these scripts and retry**. Review the named source and approve **only the intended plugin**. DSH writes the approval into the active Web profile's `pnpm-workspace.yaml` and retries the install. You do **not** have to pre-edit YAML or install via a copied QClean tarball.

As an alternative when the Web approval control is unavailable, use the exact key printed by the failed installer and explicitly add it under the *existing* profile `allowBuilds:` mapping (preserve other entries). The current pnpm 12 documentation permits a repository-wide `<package-name>@git+https://github.com/l00p3rl00p/qdev-dsh-plugins.git` key even for `github:` shorthand downloaded from `codeload.github.com`, but an exact commit key is narrower and preferred for a one-time approval. An approved `prepare` script runs on your machine with the profile user's permissions. Never use `pnpm approve-builds --all`, `dangerouslyAllowAllBuilds`, or `--ignore-scripts` to bypass this check.

This repository is a **monorepo**. The `&path:/plugins/...` fragment selects the actual installable package; omitting it would install the wrong root. The package's `prepare` script builds `lib/` from source during Git installation. The source package's reviewed build-tool policy is committed with the plugin; the parent profile's Git build approval is separate. Git installs do not use the QClean tarball, and the installed Git dependency remains in the profile across restarts. Restart DSH after replacing an existing Host plugin and verify the browser and plugin capability. If the original QDev launcher controls this profile, it must not overwrite this source on startup.

---

## Getting started

### Local package installation — QDev Docker

When the repository is available on the container filesystem, **GitHub authentication is not required inside the Harness container**. Build and install ACC from its local checkout:

```sh
cd /path/to/dsh-auto-code-correct
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.12.tgz
dsh --profile web --dump-config
```

Use the actual container-visible checkout path. The verified distribution is a **built local tarball**, which includes ACC's Host entry, Web settings client, CLI, and Cordis patch. Do not assume a raw directory link has the same packaging/peer behavior as a tarball; SOUP has a separately tested local-directory workflow.

**Native profile integration:** ACC does not require a separate LSP package installation to run its post-edit correction pipeline. Its LSP providers are optional: when compatible native `@deepseek-ai/dsh-lsp` / `@deepseek-ai/dsh-lsp-stdio` services exist, ACC can use them; when they are absent, LSP integration is unavailable without blocking ACC installation or its configured checkers. DSH’s built-in plugin manager owns installation; ACC adds no installer, Docker service, or profile mutation. See [ENVIRONMENT.md](ENVIRONMENT.md#native-lsp-package-dependency-chain).

After installation, restart the **DSH Web process** (or its owning Harness container), not the whole stack. Launch [DSH Web](http://localhost:3080), using its token-bearing start URL where required.

### GitHub Actions build artifact

Every push or pull request touching ACC runs the repository workflow [`dsh-auto-code-correct-package.yml`](.github/workflows/dsh-auto-code-correct-package.yml). It verifies the source, builds the Host/Web/CLI entries, packs the exact manifest version, installs that tarball into a clean official DSH profile, and uploads `dsh-auto-code-correct-plugin-<version>` as a workflow artifact. Download the artifact from the completed workflow run, then install the contained tarball with the normal DSH plugin manager; it is independently installable and can be rebuilt without editing a managed DSH installation.

### Alternative: GitHub-source installation

In **DeepSeek Harness → Plugins → Installed → Add plugin**, use:

```text
github:l00p3rl00p/dsh-auto-code-correct
```

This method requires that the Git transport used by pnpm can access the repository. If GitHub authentication inside the container is unavailable, use the local-package method rather than adding extra SSH credentials or transports just to install the plugin. Keep the **Official npm registry** for dependencies.

**Settings:** In **Plugins → Installed → dsh-auto-code-correct**, configure **Auto-Correct**, **Language Servers**, and **Code Hygiene**. These are plugin-specific panels, not **Settings → Built-in plugins**; settings belong to the active DSH profile.

### Verify behavior, not just installation

`pnpm run verify` checks source quality, tests, compilation, and the native package contract. CI also verifies packed clean-profile installation. To confirm ACC actually runs in a DSH conversation, enable Python Auto-Correct, edit a disposable `.py` file using DSH's native edit tool, and observe Ruff/ty execution and diagnostics delivered to the agent. Separately test the enabled Git hygiene pre-commit hook in a disposable repository. Detailed expected outcomes and failure diagnostics are in [RUNBOOK.md](RUNBOOK.md#two-independent-event-acceptance-tests).

Use `/acc status <capability-id>` in DSH to inspect an available tool and `/acc link <capability-id> /absolute/path/to/executable` to select an already-installed executable. Do not install a duplicate tool unnecessarily. pnpm store warnings alone do not indicate an installation failure; peer-dependency warnings require inspection in the target DSH profile.

## Plugin completion contract

ACC is the **programming/linting plugin**. Its sole active source, package, user documentation, and release checks live in **this directory of qdev-dsh-plugins**. The standalone ACC repository and Scratchpad copies are deprecated. SOUP is separately maintained at [`../qdev-soup-drift/`](../qdev-soup-drift/) and is not an ACC dependency. Both plugins run within DSH and can use whichever compatible model endpoint the Harness is configured to use, including local inference. ACC does not require a training platform, a frontier model, or a dedicated Docker service.

Before declaring ACC production-ready, reconcile code, manifest, native host entry, browser settings client, README, [architecture](ARCHITECTURE.md), [environment](ENVIRONMENT.md), and [runbook](RUNBOOK.md). The confirmed user-facing contract is: install in the intended DSH profile; appear in Plugins; open the native settings page; persist toggles; display read-only executable/project readiness; run enabled corrections on a real disposable edit; record those operations in AutoCorrect; report diagnostics back to the agent; and exercise Git hygiene separately. ACC uses an owned durable session event for its tab rather than altering `tool/result`; native nested Chat/Trajectory children and a post-execute metadata patch remain upstream platform requirements. CI and packed-package import tests prove packaging, **not** Web settings mounting or live agent behavior. Missing pieces remain explicit rather than silently treated as finished. Prefer native DSH plugin/UI seams; any new custom integration requires an audit and human approval.

## Project reference

| Question | Authoritative source |
| --- | --- |
| How does ACC work? | [Architecture](ARCHITECTURE.md) |
| Which environments and tools does it support? | [Environment](ENVIRONMENT.md) |
| How do I install, operate, and recover it? | [Runbook](RUNBOOK.md) |
| Which versions, dependencies, and commands are declared? | [Package manifest](package.json) |
| How do I contribute? | [Contributing](CONTRIBUTING.md) |
| What should a future ACC change avoid repeating? | [All-plugin lessons learned](https://github.com/l00p3rl00p/qdev-dsh-plugins/blob/main/plugins/plugin-lessons.md) |
| What is the original project and license? | [Attribution](ATTRIBUTION.md) · [MIT license](LICENSE) |

## License and attribution

MIT; original attribution to [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite) is preserved. See [LICENSE](LICENSE) and the upstream project for original copyright and license terms.

<div align="center"><sub>ACC · Native DeepSeek Harness code correction and verification</sub></div>

2026-11-11 — ACC removed its obsolete Typert readiness remote because it gated native options and conversation UI registration; `/acc status` remains the native tool-availability interface. Clean-container acceptance is pending.

## Prebuilt install payload (added 2026-11-11)

The GitHub install no longer builds on arrival. `lib/` is committed with the source and ACC has no `prepare` script, because pnpm blocks Git-hosted build scripts (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`). No `allowBuilds` entry is needed. After changing `src/`, run `pnpm run build` and commit the regenerated `lib/` in the same commit. Install a specific commit with `dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/dsh-auto-code-correct'`.

ACC 0.1.13 removed the Environment readiness card and its Typert remote; use `/acc status <capability-id>` for tool availability.
