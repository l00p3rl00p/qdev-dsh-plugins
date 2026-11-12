# Telemetry V2 — Implementation Plan

**Role:** Mission and execution plan. **What to build and test:** [Telemetry V2 — Authoritative Specification](TELEMETRY_V2_SPECIFICATION.md).

This document tells an implementer **where to begin, what to reuse, how to integrate, in what order to test, and when to stop**. The specification controls the required capabilities, scope, constraints, and acceptance criteria. When an implementation doesn't meet a requirement, change the implementation or record a gap; **do not dilute the specification**.

## Mission

Make telemetry a reusable, one-call capability for producers without rebuilding OpenTelemetry infrastructure.

**Any producer → a common emission interface → existing native telemetry → existing Collector → verifiable ClickHouse evidence.**

**Mandatory implementation dependencies (USE, do not merely inspect):**

- **Standalone OTel Neuron Connector:** use the actual published TypeScript package at [library/typescript/otel-neuron-connector](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector). Import its working typed event/emitter API in the DSH telemetry service. Do not recreate an equivalent wrapper in plugin source.
- **Existing DSH plugin boundary:** reuse the actual native integration, package/build/install patterns and tool/UI service interfaces already exercised by [dsh-telemetry-seams](../plugins/dsh-telemetry-seams/). Use its [Cordis entry](../plugins/dsh-telemetry-seams/src/index.ts), [package contract](../plugins/dsh-telemetry-seams/package.json), [client](../plugins/dsh-telemetry-seams/src/client/), and [seam/probe model](../plugins/dsh-telemetry-seams/ARCHITECTURE.md) as the existing native boundary. Preserve the current read-only observer's behavior: do **not** turn that inventory service into the writer or disrupt its independent probes. A separate service implementation may be needed inside the native DSH plugin boundary.

**Both must be used in the built plugin and demonstrated in tests.** They are not optional references, alternatives or a request to build new competing frameworks. The native DSH layer supplies the real supported reporter to the library; the library provides the emission operation; the existing Collector handles transport/routing.

Do it in two independently released products:

1. **Standalone library/Neuron Connector capability:** framework-independent observation interface and compatible emitter/transport adapters; usable without DSH. A Neuron Connector is a general reusable connection mechanism; OTel is one application, not the definition of the concept.
2. **Native DSH Telemetry service plugin:** consumes a **tested, locked version** of the standalone package and integrates it with official DeepSeek/Cordis services, settings, observation views, lifecycle and manually triggered probes.

The library is not a DSH plugin. The plugin is not a second library, Collector, exporter, database, or telemetry platform.

## Implementation starting point — what exists

| Component | Source / current state | Ownership |
|---|---|---|
| [OTel Neuron Connector](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector) | Existing standalone TypeScript package, currently manifest version `0.1.0`, with `createTelemetry`, `createMemoryEmitter`, a typed `emit` seam, Node tests and a Marimo experiment | `l00p3rl00p/library` |
| [Telemetry V2 specification](TELEMETRY_V2_SPECIFICATION.md) | The original full requirement and acceptance contract, unchanged in its substantive sections | `qdev-dsh-plugins/docs` |
| [Existing DSH plugin boundary](../plugins/dsh-telemetry-seams/) | **Required reuse** of proven Cordis host/client registration, installation/build contract, tool and on-demand probe patterns; preserve the existing observer's read-only responsibility | `qdev-dsh-plugins/plugins/dsh-telemetry-seams` |
| Native DSH Telemetry service plugin | Build within the established native plugin boundary **and import the published connector**. Service emits through the working native reporter, while the existing observer remains independent | DSH plugin project |
| Native event reporter / OTel SDK | Existing emitter implementation, supplied by the consuming runtime | Existing infrastructure |
| OTel Collector / ClickHouse | Existing routing and durable evidence path to inspect and prove, not replace | Existing infrastructure |

**Evidence boundary:** The existing standalone package has local emitter/in-process tests. Neither real Marimo Studio UI execution nor durable Collector → ClickHouse receipt was verified in the earlier package work. The full V2 specification is *not yet implemented*. Do not equate an emitter callback with persistence.

## Begin here: inspect and establish the baseline

