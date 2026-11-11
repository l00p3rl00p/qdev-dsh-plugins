# dsh-telemetry-seams

A native DeepSeek Harness plugin that **discovers and health-checks every
telemetry and information seam** in this DSH deployment.

**Why it exists:** You cannot manage what you cannot see. This plugin gives
you — and the AI agent — a single authoritative answer to "is my telemetry
actually working?" It distinguishes *configured* (someone set it up) from
*operational* (we have real evidence it is carrying data). That distinction
is the whole point.

**What it does not do:** It never creates exporters, collectors, or OTLP
channels. It is a read-only observer. Removing it does not change anything
about how data flows. That independence is intentional and permanent.

---

## Install or update directly from GitHub (native DSH)

Use **Plugins → Add plugin** in the running DSH Web UI and paste this exact Git source spec (not the GitHub `tree/main` webpage URL):

```text
github:l00p3rl00p/qdev-dsh-plugins#main&path:/plugins/dsh-telemetry-seams
```

The equivalent native CLI command, if the Web UI is unavailable, is:

```sh
dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#main&path:/plugins/dsh-telemetry-seams'
```

**Git build approval (native DSH Web):** First use **Plugins → Add plugin** with the Git spec above. If pnpm refuses the source `prepare` script, DSH's own Plugin Manager records the exact pending `allowBuilds` key and offers **Allow these scripts and retry**. Review the named source and approve **only the intended plugin**. DSH writes the approval into the active Web profile's `pnpm-workspace.yaml` and retries the install. You do **not** have to pre-edit YAML or install via a copied QClean tarball.

As an alternative when the Web approval control is unavailable, use the exact key printed by the failed installer and explicitly add it under the *existing* profile `allowBuilds:` mapping (preserve other entries). The current pnpm 12 documentation permits a repository-wide `<package-name>@git+https://github.com/l00p3rl00p/qdev-dsh-plugins.git` key even for `github:` shorthand downloaded from `codeload.github.com`, but an exact commit key is narrower and preferred for a one-time approval. An approved `prepare` script runs on your machine with the profile user's permissions. Never use `pnpm approve-builds --all`, `dangerouslyAllowAllBuilds`, or `--ignore-scripts` to bypass this check.

This repository is a **monorepo**. The `&path:/plugins/...` fragment selects the actual installable package; omitting it would install the wrong root. The package's `prepare` script builds `lib/` from source during Git installation. The source package's reviewed build-tool policy is committed with the plugin; the parent profile's Git build approval is separate. Git installs do not use the QClean tarball, and the installed Git dependency remains in the profile across restarts. Restart DSH after replacing an existing Host plugin and verify the browser and plugin capability. If the original QDev launcher controls this profile, it must not overwrite this source on startup.

---

## Quick start

After installation into an appropriate `web` profile, use it in two ways:

**Agent tool** — ask the agent to run it, or call it directly:
```
telemetry_seams_inventory
```

**Conversation tab** — open any session and click the **Telemetry Seams** tab.
Click **Run probe** to get a live health snapshot. You can also enable
**Probe automatically when tab opens**; this performs one probe per tab mount,
cancels on unmount, and never polls in the background. The preference is saved
locally in the browser.

---

## What each health state means

| State | Meaning |
|---|---|
| ✅ `operational` | Real evidence (TCP connect, file present, service mounted) confirms the seam is live |
| 🔵 `configured` | The seam is wired up, but we have no end-to-end delivery proof from inside this container |
| ⚪ `supported` | DSH ships this interface but this deployment doesn't activate it |
| 🔴 `unavailable` | Known seam that is unreachable or switched off |
| ❓ `unknown` | Not enough evidence to classify |

**Important:** `configured` is not `operational`. A service being mounted does
not prove data reached the collector. That honest gap is by design.

---

## Seams covered

| ID | Kind | What it checks |
|---|---|---|
| `collector.otlp.grpc` | transport | TCP connect to `otel-collector:4317` |
| `collector.otlp.http` | transport | TCP connect to `otel-collector:4318` |
| `collector.pipeline.logs` | logs | zpages pipeline active |
| `collector.pipeline.metrics` | metrics | zpages pipeline active |
| `collector.pipeline.traces` | traces | zpages pipeline active |
| `collector.pipeline.profiles` | profiles | zpages pipeline active |
| `dsh.otel.service` | logs | `ctx.otel` service mounted in profile |
| `dsh.productTelemetry.service` | logs | `ctx.productTelemetry` mounted (DeepSeek analytics — expected absent in private QDev) |
| `dsh.sessionTelemetry.service` | logs | `ctx.sessionTelemetry` mounted (internal DSH interface) |
| `dsh.session.persistence.jsonl` | session-persistence | JSONL session log files under `~/.dsh/sessions/` |
| `dsh.session.projection.cache` | session-projection | Projection cache files under `~/.dsh/storages/session_projcache/` |
| `qdev.env.otel-endpoint` | transport | `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable |
| `qdev.session-exporter.config` | logs | `DSH_TELEMETRY_OTLP_URL` + `DSH_TELEMETRY_MODE` env vars |

---

## Configuration

Defaults are set in `cordis.patch.yml` and match the QDev `quatrus-network`:

```yaml
collector:
  otlpGrpc: otel-collector:4317
  otlpHttp: otel-collector:4318
  health: http://otel-collector:13133/
  zpages: http://otel-collector:55679/debug/pipelinez
  probeTimeoutMillis: 4000
includeInternal: true   # show internal DSH interfaces not publicly exported
```

---

## Emergency removal — if the Web UI fails to load

```sh
docker exec -it quatrus-harness-deepseek-harness bash -lc \
  'dsh plugin --profile web remove dsh-telemetry-seams'
docker restart quatrus-harness-deepseek-harness
```

If the row persists: `dsh --profile web --dump-config` and remove only the
`dsh-telemetry-seams` insertion. Leave all other plugins, sessions, collector
wiring, and QDev volumes untouched.

---

## Development

```sh
cd plugins/dsh-telemetry-seams
pnpm install
pnpm run verify          # typecheck + 13 unit tests + build + package check
pnpm run build           # build only
node scripts/check-package.mjs   # package health check only
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [ENVIRONMENT.md](ENVIRONMENT.md),
and [RUNBOOK.md](RUNBOOK.md) for full technical detail.

See [shared plugin lessons](../../LESSONS.md) for browser loader, package
validation, and recovery requirements. For the isolated QClean install/test,
run `./qclean test-telemetry` from QDocker Compose (not from this plugin directory).
Do not install directly into the production Web profile until the clean
session/UI/probe results are verified.

## Prebuilt install payload (added 2026-11-11)

The GitHub install no longer builds on arrival. `lib/` is committed with the source and the `prepare` script was removed, because pnpm blocks Git-hosted build scripts (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`). No `allowBuilds` entry is needed. After changing `src/`, run `pnpm run build` and commit the regenerated `lib/` in the same commit. Install a specific commit with `dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/dsh-telemetry-seams'`.
