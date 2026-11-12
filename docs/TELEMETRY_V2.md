# Telemetry V2 — Build and Installation Specification

> **Current dependency boundary (November 2026).** This is the complete V2 specification, updated to reuse the independently published [OTel Neuron Connector](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector). It is a **standalone reusable connector package**, not a DeepSeek Harness library or native plugin. Its current package name is `otel-neuron-connector`, and it exposes `createTelemetry()`, `createMemoryEmitter()`, and `telemetry.emit(...)`. It is an initial seam, **not** evidence that every capability specified below is implemented or that Collector → ClickHouse delivery has been verified. General Neuron Connector theory can encompass other connections and transports.

## Install and build using the published library

1. **Inspect before implementing.** Read the published [library package](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/package.json), [source](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/src/index.ts), [tests](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector/test), and [agent/publication policy](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/AGENTS.md). Inventory real existing native telemetry seams and preserve working connections.
2. **Install and verify the connector independently**, without installing or building the DSH plugin:

   ```bash
   git clone https://github.com/l00p3rl00p/library.git
   cd library/typescript/otel-neuron-connector
   npm install --no-audit --no-fund --ignore-scripts
   npm test
   python3 test/marimo_equivalent.py
   npm pack --dry-run
   ```

   For a reproducible consumer build, select and lock a **tested commit/package artifact**, recording the resolved version and checksum. The source package is currently `0.1.0`; do not assume an npm-registry release or an immutable tag exists.

3. **Build the DSH plugin separately** under the plugin's own repository/catalog. Use the official DeepSeek plugin creator and native Cordis contracts. Import the tested standalone connector as a dependency. The DSH adapter supplies the existing native reporter (for example `ctx.otel.createEventReporter(options)` with `reporter.emit(record)`), handles DSH lifecycle and configuration, registers a native service, and provides Settings, observation UI, and manually triggered Ping/Refresh. **Do not copy the library's implementation into the plugin** or create another Collector/exporter.
4. **Verify the real route** with one unique emission: producer → connector → existing native emitter → Collector → ClickHouse. Distinguish local emission, transport acceptance, and durable receipt. Expand inputs, then outputs, only after that path works.

### Ownership

| Component | Owner and responsibility |
|---|---|
| Standalone Neuron Connector | [`l00p3rl00p/library/typescript/otel-neuron-connector`](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector): reusable package, API, tests, independent versioning; no DSH-specific dependencies |
| DSH integration/plugin | `qdev-dsh-plugins`: native reporter adapter, Cordis service, Settings, observation UI, lifecycle, pinned tested package dependency |
| Existing OTel pipeline | Native emitter/SDK, Collector, ClickHouse and optional destinations: existing infrastructure, not rebuilt by either component |

**The remaining sections are the complete V2 requirements and acceptance contract, not a claim of completed implementation.** When older wording says “DSH Telemetry Library,” interpret it as the independent reusable connector/library capability described here, never as license to add DSH dependencies to the standalone package.

---

# V2 Requirements — Original Unified Specification

## Mission

Reuse and extend the **independent Neuron Connector and reusable telemetry library capabilities**, then build a native **DeepSeek Harness Telemetry Plugin** as a separate consumer.

The purpose is simple:

**Any producer → One emission interface → Existing telemetry infrastructure → Verifiable observation.**

Eliminate the repeated configuration, initialization, and emission calls currently required when DeepSeek plugins use native telemetry.

Make telemetry easy to use, easy to configure, and observable.

**We are building a reusable telemetry seam, not another telemetry platform.**

The system must support the existing QDev stack and allow its capabilities to expand independently of the DeepSeek plugin.

---

# 1. Non-Negotiable Architecture

There are two separate products.

## Product A — Standalone Neuron Connector and Telemetry Library Capabilities

A standalone, independently versioned TypeScript library.

It owns:

- Common observation interfaces.
- Producer and observation definitions.
- Simple emission APIs.
- Native emitter and transport adapters.
- Configuration parsing and validation.
- Capability discovery.
- Destination compatibility metadata.
- Structured diagnostic results.
- On-demand probing interfaces.
- Reuse of existing telemetry SDKs and services.

It does not own:

- DeepSeek plugin registration.
- Cordis service registration.
- A DSH Settings page.
- A graphical interface.
- Collector processing pipelines.
- Durable telemetry storage.
- An independently implemented OTLP protocol.

The library functions without DeepSeek Harness.

## Product B — DSH Telemetry Plugin (Consumer)

A native DeepSeek Harness plugin that uses a tested release of the library.

It owns:

- Native DSH plugin registration.
- Cordis service registration.
- Dependency injection.
- Native configuration persistence.
- DSH lifecycle management.
- Settings page.
- Observation inspection UI.
- Ping and Refresh controls.
- Native operational status.
- Integration of selected library capabilities.

The plugin is an extension of the library.

**The plugin imports the library. It does not copy or reimplement it.**

Library and plugin releases are independent.

---

# 2. Mandatory V2 Engineering Rule

**REUSE, IMPROVE, OR EXTEND PROVEN VERSION 1 SEAMS.**

Do not create replacement or parallel seams when existing working implementations satisfy the requirement.

Before implementing anything, inspect the actual source and identify:

1. What already works.
2. Where the actual emission interface exists.
3. How it is initialized.
4. How it is configured.
5. How data enters it.
6. How it reaches the existing Collector.
7. How delivery can be verified.
8. Which existing mechanisms can be reused.

Use the following decisions:

| Decision | Meaning |
|---|---|
| REUSE | Existing implementation satisfies the requirement |
| IMPROVE | Existing mechanism needs a compatible correction |
| EXTEND | Existing seam supports additional functionality |
| CREATE | No suitable seam exists, established through source inspection |

New capabilities must build on the existing working path.

The successful SOUP integration is established implementation evidence. Preserve its demonstrated input, execution, and intervention seams.

Changing an observation payload does not invalidate an already proven delivery mechanism.

---

# 3. Authoritative Source Inspection

Inspect these repositories and their relevant history, code, documentation, tests, and configuration:

### QDev sources

- https://github.com/l00p3rl00p/qdev-dsh-plugins
- https://github.com/l00p3rl00p/qdocker-compose
- https://github.com/l00p3rl00p/quatrus-scratchpad

Inspect the existing `dsh-telemetry-seams` plugin, SOUP integration, current Collector configuration, and ClickHouse evidence path.

### DeepSeek Harness

- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/telemetry/otel

Specifically inspect:

- `@deepseek-ai/dsh-otel`
- `ctx.otel`
- `createEventReporter(options)`
- `EventLogReporter.emit(record)`
- Reporter configuration and shutdown
- Native Cordis service registration
- Plugin Settings and persistence contracts

### OpenTelemetry

- https://opentelemetry.io/docs/
- https://opentelemetry.io/docs/specs/otlp/
- https://opentelemetry.io/docs/collector/components/
- https://opentelemetry.io/docs/specs/semconv/gen-ai/
- https://github.com/open-telemetry/opentelemetry-js

Prefer official APIs, supported packages, and the actual versions present in QDev.

Create a short V1-to-V2 seam inventory before modifying code.

Do not modify upstream DeepSeek Harness.

---

# 4. Scope Boundary — Do Not Recreate the Collector

The existing architecture is:

```text
Telemetry Producers
       |
       v
Standalone Neuron Connector
       |
       v
Existing Native Emitter / SDK
       |
       v
OpenTelemetry Collector
       |
       v
ClickHouse
       |
       v
Evidence Consumers
```

The library is a convenient interface to existing emission capabilities.

The Collector remains responsible for:

- Receiving telemetry.
- Processing records.
- Filtering and transforming supported signals.
- Routing telemetry.
- Exporting to configured destinations.
- Managing Collector pipelines.