1. Read the complete [specification](TELEMETRY_V2_SPECIFICATION.md), then the standalone package's [README](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/README.md), [package.json](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/package.json), [TypeScript source](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/src/index.ts), [tests](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector/test) and [AGENTS.md](https://github.com/l00p3rl00p/library/blob/main/typescript/otel-neuron-connector/AGENTS.md).
2. **Use the existing DSH plugin boundary:** inspect the checked-in `plugins/dsh-telemetry-seams` entry, package, client and probe/service patterns, and the *actual installed* DSH native telemetry surface and official plugin creator/Cordis service contract. Identify the supported reporter construction and lifecycle, for example `ctx.otel.createEventReporter(options)` followed by `reporter.emit(record)`. Validate against installed interfaces rather than assuming example names alone are sufficient.
3. Inspect the existing Collector configuration and ClickHouse schema/ingestion route. Locate a supported, read-only way to check arrival of one uniquely identified test record. Identify producer inputs, optional destinations, and current working paths.
4. Write a **short reuse/gap inventory** mapping specification requirements to existing code, a missing capability, and a directly runnable validation command. Don't rebuild working infrastructure or invent extra services.

## Install the standalone package for development

```bash
git clone https://github.com/l00p3rl00p/library.git
cd library/typescript/otel-neuron-connector
npm install --ignore-scripts --no-audit --no-fund
npm test
python3 test/marimo_equivalent.py
npm pack --dry-run
```

**Required consumer integration:** package the exact tested connector build as a real dependency of the native DSH service plugin and verify an invocation from a second plugin reaches the connector's `emit()` and then the native reporter. A shared naming convention, copied code, README link or stand-alone test does **not** satisfy this dependency.

The published source is an independent package; the manifest declares `otel-neuron-connector@0.1.0`. **Do not assume the package is published to npm**, or that a GitHub release/tag is immutable. Before plugin installation, select an inspected commit or packaged artifact, record its integrity/checksum and resolved dependency, and test the exact bits the consumer will install. Use a versioned package file, Git dependency or supported workspace/package workflow as established by actual build and plugin-manager tests; do not copy the library source into the plugin.

For a real Marimo Studio test in a configured environment:

```bash
marimo edit notebooks/library_smoke.py
```

The Python equivalent tests the notebook logic; it does **not** establish that Marimo Studio itself has run. A live Collector/ClickHouse test is a separate gate.

## Working-string implementation order

