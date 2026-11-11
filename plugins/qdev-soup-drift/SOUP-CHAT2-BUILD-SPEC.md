# SOUP "CHAT 2.0" build spec — for the implementing model

> **Superseded 2026-11-11 by `SOUP-CHAT2-BUILD-SPEC-v2.md`.** This version was written against SOUP 0.5.3, before 0.6.3 (which already has Feature 2) was recovered. Kept for history; do not build from it.


Written 2026-11-11. Branch: `feature/soup-per-chat-20261111` (cut from `main` at tag `soup-v0.5.3`).
Package: `qdev-trajectory-drift-soup`, directory `plugins/qdev-soup-drift`. Target Harness: DSH `0.2.2-rc.1`.
Upstream engine (do not reimplement it): https://github.com/MakazhanAlpamys/Soup — used through `soup_worker.py`
(`soup_cli.utils.drift_alarm`).

## 0. Rules — read before touching anything

1. **Work only on this branch.** Never commit to `main`. Never move or delete tag `soup-v0.5.3`; it is the rollback.
2. **One feature at a time, in the order of section 5.** A feature is done only when its "Prove" list passes.
   If a proof fails: stop, fix that feature, re-run its proofs. Do not start the next feature.
3. **Never break the working core.** After every feature re-run the Baseline (section 4). The core must keep
   working if every new UI piece fails to load.
4. **Use only the seams in section 3.** No DOM watching or rewriting, no patching Harness files, no new HTTP
   server, no custom OTEL exporter, no plugin-mounted remote (`ctx.remote.$mount`). If a feature seems to need
   something not in section 3: stop and ask the owner. Do not invent an integration.
5. **No mocks, no mock libraries, no simulated output.** Existing tests pass plain functions into the runtime;
   keep that style. Report real output, including failures.
6. **YAGNI / KISS.** Smallest change that passes the proofs. No abstractions for future features.
7. **Comment surgically:** only where code is novel or could confuse.
8. **Commit in batches:** one commit per feature (source + rebuilt `dist/` + tests + docs line). Append to `.md`
   files; do not rewrite them.
9. **Packaging is frozen:** no `prepare` script, `dist/` is committed, install by full commit SHA. After changing
   `src/`, run `pnpm run build` and commit `dist/` in the same commit.
10. **Plugins are standalone.** SOUP must work installed alone. Do not rely on ACC or Telemetry Seams being present.
11. **The owner is the UI tester.** Give them one SHA and the exact install command per feature. Do not report a
    UI proof as passed unless the owner confirmed it.

## 1. What exists today (verified by reading the source at `soup-v0.5.3`)