ClickHouse remains the primary durable evidence store in QDev.

The library must not recreate:

- An OpenTelemetry Collector.
- An OTLP protocol implementation.
- A second telemetry routing engine.
- A database or warehouse.
- Existing SDK batching and export functionality.
- Existing DeepSeek telemetry capabilities.

Prefer configuration and established libraries over custom infrastructure.

## Critical path

**Producer → Native emitter → OTel Collector → ClickHouse**

A failure in the Collector or ClickHouse is a critical evidence-delivery failure.

Grafana, Jaeger, Prometheus, OpenSearch, Pyroscope, and other optional consumers can have independent health states.

Failure of an optional consumer does not automatically imply loss of the canonical evidence stream.

Delivery, acceptance, and durable receipt must be reported distinctly.

---

# 5. Product A — Library Specification

## 5.1 Public API

Provide one convenient emission operation, conceptually:

```ts
telemetry.emit(event)
```

Internally, the library must reuse an existing native emitter or SDK through an adapter.

In DSH, the plugin supplies the native integration using supported interfaces such as:

```ts
ctx.otel.createEventReporter(options)
reporter.emit(record)
```

The library handles the repetitive setup and common observation interface.

Consumers should not individually recreate reporter initialization, option mapping, and shutdown logic.

Keep the public API minimal and typed.

Additional methods may support:

- Producer registration.
- Capability discovery.
- Configuration inspection.
- Route inspection.
- Manual diagnostics.
- Flush and shutdown.

Implement only operations with a demonstrated use case.

## 5.2 Observation families

The library must be able to represent the following categories.

| Category | Information |
|---|---|
| Logs | Severity, message, source, timestamp |
| Events | Name, attributes, timestamp, source |
| Metrics | Counter, gauge, histogram, value, unit |
| Timing | Start, end, duration, operation |
| Traces | Trace ID, span ID, parent, operation |
| Profiles | Stack/sample profiling data |
| Memory | Memory ID, lifecycle, reference, scope |
| Graph | Nodes, edges, relationships, properties |
| State | Entity, current state, transition |
| Health | Component, status, evidence |
| Drift | Measurement, threshold, decision |
| Intervention | Trigger, action, result, correlation |

Support custom observation types without changing the common emitter interface.

No arbitrary limit on the number of producers or observation families.

Use suitable established protocols and SDKs for each signal. A custom observation can be represented as a structured event without pretending it is a standard OTel metric or profile.

## 5.3 Common observation structure

Provide a versioned observation envelope containing:

```json
{
  "observation_id": "unique-id",
  "schema_version": "1",
  "producer": "soup",
  "type": "drift",
  "name": "trajectory.drift",
  "timestamp": "ISO-8601 timestamp",
  "attributes": {
    "measurement": 0.34,
    "threshold": 0.2
  }
}
```

This is an illustrative common event, not a replacement for the official OTLP wire schema.

Support correlation IDs, session IDs, trace IDs, and structured payload references when applicable.

Use OpenTelemetry semantic conventions where relevant.

Keep sensitive payload collection explicit and configurable.

## 5.4 Representation and serialization

The library must support appropriate existing mechanisms for:

| Representation | Purpose |
|---|---|
| JavaScript/TypeScript objects | Native in-process observations |
| JSON | Structured observations and exchange |
| JSONL / NDJSON | Event streams and files |
| OTLP Protobuf | Standard OTel transmission |
| OTLP JSON | Standard OTel HTTP representation |
| CSV | Tabular interchange |
| Parquet | Analytical and graph-data interchange |
| Arrow | Columnar in-memory exchange |
| YAML | Configuration |

These are capability requirements, not instructions to write new serializers.

Reuse established packages and SDKs.

The library must be capable of representing memory data as JSON, passing structured data in memory, and using an applicable telemetry or file transport where configured.

