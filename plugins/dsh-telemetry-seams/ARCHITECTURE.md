# Architecture — dsh-telemetry-seams

## Mission

The plugin answers one question: **"Is my telemetry infrastructure actually
working, or just configured?"** It does this by running real probes against
live endpoints and services, then classifying each seam with evidence.

It is a **read-only observer**. It never creates exporters, collectors, OTLP
channels, or persistent state. Installing or removing it cannot affect data
flow.

---

## Layer map

```
┌─────────────────────────────────────────────────────────────┐
│  Agent (model-facing)                                        │
│  telemetry_seams_inventory tool  ──→  buildInventory()       │
│                                       (probe layer)          │
├─────────────────────────────────────────────────────────────┤
│  Browser (conversation.view tab)                             │
│  SeamsView  ──→  fetch /api/tools/invoke  ──→  tool above    │
├─────────────────────────────────────────────────────────────┤
│  Probe layer  (src/seams/probe.ts)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ TCP probes   │  │ HTTP probes  │  │ FS sweeps        │   │
│  │ (OTLP ports) │  │ (health,     │  │ (session JSONL,  │   │
│  │              │  │  zpages)     │  │  projcache)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │ ctx.reflect  │  │ process.env  │                          │
│  │ service check│  │ env vars     │                          │
│  └──────────────┘  └──────────────┘                          │
├─────────────────────────────────────────────────────────────┤
│  Seam model  (src/seams/types.ts)                            │
│  SeamRecord, SeamInventory, SeamEvidence, healthFromEvidence │
└─────────────────────────────────────────────────────────────┘
```

---

## Source files

| File | Purpose |
|---|---|
| `src/index.ts` | Host plugin entry — registers `telemetry_seams_inventory` tool via `defineTool` |
| `src/seams/types.ts` | Vocabulary: `SeamRecord`, `SeamInventory`, `SeamState`, `healthFromEvidence` |
| `src/seams/probe.ts` | All probes: TCP, HTTP, file sweep, service check, env read |
| `src/client/index.tsx` | Client entry — registers `conversation.view` tab via `ctx.slots.inject` |
| `src/client/seams-view.tsx` | React component — renders the inventory table with expand/collapse evidence |

---

## Key design decisions

### 1. `ctx.reflect.get()` instead of direct `ctx.otel` access

Cordis blocks property access on services not declared in the plugin's `inject`
array. Direct access to `ctx.otel` would throw `cannot get property "otel"
without inject`. Using `ctx.reflect.get('otel')` reads the service registry
directly without the inject guard — this is the correct read-only inspection
path and keeps the plugin fully independent.

### 2. `healthFromEvidence` is the only source of truth

`SeamRecord.health` is always derived from `SeamRecord.evidence` by
`healthFromEvidence()`. It is never set directly. Empty evidence → `unknown`.
All-ok evidence → `operational`. Mixed → `configured`. All-fail → `unavailable`.
This prevents any "assume healthy" drift.

### 3. `defineTool` from `@deepseek-ai/dsh-tools`

The tool uses the native DSH SDK (`defineTool`) rather than raw
`ctx.tools.register`. This gives typed parameter validation, correct output
contract (`{ schema: { type: 'string' }, render }`) and proper model-facing
presentation.

### 4. Client uses `fetch /api/tools/invoke`

The browser tab calls the host tool via the standard agent API endpoint rather
than a custom Typert Remote namespace. This avoids the Remote fiber lifecycle
complexity that caused the ACC readiness dashboard issue (lessons §3).

### 5. No Schemastery on the Host

The initial scaffold used `@deepseek-ai/schemastery` for the Config type. That
was removed in favour of a plain TypeScript interface for `TelemetrySeamsConfig`
with defaults in `cordis.patch.yml`. Schemastery is only needed if the plugin
registers a validated Config schema; this plugin's config is static and
operator-managed.

---

## Data flow — one probe cycle

```
tool call
  └─→ buildInventory(ctx, config, env)
        ├─→ fetchText(health endpoint)   → collectorEvidence
        ├─→ fetchText(zpages)            → parsePipelines() → pipelineEvidence
        ├─→ probeTcp(otlpGrpc)           → tcp evidence
        ├─→ probeTcp(otlpHttp)           → tcp evidence
        ├─→ ctx.reflect.get('otel')      → service evidence
        ├─→ ctx.reflect.get('productTelemetry')
        ├─→ ctx.reflect.get('sessionTelemetry')
        ├─→ countFiles(sessionRoot)      → session persistence evidence
        ├─→ countFiles(projcacheRoot)    → projection cache evidence
        ├─→ process.env checks           → env evidence
        └─→ SeamInventory { seams[], collector, gaps[] }
              └─→ formatted text + embedded JSON block
```

---

## Independence contract

The plugin satisfies the plan's independence requirement:

| Check | How |
|---|---|
| Install | Adds one Cordis entry; no transport change |
| Remove | `dsh plugin remove dsh-telemetry-seams` removes the entry; native wiring unchanged |
| Upgrade | Directory link; rebuild lib/ and reload DSH |
| Container restart | Plugin re-activates from profile; no persistent side effects |
| Fresh QDev build | cordis.patch.yml re-applies the entry; probes run on demand |

---

## Known gaps (recorded, not defects)

1. **Pipeline receiver/exporter component names are empty** — The collector's
   zpages HTML format in this deployment does not include the component anchor
   links that `parsePipelines` extracts names from. Pipeline existence is
   confirmed; component topology is not.

2. **Session JSONL absent** — `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` disables
   local session persistence by design. The seam is correctly reported as
   `unavailable`.

3. **DSH service delivery unverified** — Mounting `ctx.otel` or
   `ctx.sessionTelemetry` proves the service is wired, not that records
   reached the collector. Proving delivery requires querying ClickHouse or
   OpenSearch, which is outside this container's reach.