| Piece | File | Fact |
|---|---|---|
| Global config | `src/index.ts:47-59` | 7 fields; all but `python` are `.volatile()` |
| Config snapshot | `src/index.ts:153-161` | Read **once** at `apply` into `resolved`. Not re-read per evaluation |
| Detector | `drift.mjs` | Per-session state (`base`, `live`), but threshold, `baselineCount`, `windowCount` are fixed at creation (`PRESETS[preset]`, line ~153) |
| Sensitivity presets | `drift.mjs:4` | `[0.05, 0.1, 0.2, 0.3, 0.4]`, default index 2 |
| Mentor policy | `reanchor.mjs` | Per-session. Drift 1 and 2 both inject `GENTLE_REMINDER(original plan)`; drift 3 escalates to the human. `carry` and `decisionPending` persist |
| Mentor persistence | `src/index.ts:20-30` | Storage domain `qdev_soup_drift_state` v1, table `sessions`, keyed by session id |
| Delivery | `src/index.ts:244-258` | `agent.inject(createUserMessage(...))` with `source.kind = 'qdev-trajectory-drift-soup'` carrying `form`, `attempt`, `kl`, `threshold` |
| Human escalation | `src/index.ts:291-324` | `ctx.userQuestions.ask(...)` |
| Status | `src/index.ts:166-199` | **One global** `status` object, not per chat |
| Host→browser channel | `src/index.ts:425-466` | `ctx.webServer.register` exact route `/qdev-soup-drift/status`; GET returns status, POST needs header `x-qdev-soup-action`. Body limit 4096 bytes |
| Browser half | `client.js` | Hand-written, no bundler. Registers `settings.section` (id `soup-trajectory-drift`) and `plugins.row.config`. Polls the status route every 4 s |
| Telemetry | — | **No OTEL code in this plugin.** Drift evidence leaves through Harness session events (the injected message's `source` metadata). The Harness's own `ctx.sessionTelemetry` seam exports session records |

**Status of the requested features in this source:** Feature 1 done. Features 2–7: **none implemented.**
Parts that already exist and must be reused: per-session mentor state, the three-count guard, delivery records,
the status route, the settings page components in `client.js`.

## 2. Unknowns you must resolve by running, not by assuming

- U1. Does a global settings change take effect without a restart? The code snapshots config once, so it may
  not. Test in Baseline step B5 and record the answer. Feature 2 fixes this by reading `.get()` at evaluation time.
- U2. Does the `exact` web route receive requests that carry a query string? This spec avoids the question by
  sending the session id in a POST body.
- U3. `conversation.view` tab: confirm whether a slot entry alone shows the tab or whether
  `ctx.uiConversation.views.register` is also required. Copy the working registration in
  `plugins/dsh-auto-code-correct/src/client/autocorrect-view.tsx` (`registerAutoCorrectView`).
- U4. Where the OTEL → ClickHouse export is configured (it is outside this plugin). Baseline step B4 only checks
  that SOUP's session events still carry the same `source` metadata; ask the owner how they verify ClickHouse.

## 3. Allowed seams (audited against upstream `dsh-v0.2.2-rc.1`, `docs/capability-seams.md` and the slot contracts)

Host side — all already imported and running in SOUP 0.5.3:

| Need | Seam | Role in upstream table |
|---|---|---|
| Per-chat durable settings | `ctx.storageDomain.open(defineDomain(...))` | core |
| See chat activity | `ctx.on('session/event')`, `agent.session.snapshotEvents()` | core |
| Live agent handles | `ctx.agents.list()`, `agent/created`, `agent/disposed` | core |
| Deliver a mentor message | `agent.inject(createUserMessage({ source }))` | core |
| Ask the human | `ctx.userQuestions.ask` | seam |
| Browser ↔ Host data | `ctx.webServer.register` (existing route only) | core |
| Global settings | Schemastery `Config` with `.volatile()`; read with `.get()` | `ctx.settings` core |

Browser side:

| Need | Slot | Working example to copy |
|---|---|---|
| Global settings page | `settings.section` | SOUP `client.js` (exists) |
| Per-chat SOUP view (a tab) | `conversation.view` — list, scope `session`; `inject: (sessionId) => ...` | ACC `autocorrect-view.tsx` |
| Compact per-chat card | `conversation.composer.dock` — list, scope `session` | installed `dsh-anthropic-oauth` `lib/client.js` |

Not allowed / not available:

- **There is no plugin list slot at the top of the chat.** `conversation.header` is a `single` slot owned by the
  Harness. So "Trajectory card near the top of the chat" cannot be done natively at rc.1. See Decision D1.
- `ctx.otel`, `ctx.sessionTelemetry`: Harness-owned. Do not call or configure them from SOUP.
- Any remote mount. SOUP's existing HTTP route is the channel; keep it.

rc.2 note: `packages/interaction/user-questions/src/index.ts` changed between rc.1 and rc.2. Build and test on
rc.1. Do not claim rc.2 support.

## 4. Baseline — run before Feature 2 and after every feature. If it fails, STOP.

Run where the SOUP Python interpreter exists (see Decision D2). Steps B1–B2 can run in the clean test Harness.

- B1. `pnpm install --frozen-lockfile && pnpm run typecheck && pnpm run build && pnpm run check:host && pnpm run check:client`
- B2. `pnpm test` — record pass/fail per test. The "direct SOUP Python worker" test needs the interpreter.
- B3. Live drift: in a real chat, produce enough assistant messages to fill baseline and one window; confirm in
  the Host log a `SOUP DRIFT session=...` line or a completed evaluation in the status route. Then confirm
  reminder 1, reminder 2, and the third-drift human question appear, in that order.
- B4. Telemetry path: confirm the injected reminder's session event has `source.kind = 'qdev-trajectory-drift-soup'`
  with `form`, `attempt`, `kl`, `threshold`. These field names must never change.
- B5. Master switch: turn `enabled` off in Settings → SOUP Drift; confirm no observation counters move and no
  reminder is injected. Turn it on again. Record whether a restart was needed (U1).

## 5. Features — build in this order

### Shared foundation (build as part of Feature 2, nothing more)

New storage domain `qdev_soup_drift_chat` version 1, table `chats`, keyed by session id. Do **not** change the
existing `qdev_soup_drift_state` domain. Record shape, every key optional (absent = inherit global):

```ts
type ChatRecord = {
  overrides?: { preset?: number; baselineCount?: number; windowCount?: number; detectorEnabled?: boolean; reanchoring?: boolean }
  mentor?: { message?: string; plan?: string; amendments?: string[] }   // Feature 4
}
```

One function in `src/index.ts`, the only place settings are merged:

```ts
// Effective settings for one chat = live global values overlaid with that chat's overrides.
// Global values are read with .get() on every call so a Settings change applies without restart.
function effectiveSettings(sessionId: string): Effective
```

`enabled` (master switch) is **not** overridable per chat: when global `enabled` is false, everything is off.

Route additions on the existing `/qdev-soup-drift/status` path, POST only, body `{ sessionId, ... }`, each with
its own `x-qdev-soup-action` header value. Keep the existing GET and `reset-drift-count` behaviour byte-for-byte.
Raise the body limit to 65536 only for the actions that carry plan text.

### Feature 2 — per-chat settings and overrides

Build:
1. `drift.mjs`: add an optional `settingsFor(sessionId)` option returning `{ enabled, threshold, baselineCount, windowCount }`.
   Default it to the creation-time values so every existing test passes unchanged. Use it in `observe`, `pump`
   and `publishObservation` instead of the closed-over constants.
2. `runtime.mjs`: pass `settingsFor` through; replace `if (enabled && reanchoring)` with a per-session check.
3. `src/index.ts`: the chat domain, `effectiveSettings`, and actions `chat-get` (returns globals, overrides,
   effective) and `chat-set` (body `{ sessionId, key, value }`; `value: null` deletes that override = revert to global).
   Validate with the same ranges as `Config`.
4. No UI yet beyond a minimal form inside the Feature 3 view; if Feature 3 is not built, prove through the route.

Prove:
- Unit: two sessions, one with a `preset` override; the same text drifts in one and not the other.
- Unit: `value: null` restores the global value.
- Runtime: set an override in chat A; chat B's effective values unchanged; restart the Harness; reopen chat A;
  override still there. Change a global value; chat B follows it, chat A's overridden key does not.
- Baseline passes.

### Feature 3 — per-chat live view and compact card

Build (browser, `client.js` only; no Host change except what `chat-get` already returns):
1. Register a `conversation.view` entry, id `soup-drift`, label `SOUP`, `inject: (sessionId) => ({ sessionId })`.
   Put this registration in its **own** `ctx.inject([...])` scope so the settings page still registers if the
   conversation services are missing.
2. Add `@deepseek-ai/dsh-client-ui-conversation` to `dsh.client.inject` in `package.json` and the service names
   the registration actually uses to the client `inject`; update `scripts/check-client.mjs` to match.
3. The view shows effective settings with per-key override controls and "use global" buttons (Feature 2 UI).
4. Compact Trajectory card: `conversation.composer.dock`, one line: state, last KL vs threshold, drift count.
   Clicking it does nothing in this feature.
5. Add nothing to the transcript: no session events, no messages.

Prove (owner, in the Web UI): tab appears in every chat; two chats show different values; card shows and updates;
transcript unchanged; Settings → SOUP Drift still works; remove the new tab code path (simulate failure by
installing with the conversation inject missing is NOT required) — instead confirm by code review that the two
registrations are in separate scopes. Baseline passes.

### Feature 4 — Gentle Mentor visibility and editing

Build:
1. `reanchor.mjs`: add an optional `contextFor(sessionId)` option returning `{ message, plan, amendments }`.
   Defaults: `message` = the current reminder lead-in text, `plan` = the captured original intent text,
   `amendments` = `[]`. Keep the captured original intent untouched and separately readable.
2. Actions `mentor-get` (returns original plan, current plan, message, amendments) and `mentor-set`
   (body `{ sessionId, field, value }`; `null` reverts that field to default).
3. View section: read-only "Original plan"; editable "Current plan", "Mentor message", "Amendments" (list, add/remove).

Prove:
- Unit: after `mentor-set` of plan and one amendment, the next reminder text contains the edited plan and the amendment.
- Runtime: edit in chat A, trigger a drift, read the injected message in the chat: it uses the edited text. Chat B unaffected. Survives reopen.
- Baseline passes.

### Feature 5 — escalation wording

Build in `reanchor.mjs` only:
- Drift 1 → inject exactly: `I think what you are doing is interesting; however, I would like to return focus to the current plan.`
- Drift 2 → inject mentor message + current plan + amendments (from `contextFor`).
- Drift 3 → unchanged human escalation. `carry`, `decisionPending`, reset decision: unchanged.

Prove:
- Unit: exact string equality for drift 1; drift 2 contains message, plan and every amendment; drift 3 calls `escalate` once.
- The existing tests about counts, reset choice, carry and stale drift still pass. Update only assertions that
  compared the old drift-1 reminder text, and say which.
- Runtime: owner sees the three steps in order in one chat. Baseline B3 expectations are updated to this wording.

### Feature 6 — per-chat intervention toggle

This is the `reanchoring` override from Feature 2 with a dedicated control. Build:
1. A toggle in the SOUP view and on the card: "Mentor intervention: on / off (this chat)".
2. Confirm in `runtime.mjs` that with intervention off the detector still runs, `notify` still fires and
   evaluations are still recorded; only `mentor.drift` is skipped.

Prove:
- Unit: with the override false, a drifting window produces an evaluation and a `notify`, and zero `inject`/`escalate` calls. Set it true again: next drift injects.
- Runtime: chat A suppressed still shows drift in its view; chat B and the global setting unchanged.
- Baseline passes.

### Feature 7 — live drift telemetry in the view

Build:
1. `src/index.ts`: per-session ring buffer, last 50 evaluations `{ at, turn, kl, threshold, drift }` filled in the
   existing `onEvaluation` callback, and last 20 delivery records per session from the existing `DeliveryRecord`s.
   In memory only; it restarts empty. Say so in the view.
2. Action `chat-history` returns both lists plus the effective threshold.
3. View: current score, effective threshold, a small inline SVG line of KL against the threshold, markers for
   crossings and for reminder / escalation / clarification events. No chart library.

Prove:
- Unit: after N evaluations the buffer holds min(N, 50) in order; crossings match `drift === true`.
- Runtime: owner sees score move, threshold line follow a per-chat override, and intervention markers.
- Baseline passes. `source` metadata on injected messages is byte-identical in shape to `soup-v0.5.3`.

## 6. Finish

- Bump version to `0.6.0` in `package.json` and `src/index.ts` (`VERSION`) in the last commit only.
- Run the full Baseline once more.
- Append a dated section to the root `LESSONS.md` and one line to this plugin's `README.md` and `ROADMAP.md`.
- Hand the owner one SHA and:
  `dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift'`
- Do not merge to `main` and do not tag. The owner decides after testing.

## 7. Decisions that belong to the owner — ask before the feature that needs them

- **D1 (before Feature 3).** No native slot exists for a card at the top of the chat. Options: (a) put the compact
  card in `conversation.composer.dock`, below the composer, as the Anthropic plugin does — this spec's default;
  (b) tab only, no card; (c) wait for an upstream slot. Not allowed: DOM injection.
- **D2 (before Baseline).** the clean test Harness has no SOUP Python interpreter (`<path-to-soup-python>`
  is missing there), so live drift cannot be proven in the clean test Harness. Options: install `soup-cli` in the clean test Harness and point
  `python` at it, or run runtime proofs on the main Harness.
- **D3 (before Feature 4).** Whether per-chat plan edits should also be visible to the human as a chat message.
  Default: no, to keep monitoring data out of the transcript.
- **D4 (before Feature 7).** History is in memory and empties on restart. Default: accept. Persisting it is a separate feature.