An observation's meaning must remain separate from its serialization and transport.

## 5.5 Supported connection mechanisms

Inspect and reuse supported implementations for:

| Connection type | Typical use |
|---|---|
| In-process interface | Local library calls |
| OTLP/HTTP | Standard OTel export |
| OTLP/gRPC | Standard OTel export |
| HTTP REST | Supported ingestion endpoints |
| File-based interchange | JSONL, JSON, Parquet, CSV |
| Database client | Explicit supported database operations |
| Native SDK | Existing application telemetry |
| Stream/subscription | Live observation producers |

Not every destination accepts every mechanism.

The library must expose actual supported combinations through capability metadata.

Do not implement a new sender when the target SDK, native service, or Collector already provides the required connection.

## 5.6 Configuration

Start with the smallest working configuration.

Example:

```yaml
telemetry:
  enabled: true
  endpoint: http://otel-collector:4318/v1/logs
  serviceName: qdev
  transport: otlp-http
```

The library reads and validates configuration.

Translate configuration into the real options expected by the selected native emitter.

The library must not hardcode Docker service addresses.

The QDev default is supplied by deployment configuration.

Support configuration files and programmatic configuration without requiring a Settings UI.

## 5.7 Capability discovery

Provide versioned metadata describing what the installed library actually supports.

For each capability, expose:

- Identifier.
- Observation families.
- Accepted representations.
- Available transports.
- Required configuration.
- Diagnostic operations.
- Compatibility status.

A new library release may add capabilities without changing any existing DSH plugin.

For example:

```text
Library V1:  8 capabilities
Library V2: 12 capabilities
Library V3: 20 capabilities
```

A plugin integrated with eight capabilities continues to expose those eight until it adopts and tests additional functionality.

The library is free to advance independently.

---

# 6. Required QDev Compatibility

The minimum compatibility target is the actual QDev stack.

Inspect the current repository and distinguish deployed components from optional, inactive, or planned components.

| Component | Relevant data | Integration responsibility |
|---|---|---|
| OTel Collector | Logs, metrics, traces, profiles | Reuse supported receivers |
| ClickHouse | Durable structured evidence | Existing Collector export and SQL verification |
| OpenSearch | Logs and searchable events | Existing Collector exporter |
| Prometheus | Time-series metrics | Existing metrics pipeline |
| Jaeger | Spans and traces | Existing trace pipeline |
| Pyroscope | Profiles and samples | Existing profiling pipeline |
| Grafana | Queried telemetry and alerts | Existing data-source interfaces |
| Grafana Alloy | Collection and profiling | Existing telemetry interfaces |
| SOUP | Drift and intervention events | Producer using the library |
| ACC | Correction and operational events | Producer using the library |
| Mem0 | Memory lifecycle data | Structured producer and supported SDK/API |
| Marimo Studio | Experiments and analysis | Test and validation environment |
| DuckDB | Analytical records | Supported file/SQL interchange |
| LadybugDB | Graph records and relationships | Supported graph/file interfaces |
| Bloop | Lifecycle and operational events | Optional producer integration |

### Official references

- Collector: https://opentelemetry.io/docs/collector/
- ClickHouse: https://clickhouse.com/docs/en/observability
- OpenSearch: https://docs.opensearch.org/
- Prometheus: https://prometheus.io/docs/guides/opentelemetry/
- Jaeger: https://www.jaegertracing.io/docs/
- Pyroscope: https://grafana.com/docs/pyroscope/latest/
- Grafana: https://grafana.com/docs/
- Loki: https://grafana.com/docs/loki/latest/send-data/otel/
- LadybugDB: https://docs.ladybugdb.com/
- DuckDB: https://duckdb.org/docs/
- Marimo: https://docs.marimo.io/

Compatibility means using an existing supported interface or adding a small required adapter, not implementing another complete telemetry subsystem.

Grafana is primarily a query and visualization consumer in the current self-hosted stack.

