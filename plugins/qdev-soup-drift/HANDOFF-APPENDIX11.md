# SOUP Appendix 11: hand-off

Status date: 2026-11-12 (updated 2026-11-12, evening). Branch: `feature/soup-feature3-live-mentor` (origin: l00p3rl00p/qdev-dsh-plugins).

## Where things are

Every row says whether the state is **verified** (seen on the running Harness or proven by a passing check) or **not verified** (built, tested only with fakes, or not run).

| Item | State | Verified? |
|---|---|---|
| Branch `feature/soup-feature3-live-mentor` head | `af973fe` (pushed) | yes, in sync with origin |
| Mentor plan save at full size | fixed: body cap derived from `MENTOR_LIMITS.plan`; `dist/` rebuilt | not on the live Harness |
| Mentor "Use default" reverts the field | fixed client-side; loop from first attempt removed | not on the live Harness |
| Sidebar tab + guide button branch | `soup-sidebar-tabtype`, head `6547cea` (pushed) | not on the live Harness |
| Installed in the main Harness | `qdev-trajectory-drift-soup` installed from `6547cea` via `dsh plugin add`; profile lists it | install accepted; **Host restart not done**, so the new build is not live |
| Rollback anchor (last known-good live build) | `ffdad12` / package 0.8.0 (what was live before this install) | — |
| Tests | 100 of 100 pass on both branches | fakes only; not a live check |

Commits in order on the working branch: `63d9341` (decision log), `ffdad12` (Appendix 11 gaps), `642f762` (install record), the examples-test commit, `9ee6823` (focus rule), `425d8e5` (hand-off), `3dccf9f` (sidebar pane, hot key), `3fbd8fd` (hot key removed), `af973fe` (Mentor fixes).

Commits on `soup-sidebar-tabtype`: `cf6d591` (tab type), `6547cea` (guide entry opens the tab).

## What is blocked on you

- **Restart `dsh web`** (the install is accepted but the Host has not restarted). The hand-off's restart step. The agent cannot read the Host log or the auth token from this session.
- **Hard-reload the browser** after the restart (lessons §8).
- **Look for the SOUP button** in the chat guide, and confirm it opens the SOUP tab.

## Open decisions already answered

- Intent button: a SOUP button on the chat window, shown above the chat like Goal and Queue.
- Scope: per chat.
- Plan source: chosen by the user (like Plan or Goal), not the first message.
- Intent storage: an Intent event is wanted, but **no changes to DSH are allowed**. Use the installed plugin event/record pattern instead (see open item A).
- "Append" is named **Amend**; an amend adds an amendment.

## What is built

