# SOUP CHAT 2.0 — build plan v2 (for the implementing model)

Written 2026-11-11. Supersedes `SOUP-CHAT2-BUILD-SPEC.md` (v1 was written before SOUP 0.6.3 was recovered).
Branch: `feature/soup-per-chat-20261111`. **Start from commit `da279a3`** = SOUP 0.6.3, 70 of 70 tests passing.
Package `qdev-trajectory-drift-soup`, directory `plugins/qdev-soup-drift`, Harness DSH `0.2.2-rc.1`.
Engine (never reimplement): https://github.com/MakazhanAlpamys/Soup, called through `soup_worker.py`.

## 1. Where things stand

| # | Feature | State at `da279a3` |
|---|---|---|
| 1 | Global settings page | Done |
| 2 | Per-chat settings and overrides | **Done, human-accepted** (`session-settings.mjs`, SOUP tab in each chat) |
| 6 | Per-chat intervention toggle | **Mechanism exists**: per-chat `reanchoring` override. Needs a proof test and a clear label only |
| 5 | Escalation wording | Not built |
| 4 | Mentor message / plan / amendments editing | Not built |
| 7 | Live drift telemetry | Not built (only global counters exist) |
| 3 | Live view + compact Trajectory card | Tab exists (settings only). Live section and card not built |

Build order: **6 → 5 → 4 → 7 → 3**. Each depends only on the ones before it.

## 2. Hard rules

1. Work only on this branch. Never commit to `main`. Never move tags `soup-v0.5.3` or (scratchpad) `soup-v0.6.3-feature2`.
2. One feature at a time. Finish its Tests and Install check before starting the next. If a check fails, stop and fix that feature.
3. After every feature the full suite must still pass (section 3). The 70 existing tests are the baseline; never delete or weaken one. If a wording change requires editing an assertion, change only that assertion and say so in the commit.
4. Allowed seams only: `ctx.storageDomain`, `ctx.on('session/event')`, `ctx.agents`, `agent.inject`, `ctx.userQuestions`, the existing `connection.fetch` route pattern, slots `settings.section`, `plugins.row.config`, `conversation.view`, `conversation.composer.dock`. No DOM injection, no new server, no `ctx.remote.$mount`, no OTEL exporter, no Harness file edits. Need something else → stop and ask.
5. No mocks or mock libraries. Follow the style of the existing tests (real Cordis context, real Python worker, plain functions).
6. Never change the injected message's `source` fields (`kind`, `form`, `attempt`, `kl`, `threshold`). That is the telemetry path.
7. Global master switch off = everything off. No per-chat control may bypass it.
8. The monitoring core must not depend on any UI service. Keep new routes inside the existing `ctx.inject(['connection', 'sessionPersistence'], ...)` block; keep new slot registrations independent of each other.
9. Plugins are standalone: SOUP must work installed alone.
10. Packaging is frozen: no `prepare`; DSH packages stay optional peers; commit rebuilt `dist/` in the same commit as the source.
11. One commit per feature. Comment only novel or confusing code. Append to `.md` files.

## 3. Test and install commands (use exactly these)

The repo is visible inside the main Harness container, which has the real SOUP Python. Run tests there; it does not touch the Harness install.

```sh
docker exec quatrus-harness-deepseek-harness bash -lc 'cd /home/qdev/github/qdev-dsh-plugins/plugins/qdev-soup-drift && PYTHONDONTWRITEBYTECODE=1 SOUP_PYTHON=/home/qdev/llm-runtime/tools/venvs/soup/bin/python pnpm run verify'
```

Pass = typecheck, build, host check, client check, and `fail 0`. Paste the `tests / pass / fail` lines in your report.

Install for the owner to check (after commit and `git push origin feature/soup-per-chat-20261111`; `<SHA>` = full commit hash). QClean first:

```sh
docker exec qdev-clean-deepseek dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift'
```

```sh
docker restart qdev-clean-deepseek
```

Then confirm the Host half loaded (no output = good):

```sh
docker logs --since 60s qdev-clean-deepseek 2>&1 | grep -i "failed to import"
```

QClean has no SOUP Python, so **live drift cannot be shown there**; QClean proves install, load and UI only. Live drift is checked on the main Harness, and only after the owner says to install there (same `add` command with container `quatrus-harness-deepseek-harness`; never `remove` first, never restart it without ACC installed).

Tell the owner to hard-reload the browser after a restart. The owner confirms every UI check; do not mark one passed yourself.

## 4. Features

### Feature 6 — per-chat intervention toggle (proof + label)

Already works: `runtime.mjs` runs the detector and calls `notify` regardless, and skips only `mentor.drift` when the chat's `reanchoring` is false.

- Build: in `client.js` change that field's label to `Mentor intervention (this chat)` and its hint to `Off: SOUP still observes, detects and records drift.` Nothing else.
- Test (new, in `test/runtime-config.test.mjs` style): with `reanchoring: false`, a drifting window yields an evaluation and a `notify` and zero `inject`/`escalate`; `configure({ reanchoring: true })` then the next drift injects. Other chat unaffected.
- Owner check: turn it off in chat A; chat B and Settings → SOUP Drift unchanged.

### Feature 5 — escalation wording

- Build, `reanchor.mjs` only:
  - Drift 1 injects exactly: `I think what you are doing is interesting; however, I would like to return focus to the current plan.`
  - Drift 2 injects: mentor message, blank line, `Current plan:`, blank line, the plan, then if any amendments `Plan amendments:` and one `- ` line each. For this feature the message is a new exported default constant and the plan is the captured original intent.
  - Drift 3: unchanged. Do not touch `carry`, `decisionPending`, `decide`, or stale/missing handling.
