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

## Gentle Mentor actions: deciding is separate from carrying out (added 0.10.0, unreleased)

**Mentor owns the decision** (`reanchor.mjs`): count strikes, send reminder 1 or reminder 2, ask the human on the third strike,
reset or carry the count, publish the intervention evidence. **An action owns how a decision is carried out**
(`mentor-actions.mjs`, no Cordis, DSH or zod imports).

- **An action** is `{ name, run(request) }`. `run` may be sync or async and may return nothing or `{ ok?, error? }`
  (`ok: false` means the action failed). `request` is frozen: `{ kind: 'reminder' | 'escalation', attempt, strikes, respondsTo, text }`,
  where `respondsTo` is the drift evidence reference `{ sessionId, turn, kl_divergence, threshold }`. `attempt` is `null` for an escalation.
- **Mentor receives an ordered list at construction** (`createReanchor({ actions })`, passed through `createPluginRuntime({ actions })`).
  Actions are started in list order, after the decision and before the intervention evidence is published.
- **Each action is isolated.** A throw or rejection is reported as `{ phase: 'consumer', consumer: 'action:<name>' }` and never stops the
  other actions, the measurement, the evidence, or Mentor's state. Each action's result (`name`, `kind`, `ok`, `error`) goes to `onActionResult`;
  the Host keeps the last six in `status.mentor.actionResults` (a new field; no existing field changed meaning).
- **Old callbacks vs actions.** `inject` / `escalate` still work when no action is given (tests pin them). When an action list is
  given it **replaces** them: they are not called, so a decision is never carried out twice.
- **The first action is injection** (`createInjectAction`): put the reminder into the chat inbox, or the escalation message plus the human
  question, wait for the Harness to confirm, record failures. The Harness side reaches it through one adapter object built in
  `src/mentor-host.ts`; the Host passes `[inject]` and nothing else.
- **What stays in the Host on purpose:** the inbox-splice confirmation (`src/index.ts`, `agent/inbox/spliced`) and `abortIntervention`
  (`src/status-board.ts`). They react to Harness events (inbox, settings, disposal), not to a Mentor decision. Live markers, the bypass
  register, the `qdev-soup/signal` publication and status updates are unchanged wiring.
- **One behaviour difference, failure case only:** a delivery step that throws used to escape into the detector's `mentor` subscriber and
  skip that drift's intervention evidence. It is now reported as consumer `action:inject` and the evidence is still published.

Later, another skill, a Python script or a Rust program would be added as another action in the list; no detector code changes.
**Non-decisions:** no global registry, no plugin platform, no event bus, no SDK, and nothing built beyond the inject action.
