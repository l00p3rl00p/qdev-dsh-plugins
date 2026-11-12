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

Run verification in an environment where the configured `python` interpreter can import the official `soup_cli` package. Running tests does not install the plugin.

```sh
docker exec <main-harness-container> bash -lc 'cd <repo-path-in-container>/plugins/qdev-soup-drift && PYTHONDONTWRITEBYTECODE=1 pnpm run verify'
```

Pass = typecheck, build, host check, client check, and `fail 0`. Paste the `tests / pass / fail` lines in your report.

Install for the owner to check (after commit and `git push origin feature/soup-per-chat-20261111`; `<SHA>` = full commit hash). the clean test Harness first:

```sh
docker exec <clean-harness-container> dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift'
```

```sh
docker restart <clean-harness-container>
```

Then confirm the Host half loaded (no output = good):

```sh
docker logs --since 60s <clean-harness-container> 2>&1 | grep -i "failed to import"
```

The clean test Harness may not have the required SOUP Python, so **live drift cannot be shown there**; the clean test Harness proves install, load and UI only. Live drift is checked on the main Harness, and only after the owner says to install there (same `add` command with container `<main-harness-container>`; never `remove` first, never restart it without ACC installed).

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
- Live-drift proof needs the main Harness; the clean test Harness has no SOUP Python.
- History is memory-only and empties on restart.
- A chat in the owner's screenshot failed to load with "not marked ignorable; refusing to interpret". Not investigated; out of scope here.

## 7. Owner correction — 2026-11-11 (overrides sections 4 and 6 where they differ)

- **Placement is settled: SOUP lives in its own tab in the chat's tab row, right beside Trajectory.** That tab already exists and the owner confirmed it in the clean test Harness on 0.6.3 (tab row: Chat, Trajectory, AutoCorrect, Telemetry Seams, SOUP). Do not move it and do not change how it registers.
- **Do not build the compact Trajectory card.** Drop everything in Feature 3 about `conversation.composer.dock`, the card's one-line content, and the card tests. `conversation.composer.dock` is removed from the allowed-seams list for this work.
- **Feature 3 is now only:** the `Settings | Live & Mentor` switch inside the existing SOUP tab, with the live section (Feature 7 data) and the Gentle Mentor section (Feature 4).
- Open point "Card position" in section 6 is closed.
- SOUP 0.6.3 (commit `da279a3` code) is installed on the main Harness as of this date, so live-drift checks can run there.

## 8. Placeholders (this repository is public)

Commands above use `<main-harness-container>`, `<clean-harness-container>`, `<repo-path-in-container>` and `<path-to-soup-python>`. The real values for the owner's machine are in the local-only file `.local-notes/PLACEHOLDER-VALUES.md` at the repository root, which is never committed. Do not write those values into any tracked file, commit message or pull request. Follow the root `AGENTS.md` on `main`.

## 9. Status as built (appended 2026-11-12)

This section records what the branch `feature/soup-feature3-live-mentor` actually contains. It overrides sections 1–8 where they differ. Sections 1–8 are kept unchanged as the record of the plan.

**Base:** `eb44a23` (main, portable Python). **Current version:** 0.8.0, read from `package.json`; nothing else states the release number.

### Feature status

| # | Feature (section 2 of the requirements) | Status | Where it lives |
|---|---|---|---|
| 2 | Per-chat settings and overrides | Built (0.6.x) | SOUP tab, Settings view |
| 3 | Per-chat live SOUP view | Built | Live tab (trajectory, numbers, KL chart) |
| 4 | Gentle Mentor visibility and editing | Built | Mentor tab; message, current plan and amendments saved per chat |
| 5 | Gentle Mentor escalation wording | Built | Drift 1 exact sentence; drift 2 message, plan and amendments; drift 3 unchanged |
| 6 | Per-chat intervention toggle | Built | Gentle Mentor switch in the Settings view |
| 7 | Live drift telemetry | Built | Live tab and Details tab |
| — | Convergence (Appendix 11, first slice) | Partly built | Convergence tab: four-quadrant view, click-to-inspect |

### Placement (replaces the placement in section 7 where they differ)

- The SOUP tab holds five views: **Settings**, **Live**, **Mentor**, **Details**, **Convergence**.
- There is **no card** in Settings or in the composer. The trajectory card from the work in progress is removed from Settings; its content lives in the Live tab.
- The composer pop-up was removed from scope. The button beside "Read Only" belongs to the prompt-templates plugin.