Memory and graph applications use their appropriate data APIs; observations about memory or graph operations may independently flow into telemetry.

Do not automatically mutate application memory or graph stores merely because a telemetry event was emitted.

Do not install additional applications just to satisfy a compatibility test.

---

# 7. Default Signal Destinations

Use the existing Collector configuration as the authoritative initial routing definition.

Recommended signal behavior:

| Observation | Critical route | Specialized consumer |
|---|---|---|
| Logs | Collector → ClickHouse | OpenSearch |
| Events | Collector → ClickHouse | OpenSearch |
| Metrics | Collector → ClickHouse | Prometheus |
| Timing | Collector → ClickHouse | Prometheus / Jaeger |
| Traces | Collector → ClickHouse | Jaeger |
| Profiles | Collector → ClickHouse | Pyroscope |
| Drift | Collector → ClickHouse | Search/analysis consumers |
| Memory lifecycle | Structured evidence → ClickHouse | Memory analysis |
| Graph operations | Structured evidence → ClickHouse | Graph analysis |
| Health | Collector → ClickHouse | Dashboard/alert consumers |

Only apply a route when the deployed Collector and exporter actually support that signal.

Preserve the original structured observation when translating between signal types.

Additional destinations are configured through existing Collector capabilities wherever possible.

The library exposes the configuration and capability information required to use those routes without implementing a second routing system.

---

# 8. Mandatory Incremental Build Method

## Cowles-law implementation sequence

**Build one working string. Test it. Extend it. Test it again.**

Do not attempt the entire feature set simultaneously.

## Gate 1 — One observation

Create a structured test observation.

Verify:

- Valid identity.
- Correct timestamp.
- Correct producer.
- Correct observation type.
- Correct attributes.

Record the fixture.

## Gate 2 — One emitter

Connect that observation to one existing native emitter.

Prefer a supported OpenTelemetry SDK or the actual DeepSeek emitter adapter.

Verify the emitted representation.

Do not implement another telemetry engine.

## Gate 3 — One transport

Connect the emitter to the configured Collector endpoint.

Use the established OTLP protocol.

Verify transmission and receiver acceptance.

## Gate 4 — One destination

Send the observation through the existing Collector pipeline.

Verify the exact observation is accepted by the intended pipeline.

## Gate 5 — ClickHouse receipt

Query the real ClickHouse database for the observation's unique identifier.

Verify its expected attributes.

This closes the first complete string:

```text
One Observation
      ↓
One Emitter
      ↓
One Transport
      ↓
OTel Collector
      ↓
ClickHouse
      ↓
Verified Evidence
```

Turn this into a permanent end-to-end regression test.

**Do not expand the implementation until this complete chain works.**

## Gate 6 — More inputs

Reuse the proven chain.

Add observation families incrementally:

1. Logs and events.
2. Metrics.
3. Timing and traces.
4. State and lifecycle.
5. Memory and graph.
6. Profiles through supported profiling interfaces.
7. Domain-specific observations.

Test each addition before proceeding.

Do not create a new transport merely because the input changed.

## Gate 7 — More producers

Connect additional producers to the same library.

Start with disposable test producers.

Then integrate SOUP, ACC, and other applications using their established seams when appropriate.

Verify source identification and complete delivery.

## Gate 8 — More outputs

Expand destinations through the existing Collector pipelines.

For each output:

1. Inspect its accepted signal types.
2. Verify the supported native connection.
3. Configure the existing interface.
4. Send a known event.
5. Verify accepted delivery or final receipt.
6. Test failure isolation.
7. Re-run the ClickHouse regression.

Only implement a new adapter when the existing infrastructure cannot provide the required integration.

## Gate 9 — Selective routing

Use the Collector's existing routing/filtering facilities where supported.

Examples:

- Prometheus receives selected metrics.
- Jaeger receives traces.
- Pyroscope receives profiles.
- OpenSearch receives selected searchable events.
- ClickHouse retains the configured canonical evidence stream.

