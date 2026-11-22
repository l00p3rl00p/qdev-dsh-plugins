# SOUP Drift architecture

SOUP drift is the **first producer of a fact**: a measurement that says how far a window of assistant output has moved from its
baseline. Gentle Mentor, status, notifications and other plugins are **peer consumers** of that fact. The producer does not know
which consumers exist; they share only the shape of the evidence. Nothing here adds a bus, broker, database or SDK: the in-process
seam is a documented `subscribe`, and the cross-plugin seam is a native Cordis event.

## Layers (0.10.0, on the 0.9.0 layout)

| Layer | Module | Owns |
|---|---|---|
| Measurement | `soup_worker.py` | The official SOUP calculation. Nothing else measures drift. |
| Core | `soup-core.mjs` | Calls the worker; the adapter (DSH event -> `{ text, turn, seq }`); the **evidence contracts**. Node built-ins only. |
| Detector | `drift.mjs` | Windows, baseline, epoch-fenced in-place `reconfigure`, `subscribe`. Imports only `soup-core.mjs`. Emits, never calls a consumer. |
| Standalone monitor | `monitor.mjs`, `monitor-cli.mjs` | Object-style consumers over the detector; no Harness. |
| Wiring | `runtime.mjs` | Subscribes notify and Mentor to the detector; every subscriber is isolated. |
| Consumer policy | `reanchor.mjs` | Gentle Mentor strikes and messages; publishes **intervention evidence**. |
| Host rules | `status.mjs`, `session-registry.mjs` | Status shape, error recording, recent-window summary, drop accounting. No Harness imports. |
| Settings | `detector-settings.mjs`, `mentor-settings.mjs`, `session-settings.mjs` | Each component owns its keys; the session record composes them. Stored keys are unchanged. |
| Host | `src/*.ts` | Binds the above to the Harness (storage, routes, delivery, native events). |

## The evidence (provisional names; the version is part of the name)

1. **Drift evidence** `qdev-soup/drift-evidence/v1`: `{ sessionId, turn, singleTurn, result }`, frozen, built only by
   `createDriftEvidence` in `soup-core.mjs`. A result that violates the contract is a parse failure and reaches no consumer.
2. **Intervention evidence** `qdev-soup/intervention-evidence/v1`: what Mentor did (`reminder | escalation | reset | carry`),
   referencing the drift evidence it answered. It records a **decision**, not a confirmed delivery; delivery truth stays in
   `status.mentor.reminders` (confirmed by the native inbox event).

Peers read the contract (`validateDriftEvidence`, `validateInterventionEvidence`) and nothing else. The older
`qdev-soup/signal` event (camelCase signal from `monitor.mjs`) is kept for 0.9.0 consumers.

## Seams

- **In process:** `detector.subscribe(kind, fn, name)` and `runtime.subscribe(kind, fn, name)`; kinds are `observation`,
  `evaluationStart`, `evaluation`, `drift`, `error` (and `intervention` on the runtime). A throw or a rejected promise from a
  subscriber is reported once as `{ phase: 'consumer', consumer: name }` and never stops the measurement or a peer.
- **Between plugins:** the Host publishes both evidences with `ctx.parallel` (not `ctx.emit`: one throwing listener would stop the
  others and escape into SOUP). Failures are recorded as consumer diagnostics only.

## Decisions pinned in code and tests

- **A, "off is off":** a chat that is off ignores events silently: no count, no diagnostic.
- **B:** a measurement in flight when a chat is turned off or its agent leaves is kept and measured once on resume.
- **C:** a grown baseline is refilled from the earliest session history, never from the next arriving events.
- **P3:** an event that should reach a runtime but cannot is counted (`droppedEvents`) and diagnosed once per session.
- **P4:** the headline follows the recent calculations; the cumulative average is a separate figure.
