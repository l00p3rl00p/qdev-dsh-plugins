# Runbook — dsh-telemetry-seams

## the clean test Harness isolation and acceptance (no GitHub Actions)

Deployment-specific; kept in private operations notes.

## Normal operation

Installation is profile-specific; do not assume this plugin is already installed.
For isolated proof, use the **clean test Harness** path below. The normal QDev Web profile
must remain unchanged until clean-host and browser checks pass.

**Agent tool:** call `telemetry_seams_inventory` in any session.

**Browser tab:** open any conversation, click **Telemetry Seams**, click
**Run probe**. The button calls `InventoryService.probe()` via Typert Remote
(`ctx.remote.telemetrySeamsInventory`) — no agent turn required.

---

## Emergency removal

If this plugin causes the DSH Web UI to fail or become unresponsive, remove it
from the Mac terminal **without touching any other plugin, session, or volume**:

```sh
docker exec -it <harness-container> bash -lc \
  'dsh plugin --profile web remove dsh-telemetry-seams'
docker restart <harness-container>
```

Verify removal:

```sh
docker exec -it <harness-container> bash -lc \
  'dsh plugin --profile web list'
```

The entry `dsh-telemetry-seams` must not appear. If it does, inspect the
profile config:

```sh
docker exec -it <harness-container> bash -lc \
  'dsh --profile web --dump-config'
```

Remove only the `telemetry-seams` insertion from the active Cordis patch.
Never delete `~/.dsh`, other profiles, or QDev persistent volumes.

---

## Rebuilding after source changes

Only if a deployment intentionally installed the plugin as a directory link
is rebuilding `lib/` sufficient. A packaged installation needs a verified
new tarball and native profile replacement:

```sh
cd plugins/dsh-telemetry-seams
pnpm run build
```

Then restart DSH to reload the Host module (Node.js caches the old module
until process restart):

```sh
docker restart <harness-container>
```

The client bundle (`lib/client.js`) reloads via HMR if `pnpm run dev:web` is
running. Otherwise a browser page refresh is sufficient after rebuild.

---

## Upgrading

```sh
cd plugins/dsh-telemetry-seams
# edit source, bump version in package.json
pnpm run verify           # typecheck + tests + build + package check
git commit -m "..."
# DSH loads new code on next restart
docker restart <harness-container>
```

---

## Known limitations (v0.1.1)

| Item | Detail | Planned fix |
|---|---|---|
| Session JSONL absent | `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` disables local persistence by design. Correctly reported as `unavailable`. | Not a bug |
| Service delivery unverified | Mounting `ctx.otel` / `ctx.sessionTelemetry` proves wiring, not delivery. Proving delivery requires querying ClickHouse/OpenSearch. | v0.2.0: add warehouse query seam |
| Profile shows "unknown" | `DSH_PROFILE` is not available in this process context. The profile identifies the active composition, services, configuration, and plugin activation state; leaving it unknown weakens evidence provenance and complicates incident/support/release diagnosis, even though seam health calculations remain correct. | v0.2.0: read the active profile from a DSH-owned API or config service |
| Auto-probe is opt-in | The tab does not probe on open unless the user checks **Probe automatically when tab opens**. When enabled, it runs once per mount and never polls in the background. | No change planned |

---

## Probe timeout

Default `probeTimeoutMillis: 4000`. If the collector is slow to respond,
increase it in `cordis.patch.yml`:

```yaml
- insert:
    - id: telemetry-seams
      name: dsh-telemetry-seams
      config:
        collector:
          probeTimeoutMillis: 8000
```

---

## Tests

```sh
cd plugins/dsh-telemetry-seams
pnpm test
```

13 unit tests covering `healthFromEvidence`, `splitHostPort`, `parsePipelines`.
All probe logic is pure and runs without network access.

---

## Diagnostic: check plugin is mounted

```sh
docker exec -it <harness-container> bash -lc \
  'dsh --profile web --dump-config | grep -A5 telemetry-seams'
```

Expected output includes `name: dsh-telemetry-seams` and `id: telemetry-seams`.