### Storage (per chat, survives a Host restart)

- `qdev_soup_drift_state`: mentor carry and decision state (0.6.x).
- `qdev_soup_session_settings`: per-chat settings (0.6.x).
- `qdev_soup_live_history`: last 50 calculations and intervention markers.
- `qdev_soup_mentor_context`: Gentle Mentor message, current plan and amendments. An absent key means the default.

### Per-chat settings

- The Python interpreter is no longer a per-chat field. Each chat inherits the global interpreter, which the worker uses. The Runtime group is gone from the view.

### Appendix 11 (Signal focus and qualified convergence): what is and is not built

| Part | Status | Reason |
|---|---|---|
| 11.1 Dimensions | Partly: magnitude, focus, boundary distance, persistence | Outlier convergence and event interpretation need other evidence |
| 11.2 Mathematics | Built as illustrative: `r = min(1, KL / (2·threshold))`, `σ`, `1 − 2σ` | The threshold maps to 0.5 for this view only; the detector is unchanged |
| 11.3 Four-quadrant view | Built over rolling windows of five calculations | Outlier subsets are not built |
| 11.4 Click to investigate | Partly: SOUP calculations, and tool calls and results in each window read from DSH's own session events through the uiConversation seam (not verified in the live Harness) | Decisions, test outcomes and the event graph are not built |
| 11.5 Human meaning | Partly: hypothesis labels and the qualified near-boundary note | Event-specific interpretation needs the evidence in 11.4 |
| 11.6 Concept blindness | Not built | Needs the same evidence sources |
| 11.7 Integration | Preserved: the detector, the Gentle Mentor intervention and the existing telemetry path are unchanged | — |

Telemetry to OTEL is parked. The OTEL path is a DSH method for SOUP to emit telemetry, not a plugin read path.

### Verification

- Container suite (real Python worker, real Cordis fixtures): 83 of 83 at the last full run, before the Python-field removal. The client tests were re-run after it (26 of 26).
- Installed in the main Harness: `6feda14`, version 0.8.0. The boot log shows no SOUP import errors. The Web UI has not yet been checked for the newest tabs.

### Open items

- Web UI check of the Convergence tab, the Details tab and the removed interpreter field, in the live Harness.
- Appendix 11 items 11.4–11.6 need an evidence source (tool calls, decisions, outcomes). That is a DSH data question, not a SOUP one.
- Branch history contains `6528259 Update BACKLOG.md migration status`, which is not part of SOUP feature work. Check its origin before merging.


### 9a. Addendum (2026-11-12): convergence analysis and the Studio simulation

- **Control chart (11.5):** centre and limits from the average moving range, rules 1, 2 and 4. Separate from the decision threshold.
- **Repeated failures:** grouped by normalized failure type, plotted over time, and read as a tool-by-type table. One type on one tool repeating reads as a misconfigured or failing tool. One type across tools reads as a shared cause in the instructions or input. Both are hypotheses.
- **Elimination (11.6):** candidate explanations are dropped when the data contradicts them. What remains is not verified; a human or agent judges it.
- **Qualified convergence:** a candidate counts only with independent sources (calculations, tool telemetry). One source is observed, two corroborated, three or more convergent. Every level is a hypothesis to verify.
- **Studio simulation:** plugins/qdev-soup-drift/notebooks/convergence_simulation.py runs synthetic scenarios. It lives in the Studio container quatrus-development-marimo and is synced with scripts/sync-convergence-notebook.sh. The logic is mirrored by hand in Python; no parity test yet compares it with client.js.
- **Not built:** decision and test-outcome evidence, and the event graph.


### 9b. Close-out status (2026-11-12)

- **Installed:** 623fac8 (SOUP 0.8.0) in the main Harness. Config shows the plugin; no SOUP errors in the boot log since the last restart.
- **Verified in the Web UI:** plugin loads (user report), Settings, Live, Mentor and Details tabs, and the Convergence tab rendering with the chat waiting for data.
- **Built, not fully verified live:** tool-call evidence, failure-type grouping, the tool-by-type table, the control chart, qualified convergence.
- **Not built:** decision and test-outcome evidence; the event graph.
- **Judgment step:** concept blindness, the final reading of what remains, stays with a human or agent.
- **Open:** the outlier and normalization numbers (threshold maps to 0.5; outlier distance 0.2; cluster gap 0.05) need your confirmation.
- **Not part of this close-out:** the release and gotchas notebooks, which are out of scope per your instruction.