Each gate is complete only when the specified observation can be inspected through its *actual* boundary. Keep all earlier passing checks as regression tests. The detailed and authoritative gates are in [Specification §8](TELEMETRY_V2_SPECIFICATION.md#8-mandatory-incremental-build-method).

| Gate | Implement / verify | Pass evidence |
|---|---|---|
| **1. One observation** | One typed event, known source and correlation identifier | Actual event object, valid shape |
| **2. One emitter** | Inject existing compatible reporter through library; preserve lifecycle | Event emitted once by real reporter |
| **3. One transport** | Use the existing supported OTel transport/SDK | Endpoint accepts unique test observation |
| **4. One destination** | Use the existing Collector routing | Collector confirms processing |
| **5. Durable receipt** | Query **the exact same event** in ClickHouse | Stored row/correlation identifier and timestamp |
| **6. More inputs** | Add required observation representations incrementally | One test per added representation |
| **7. More producers** | Reuse the same library API from other producers | Attribution and separation maintained |
| **8. More outputs** | Add via existing Collector pipelines, not a new router | Destination-specific observed delivery |
| **9. Selective routing** | Use supported Collector configuration | Verified routing without loss of core evidence |
| **10. Failure behavior** | Exercise relevant downstream outages and recovery | Accurate, distinct health/failure states |

**Critical invariant:** Producer → native emitter → OTel Collector → ClickHouse remains the durable evidence path. Grafana, Jaeger, Prometheus, OpenSearch and other consumers are optional; their independent failures do not automatically mean the canonical stream failed. Distinguish emission, transport acceptance, Collector processing and durable receipt. Never claim successful storage based only on a resolved `emit()`.

## Finish the independent library before native plugin integration

Implement only the gaps revealed by the specification and inventory:

- Typed common event shape and one-call API; supported observation families and formats.
- Adapters to working native emitters/SDKs; do not create an OTLP protocol stack or alternate Collector.
- Configuration and accurate capability discovery.
- On-demand diagnostics and evidence-backed status, without perpetual background polling.
- Reproducible tests, independent packaging/versioning, portability to a non-DSH consumer.
- One actual end-to-end event verified in Collector and ClickHouse, then incremental regressions.

Publish a tested library release independently. Its capability/version changes do **not** automatically activate new plugin features.

## Implement the native DSH service plugin

Only after the standalone component's required gates have passed:

1. **Use BOTH existing implementations as required inputs.** Follow the proven native Cordis/plugin/host-client packaging and lifecycle boundary in [`dsh-telemetry-seams`](../plugins/dsh-telemetry-seams/) and the official DSH plugin creator; **import and invoke** the actual tested [`otel-neuron-connector`](https://github.com/l00p3rl00p/library/tree/main/typescript/otel-neuron-connector) dependency in the native service implementation. Keep the existing `dsh-telemetry-seams` observer read-only and working. Use `ctx.otel` through properly declared native service injection when writing events; do not repurpose its observer-only `ctx.reflect.get()` inspection path to perform emission. The native plugin owns reporter construction, adapter, registration, UI and disposal.
2. Expose a simple service method (conceptually `ctx.qTelemetry.emit(event)`) and verify a second independent DSH plugin consumes it via the normal service dependency path.
3. Add native settings for the capabilities actually integrated; persist and reload them through official DSH configuration mechanisms. Do not build a separate settings framework.
4. Add an observation view driven by real available telemetry/evidence. Separate emitted, accepted, stored, failed and unknown states; don't simulate evidence.
5. Add **manual** Ping and Refresh buttons to test configured endpoints. No continuous health polling. Normal emission/error handling continues during regular operation.
6. Verify installation, enable/disable, restart, configured settings persistence, dependency discovery, plugin removal, and library-independent release behavior.
7. Re-run the same unique-event Collector → ClickHouse test **through the second-plugin caller → native Cordis service → installed OTel Neuron Connector → native reporter**. Confirm the installed package resolution and that the old `telemetry_seams_inventory` tool / read-only browser probes still work, with no regression to the existing evidence path.

### Native plugin acceptance

The plugin is complete only when the **real published connector package and existing native DSH plugin boundary were both reused in the implemented service**, verified by import/dependency-resolution and integration tests (not documentation alone), and it installs through the supported DSH workflow, registers a real Cordis service, another plugin can call it, settings and observation UI show actual integrated capabilities, manual probes work, restart/removal behaves safely, and ClickHouse confirms the unique test event. **The specification's complete Product B contract and final acceptance tests remain authoritative.**

## Release, security and change control

- Follow the public standalone library's `AGENTS.md`: no private repository details, internal paths, secrets, credentials, internal service metadata, or copied conversations in public package sources, tests or documentation.
- Run actual build/test/pack and available security checks; record uninstalled or unrun scanners as **NOT RUN**, never PASS.
- Publish only reviewed changes and artifacts. Report exact tested package version, resolved dependency/commit, checksum, test commands, observed test results, and known missing V2 gates.
- Pin the tested standalone dependency in the independently released plugin. A new standalone version never silently updates a deployed DSH plugin.
- Do not modify upstream DSH source, existing Collector, or consumer deployments merely to accommodate a local test. Change only the smallest authorized integration seam.
- On failure, distinguish **broken mechanism**, **missing integration**, **missing evidence**, and **missing knowledge**; fix the identified issue rather than restarting the architecture.

## Final handoff / stop condition

Provide the independently versioned connector/library, native DSH plugin, install/upgrade instructions, capability and configuration references, test evidence, unique ClickHouse receipt, and explicit remaining gaps. Complete [all final acceptance tests in the specification](TELEMETRY_V2_SPECIFICATION.md#final-acceptance-tests). A plan, a mock, a successful local callback, or a package build alone is not acceptance.

**Execution order:** Reuse published connector + existing native DSH plugin boundary → inspect existing source → inventory reused seams → build/verify one input/emitter/transport → Collector receipt → ClickHouse receipt → extend inputs → extend outputs → verify library portability/release → native DSH service/plugin → UI/manual probes → end-to-end regression → independent release.