- Tests: exact string equality for drift 1; drift 2 contains message and plan; drift 3 calls `escalate` once. `test/policy.test.mjs:19` compares the old drift-1 text: update that one assertion.
- Owner check (main Harness): three drifts in one chat show the three steps in order.

### Feature 4 — mentor message, plan and amendments, visible and editable per chat

Placement: a **Gentle Mentor** section inside the existing SOUP tab of each chat (see Feature 3 for the tab layout).

- Host:
  - New file `mentor-context.mjs`: zod record `{ message?, plan?, amendments?: string[] }`, all optional, strict; limits 4000 / 20000 / 50 items of 2000 chars. A missing key means "use the default".
  - New storage domain `qdev_soup_mentor_context` v1, table `sessions`, keyed by session id. Do not alter the two existing domains.
  - `reanchor.mjs`: new option `contextFor(sessionId)`; drift 2 uses `message ?? default`, `plan ?? original intent`, `amendments ?? []`. Add a method returning the captured original plan text. Pass both through `runtime.mjs`.
  - New route `/api/qdev-soup/session-view` registered next to the settings route, same admission, same `exists` check. `GET ?sessionId=` returns `{ ok, view }`; `POST` with header `x-qdev-soup-action: session-mentor` and body `{ sessionId, field, value }` (`value: null` = back to default) validates, persists, returns the new view. Refuse edits when the global master is off, like the settings route does.
- Must-have UI pieces: read-only **Original plan**; editable **Current plan**; editable **Mentor message**; **Amendments** list with add and remove; a `Use default` button per field; one line showing the fixed first-drift sentence, read-only.
- Do not want: no pop-up or modal, no rich-text editor, no auto-save on keystroke, nothing written into the chat transcript.
- Interactions: edit → `Save` → field shows saved value and a `chat` badge; `Use default` → value returns to default and badge shows `default`; failed save shows the server message inline and keeps the typed text.
- How it is used: the next second-drift intervention in that chat uses the saved text. Nothing else reads it.
- Tests: record validation (limits, unknown key, empty amendment list becomes absent); after setting plan and one amendment the drift-2 text contains both; chat B unaffected; value survives closing and reopening the domain; route refuses anonymous and non-owner callers (copy the pattern in `test/session-host.test.mjs`).
- Owner check: edit in chat A, restart, reopen chat A: text still there.

### Feature 7 — live drift telemetry per chat

- Host: in `mentor-context.mjs` (or a small sibling) a per-chat ring buffer, last 50 evaluations `{ at, turn, kl, threshold, drift }` and last 50 events `{ at, kind, attempt }`. Fill evaluations in the existing `onEvaluation` callback; fill events where a delivery is confirmed in the `session/event` handler (`record.state = 'delivered'`), so only interventions that really reached the chat are shown. Memory only. Add both lists, the effective threshold, mentor state and intervention on/off to the `session-view` response.
- Tests: buffer keeps order and caps at 50; a crossing is an entry with `drift === true`; chat A's history never contains chat B's entries.
- No new telemetry path. Do not emit session events for this.

### Feature 3 — live view and compact Trajectory card

Placement:
- **SOUP tab** (exists, `conversation.view`, id `soup-session-settings`). Add a two-option switch at the top of the tab: `Settings` (default, current content, unchanged) and `Live & Mentor`. The second view fetches `session-view` only when opened and refreshes every 5 s while open.
- **Trajectory card**: `conversation.composer.dock` (below the composer, where the Anthropic quota panel sits). There is no native slot at the top of the chat at rc.1; do not fake one. Register it separately from the tab so either can fail alone.

Must-have pieces, `Live & Mentor` view: current score and effective threshold as two numbers; one inline SVG line of KL over the last 50 evaluations with a horizontal threshold line; markers for crossings and for each reminder / escalation / clarification; the Feature 4 section below it.

Must-have pieces, card: one line — state word (`Stable`, `Approaching`, `Drifting`, `Paused`, `Off`), `KL x.xx / y.yy`, drift count, and `mentor on|off`.

Do not want: no chart library, no animation, no colours outside the `--dsw-alias-*` tokens already used in `client.js`, no headings beyond the section title, no data in the transcript, no card when the global master is off (render nothing).

Interactions: clicking the card opens nothing in this version. The view says `History resets when the Harness restarts.` Empty state: `Waiting for measurements`.

How it is used: read-only glance by the human; the agent is not involved.

- Update `scripts/check-client.mjs` and add client tests in the style of `test/session-controls.test.mjs`: default view is Settings and makes no `session-view` request; switching fetches once; card renders nothing with master off.
- Owner check: tab shows both views; card visible in every chat; two chats show different numbers; Settings → SOUP Drift still works.

## 5. Finish

1. Version `0.7.0` in `package.json` and `VERSION` in `src/index.ts`, last commit only.
2. Full suite once more; paste the counts.
3. Append a dated section to root `LESSONS.md`; one line each to this plugin's `README.md` and `ROADMAP.md`.
4. Report per feature: what was built, test counts, the SHA, and which owner checks are still open. Use one status word: DONE, PARTIAL, FAILED or BLOCKED.
5. Do not merge to `main`, do not tag, do not install on the main Harness without the owner's word.

## 6. Open points for the owner (defaults apply unless told otherwise)

- Card position: below the composer (default) or no card.
- Live-drift proof needs the main Harness; QClean has no SOUP Python.
- History is memory-only and empties on restart.
- A chat in the owner's screenshot failed to load with "not marked ignorable; refusing to interpret". Not investigated; out of scope here.