### 9c. Decision log and Appendix 11 status (2026-11-12)

- **Decision evidence (11.4, partial):** the Host records two DSH session events per chat: `plan/mode` (turned on or off) and `hook/result` (decision, exit code, stderr summary). The log is saved with the chat's history row and survives a Host restart. The Convergence view lists the decisions in the selected window. Test-suite result: 93 of 93 pass, including a Host restart test for decisions.
- **Wording:** the "Evidence available" note and the qualified-convergence note now name decisions as built. Test outcomes are still listed as not built.
- **Appendix 11 status as of this section:**
  - Built: magnitude and focus axes, coherence 1 − 2σ, separate raw/statistical/interpretation sections, clickable four-quadrant points, outlier clusters, control chart, tool and decision evidence in the window, qualified convergence with source families.
  - Partial: boundary proximity and persistence (shown as text, not as quadrant attributes); drill-down for contradictory observations; independence of points derived from one source.
  - Not built: test-outcome evidence, the event relationship graph, outlier subsets on the quadrant, domain-specific meaning text (11.5 examples), and tests for Appendix 11 Examples A, B and C.
  - Human or agent step: concept blindness judgment (11.6).
- **Not yet installed:** the decision-log change is not in the Harness. The installed build is still 623fac8.

### 9d. Appendix 11 gap round (2026-11-12)

- **Test outcomes (11.4):** the Host reads shell-like tool output (bash, shell, exec, run, command, terminal) for pytest-style "N failed" and node-style "# fail N" lines. The result is stored per tool call with its summary line. It is a text pattern, not a test runner's verified result, and the UI says so. Covered by a Host test that also checks a non-shell tool is ignored and the outcome survives a restart.
- **Boundary proximity and persistence (11.1):** each quadrant point's title now gives its mean, distance from the boundary, coherence and same-quadrant window count.
- **Contradicting readings (11.4):** the selected window lists readings that go against its pattern: crossings in a low window, readings below the boundary in a high window, and readings more than 2σ from the mean. The list states that all readings come from one KL series.
- **Evidence relationships (11.4):** a small graph shows the selected window with one spoke per evidence family (calculations, tool calls, decisions, test outcomes). Solid means evidence is present.
- **Qualified convergence (11.4, 11.5):** a failed test outcome is a candidate. It counts as "test outcomes" plus "calculations" when a reading was elevated during the run.
- **Boundary-hugging wording (11.5):** a focused, low window just under the boundary that persists for three or more windows gets the sentence from the Appendix 11.5 agent example.
- **Tests:** 96 of 96 pass (real SOUP worker, local Python with soup_cli on PYTHONPATH).

**Still not built:**
- Appendix 11.2 Examples A, B and C are not reproduced by the view. The view uses a 5-reading window and the examples use 3 readings, so the examples are checked by formula only, not by a test.
- Outlier subsets are shown in their own section, not on the quadrant (11.3 allows this).
- Test outcomes come from text patterns. A verified test-runner source is not built.
- Domain-specific meaning text (aircraft, creative writing) is not built.
- Concept blindness judgment (11.6) stays a human or agent step.
- The decision and outcome changes are not installed in the Harness.

### 9e. Install record (2026-11-12)

- **Installed:** commit ffdad12 (SOUP package version still 0.8.0; no version bump) into the main Harness with `dsh plugin --profile web remove` then `add` by full SHA, then a container restart.
- **Checked:** the plugin list shows qdev-trajectory-drift-soup@0.8.0. The installed dist and client contain the decision log, test-outcome and drill-down code. No SOUP errors in the container log after the restart.
- **Not checked:** the Web UI tabs, including the new drill-down sections, were not opened after this install. The Examples A–C check and the domain-meaning text are still open.

### 9f. Focus rule selectable (2026-11-12)

- **Decision:** the owner chose all three focus rules, selectable in the Convergence view. The default is the original rule (coherence ≥ 0.5), so existing readings are not re-labelled unless a different rule is picked.
- **Rules:** coherence ≥ 0.5 (default); coherence ≥ 0.7; dispersion σ ≤ 0.10. The 0.7 and 0.10 cuts are proposed values; set them in the code if the owner wants others.
- **Effect:** only the Convergence view's grouping changes. Stored readings, Host behaviour and qualified convergence are unchanged.
- **Test:** Example B (5-reading version) is labelled focused under the default rule and scattered under the 0.7 and dispersion rules. 100 of 100 tests pass.
- **Not yet done:** the choice is not stored. Each page load starts on the default.