- Per-chat Live, Mentor, Details and Convergence views.
- Host records DSH `plan/mode` and `hook/result` as decisions; tool calls; shell-output test outcomes (text pattern, not a runner).
- Convergence: four-quadrant view with clickable points (title shows distance and persistence), control chart, repeated failures, tool-by-failure table, elimination, qualified convergence, outlier clusters, contradicting readings, test outcomes, evidence relationship graph, boundary-hugging sentence.
- Appendix 11.2 Examples A, B, C tested as 5-reading windows (the view's window is 5).

## Open items (in order)

**Done, kept for the record**

1. **Focus rule (resolved, commit 9ee6823).** Selectable in the Convergence view: coherence ≥ 0.5 (default), coherence ≥ 0.7, or dispersion σ ≤ 0.10. Default unchanged. Not stored between page loads. Spec 9f.
2. **Mentor plan size and "Use default"** (commit `af973fe`). Built and tested; the live check is item B.

**Next, in order**

A. **Resolved by decision: the first drift stays one sentence.** `reanchor.mjs` line 109 sends `FIRST_DRIFT_MESSAGE` on the first drift and reads the Mentor store only on the second drift. The owner chose to keep this rule (the first nudge is one sentence; the plan and amendments appear on the second drift). No code change. Edits reach the model at the second drift.

B. **Live check (needs you).** Restart `dsh web`, hard-reload, then: save a long plan in Mentor, press "Use default", confirm the text reverts, and confirm the SOUP guide button opens the tab.

C. **Per-chat Intent in SOUP's Mentor store.** Set, Amend (adds an amendment), pause, stop, and a SOUP button above the chat. **No DSH changes.**
   - **Storage (decided):** add one optional `intent` field to `MentorContextRecord` in `mentor-context.mjs`, in the existing `qdev_soup_mentor_context` domain (version 1, table `sessions`). Every existing record stays valid because the field is optional. Writes go through the existing `contextTable.put` path (`src/index.ts` ~line 1028), so the intent persists on disk and survives a Harness restart.
   - **DSH 0.2.2-rc.2 release notes (checked 2026-11-12):** the session state-record APIs are listed under *experimental plugins* only, so they do not open a route for SOUP. Discussion #6468 warns that a plugin appending a `user/message` in its pre-step handler can make a session unrestorable. Intent therefore stays out of the session log.
   - **Ladybug check:** the `codebase.ladybug` index confirms `mentor-context.mjs`, `saveMentorField` and `MentorTextField` are the relevant code. The database itself has no CLI or Python client installed here, so it was read as plain JSON.

D. **Resolved by research: persistence seam for Intent.** Installed plugins that write plugin records to the session log (`forge-session`, `action-cards`, `client-ui-forge`, `translator`) all sit under DSH's own experimental packages. The SDK says `appendPluginRecord` may be called only from `packages/experimental/`, and the `verify-plugin-record-callers` gate enforces that in the repo. The runtime only checks the record name, not the caller. So SOUP must not write to the session log. **Decision: Intent is stored in SOUP's own Mentor store on disk**, which already persists per chat. No session-log write, no DSH change.

E. **Domain-meaning text (11.5)**: aircraft, creative writing and governance wording. Blocked on the source text; the spec file does not contain the examples.

F. **Verified test-runner source.** Not built. Outcomes are still text patterns.

G. **Outlier subsets on the quadrant.** Not built. They appear in their own section, which 11.3 allows.

H. **Other SOUP tabs** (Settings, Live, Mentor, Details) still need the restrained layout pass. Decided: quieter, closer to the host (no new fonts or motion).

## How to generate readings in a live chat

The Convergence view waits for 5 calculations. Each calculation comes from a completed agent turn. Use a fresh chat and send these one at a time, waiting for each reply:

1. "List the files in the current folder."
2. "Read the first 20 lines of README.md and summarize them in two sentences."
3. "Count the lines in each .md file in this folder."
4. "Name three things this project does, one line each."
5. "Say 'ok' and nothing else."
6. "Say 'ok' and nothing else." (repeat until Convergence shows points)

To produce shell tool output that the test-outcome parser reads (a parser check, not a real test):

7. "Run this exact command with the shell tool and report the output unchanged: `python3 -c \"print('5 passed, 2 failed in 0.4s')\"`"

Then open the Convergence tab and check: a point title with distance and persistence; the "Test outcomes in this window" section showing "failed"; the "Evidence relationships" graph. A tool call that fails (for example, a command for a file that does not exist) should show under "Repeated failures" after a few repeats.

## How to test and install

- Tests need a Python with `soup_cli`. On this Mac: `PYTHONPATH=/Users/almowplay/qvolume/llm-runtime/tools/venvs/soup/lib/python3.11/site-packages SOUP_PYTHON=/Users/almowplay/.pyenv/versions/3.13.13-ssl/bin/python3 node --test test/*.test.mjs`
- `pnpm` is not on the Mac PATH. Use `./node_modules/.bin/tsc -p tsconfig.json` to build (this writes `dist/`, which is committed and required for install).
- Install by full SHA: `dsh plugin --profile web remove qdev-trajectory-drift-soup`, then `add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift'`, then restart the container. The remove-then-add gap is real; the boot log is the check.
- `scratchpad/reinstall.sh` does this for the Harness container `quatrus-harness-deepseek-harness`.

## Do not touch without asking

- Deleted notebook files (`notebooks/convergence_simulation.py`, `notebooks/plugin_gotchas.py`) and their untracked JSON. The user said to drop the notebook.
- `COMPONENTS.md`.
- Package version. No bump has been requested.

## Files to read first

- `src/index.ts`: Host, `observeTool`, `observeDecision`, `testOutcome`, `liveTable` schema.
- `client.js`: `convergencePoints`, `qualifiedConvergence`, `ConvergenceView` and the section components.
- `test/session-controls.test.mjs`: the Convergence tests at the end of the file.
- `SOUP-CHAT2-BUILD-SPEC-v2.md`: sections 9c–9e.