Test positive and negative filtering results.

Do not accidentally remove evidence from the critical path.

## Gate 10 — Failure behavior

Test:

- Collector unavailable.
- ClickHouse unavailable.
- Invalid event.
- Unsupported signal.
- Invalid configuration.
- Network timeout.
- Optional consumer unavailable.
- Retry/buffer exhaustion.

Report which delivery boundary failed.

Do not interrupt the producer's core activity merely because optional telemetry delivery failed.

Reuse the emitter's existing buffering, retry, and lifecycle facilities.

---

# 9. Marimo Studio — Experimental Workbench

Use existing Marimo Studio to investigate unfamiliar signal representations and integration methods before adding production functionality.

Create small, repeatable experiments for:

- JSON and OTLP mapping.
- Metrics and timing.
- Trace correlation.
- Memory observations.
- Graph observations.
- File/Arrow/Parquet interchange.
- Destination compatibility.
- End-to-end receipt.
- Failure and recovery.

Marimo experiments must use real libraries, real supported APIs, and controlled fixtures.

Capture:

- Hypothesis.
- Exact input.
- Exact interface under test.
- Execution.
- Actual result.
- Verification evidence.
- Conclusion.

Promote passing experiments into automated TypeScript tests.

Marimo is a test environment, not an additional production telemetry implementation.

---

# 10. Product A — Library Completion Contract

The standalone reusable capability is complete for V2 only when:

- It can be built, imported, and executed independently.
- It has a stable typed emission API.
- Configuration works without a UI.
- It reuses existing emitters and SDKs.
- It handles the required observation representations.
- It exposes accurate capability metadata.
- It supports on-demand diagnostics through existing interfaces.
- It emits a real event through the existing Collector.
- That exact event is verified in ClickHouse.
- Incremental input and output tests pass.
- Independent versioning and packaging work.
- Documentation and regression tests are complete.

Publish or package this library independently.

**Reuse the published standalone connector as Product A's existing starting point; complete and verify required capabilities without recreating its working seam before implementing Product B.**

---

# 11. Product B — Native DSH Plugin

## Purpose

Expose the tested standalone connector's capabilities through a separate native DeepSeek Harness service.

Use an independently released, tested library dependency.

Do not copy the library's implementation into the plugin.

## Native registration

Register a Cordis service using the official DSH mechanisms.

Expose a simple consumer interface, conceptually:

```ts
ctx.qTelemetry.emit(event)
```

Other DSH plugins declare the service dependency and use it directly.

The plugin owns initialization, registration, dependency injection, configuration integration, and lifecycle disposal.

It must not introduce another exporter or Collector.

## Native Settings

Provide a proper DSH Settings page for the capabilities integrated by the installed plugin version.

Settings include:

- Service enablement.
- Configured telemetry endpoint.
- Transport.
- Registered producers.
- Supported observation types.
- Destination configuration.
- Routing/filter settings where supported.
- Operational status.
- Diagnostic controls.

Read/write must use the actual native DSH configuration mechanisms and survive restart.

YAML configuration may be the underlying configuration source.

The Settings UI is an interface to that configuration, not a competing configuration engine.

## Observation UI

Extend the useful existing Telemetry Seams UI.

Provide:

- Source inventory.
- Recent observations.
- Source/event filtering.
- Attributes and timestamps.
- Destination visibility.
- Delivery evidence.
- Current emission failures.
- Last verified receipt.

Show actual observations where the connected data source makes them available.

Do not substitute port checks for observation evidence.

## Ping and Refresh

Ping and Refresh are **manual, on-demand operations**.

A probe should use the existing library diagnostic interface.

Where supported, it emits a uniquely identifiable synthetic event and verifies delivery.

A probe must clearly distinguish:

- Configured.
- Reachable.
- Accepted.
- Stored/verified.
- Failed or unverified.

