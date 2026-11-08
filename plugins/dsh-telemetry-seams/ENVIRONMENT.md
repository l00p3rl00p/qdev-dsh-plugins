# Environment — dsh-telemetry-seams

## QDev deployment context

This plugin is built for and verified against the QDev environment defined in
`l00p3rl00p/qdocker-compose`. It runs inside the DSH container on
`quatrus-network` alongside the OTEL Collector.

## Network topology

```
┌─────────────────────────┐        quatrus-network
│  DSH container          │   ─────────────────────────────────
│  (deepseek-harness)     │         │
│                         │   otel-collector:4317  (OTLP gRPC)
│  OTEL_EXPORTER_OTLP_    │   otel-collector:4318  (OTLP HTTP)
│  ENDPOINT=              │   otel-collector:13133 (health)
│  http://otel-collector  │   otel-collector:55679 (zpages)
│  :4317                  │
│                         │
│  DSH_TELEMETRY_OTLP_URL=│
│  http://otel-collector  │
│  :4318/v1/logs          │
│                         │
│  DSH_TELEMETRY_MODE=    │
│  FEEDBACK_ONLY          │
└─────────────────────────┘

Collector pipelines → OpenSearch, ClickHouse (logs)
                    → Prometheus, ClickHouse (metrics)
                    → Jaeger, ClickHouse (traces)
```

## Environment variables

| Variable | Value in QDev | Role |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4317` | Standard OTel SDK exporter endpoint |
| `DSH_TELEMETRY_OTLP_URL` | `http://otel-collector:4318/v1/logs` | DSH first-party session exporter |
| `DSH_TELEMETRY_MODE` | `FEEDBACK_ONLY` | Disables local JSONL session persistence; exports only |
| `DSH_PROFILE` | `web` | Active DSH profile name |
| `DSH_HOME` | `~/.dsh` | DSH home directory |

## DSH version

**Verified:** DSH 0.2.1-rc.5

Plugin engine constraint: `"dsh": ">=0.2.1-0 <0.3.0"`

## Collector version and health

The OTEL Collector health endpoint at `http://otel-collector:13133/` returns:

```json
{
  "status": "Server available",
  "upSince": "2026-11-05T09:39:11Z",
  "uptime": "17h14m3s"
}
```

Zpages pipeline topology: `http://otel-collector:55679/debug/pipelinez`
Confirmed pipelines: `logs`, `metrics`, `traces`, `profiles`

## DSH services mounted in `web` profile

| Service key | Mounted | Notes |
|---|---|---|
| `ctx.otel` | ✅ yes | Shared OTel SDK service |
| `ctx.sessionTelemetry` | ✅ yes | Internal session-event capture backend |
| `ctx.productTelemetry` | ❌ no | DeepSeek analytics — intentionally absent in private QDev |

## Session persistence

`DSH_TELEMETRY_MODE=FEEDBACK_ONLY` means DSH does **not** write canonical
session logs to `~/.dsh/sessions/` as JSONL files. Sessions are captured by
the session-telemetry service and exported to the collector, but are not
persisted locally. This is correct and expected for this deployment.

The session projection cache at `~/.dsh/storages/session_projcache/sessions/`
**is** present and operational (43+ files), confirming session state is
maintained in memory and cache form.

## Plugin install path

```
/home/qdev/.dsh/profiles/web/node_modules/dsh-telemetry-seams
  → symlink to /home/qdev/scratchpad/plugins/dsh-telemetry-seams
```

Installed as a directory link. Rebuilding `lib/` and reloading DSH picks up
changes without reinstalling.