Do not implement continuous background polling.

Normal emission and error reporting remain active during normal application operation.

---

# 12. Independent Dependency and Versioning

The library and plugin are independent products.

The plugin declares a tested library dependency and records the resolved release in its reproducible build.

Example:

```text
Standalone Connector 1.0
    └── DSH Plugin 1.0

Standalone Connector 1.1
    └── Existing plugin remains unchanged

Standalone Connector 2.0
    └── Existing plugin remains unchanged

DSH Plugin 1.1
    └── Deliberately adopts tested library capabilities
```

The library may gain additional supported observations, formats, or adapters.

Those features do not automatically become active DSH plugin features.

When adopting a new library release:

1. Inspect its published capability changes.
2. Select features to integrate.
3. Update dependency resolution.
4. Extend native registration/settings/UI only where required.
5. Execute compatibility tests.
6. Re-run the complete original delivery regression.
7. Release the plugin independently.

Reproducible dependency resolution is appropriate here because the plugin must use the exact library build it was tested with.

Do not silently update an installed plugin or its dependency.

---

# 13. Portability and Reuse Test

The library must expose standard, reusable observation and connection contracts.

Test its interfaces from a standalone application and from the DSH plugin.

Also demonstrate that its published configuration or protocol contracts can be reused in an additional integration with the existing Collector pipeline.

Reuse the Collector's supported receivers, processors, and exporters.

Do not implement a second Collector or assume a TypeScript package is natively loadable as a Go Collector component.

A successful interoperability test is one in which both systems use the same documented interface and observations reach the intended destination.

This proves portability of the seam.

---

# 14. Final Deliverables

## Library deliverables

1. V1 seam inventory and reuse decisions.
2. Standalone TypeScript Neuron Connector/library capability, built upon the published package.
3. Public API and type definitions.
4. Configuration schema and examples.
5. Observation/capability definitions.
6. Supported native emitter adapters.
7. Diagnostic and probe interfaces.
8. Test suite.
9. Marimo experiments and evidence.
10. Verified Collector-to-ClickHouse delivery test.
11. Independent package version and release.
12. README, architecture, and runbook.

## Plugin deliverables

1. Native DSH plugin.
2. Cordis service registration.
3. Explicit, tested and locked standalone connector dependency.
4. Native Settings and persistence.
5. Observation UI.
6. On-demand Ping/Refresh.
7. Producer/service integration test.
8. Restart and removal tests.
9. End-to-end delivery test.
10. Plugin version and independent release documentation.

## Final acceptance tests

The system is accepted when:

- A standalone producer emits using one library call.
- The existing native telemetry implementation handles its emission.
- The existing Collector accepts the observation.
- ClickHouse confirms durable receipt.
- Additional observation types reuse the same mechanism.
- Additional producers reuse the same library.
- Additional destinations extend existing Collector routing.
- The DSH plugin registers the library as a real Cordis service.
- Another DSH plugin can emit through that service.
- Its Settings page correctly configures the integrated library capabilities.
- Its observation UI displays real evidence.
- Manual probing works without continuous polling.
- Restart preserves configuration.
- Plugin removal does not remove the independent library or historical evidence.
- Library releases do not force plugin updates.
- Every new capability preserves the verified V1 delivery path.

## Final implementation instruction

**Inspect → Specify → Build one observation → Connect one emitter → Connect one transport → Verify Collector receipt → Verify ClickHouse storage → Add inputs → Add outputs → Verify/publish connector → Build DSH plugin → Register service → Verify plugin → Release independently.**

Use proven code and official interfaces.

Do not redesign solved connections.

Do not rebuild existing infrastructure.

Do not substitute mocks for required end-to-end verification.

Do not conflate the standalone library with its native DSH plugin.

**The library makes telemetry simple. The DSH plugin makes it a registered, configurable, observable native service. The existing OpenTelemetry Collector does the collection and routing. ClickHouse preserves the evidence.**