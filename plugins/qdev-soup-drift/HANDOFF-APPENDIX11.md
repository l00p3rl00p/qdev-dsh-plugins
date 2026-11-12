# SOUP Appendix 11: hand-off

Status date: 2026-11-12. Branch: `feature/soup-feature3-live-mentor` (origin: l00p3rl00p/qdev-dsh-plugins).

## Where things are

| Item | State |
|---|---|
| Installed in the main Harness | `ffdad12` (package version still 0.8.0) |
| Pushed, not installed | the Examples A–C tests (test-only change) |
| Spec notes | `SOUP-CHAT2-BUILD-SPEC-v2.md` sections 9c, 9d, 9e |
| Tests | 99 of 99 pass (`node --test test/*.test.mjs`) |

Commits in order: `63d9341` (decision log), `ffdad12` (Appendix 11 gaps), `642f762` (install record), then the examples-test commit.

## What is built

- Per-chat Live, Mentor, Details and Convergence views.
- Host records DSH `plan/mode` and `hook/result` as decisions; tool calls; shell-output test outcomes (text pattern, not a runner).
- Convergence: four-quadrant view with clickable points (title shows distance and persistence), control chart, repeated failures, tool-by-failure table, elimination, qualified convergence, outlier clusters, contradicting readings, test outcomes, evidence relationship graph, boundary-hugging sentence.
- Appendix 11.2 Examples A, B, C tested as 5-reading windows (the view's window is 5).

## Open items (in order)

1. **Decision needed: Example B focus.** The spec says "magnitude without focus" (scattered). The view uses coherence ≥ 0.5 as FOCUSED, and Example B's coherence is 0.639, so the view says FOCUSED/HIGH. Options: keep the threshold and say so in the spec, or change the focus rule. Changing it changes the quadrant for every chat, so get approval first.
2. **Live check of the drill-down.** Generate readings (see below), then open Convergence and confirm the new sections appear. Not yet seen on screen.
3. **Domain-meaning text (11.5)**: aircraft, creative writing and governance wording. Not built; wording only.
4. **Verified test-runner source.** Not built. Current outcomes are text patterns.
5. **Outlier subsets on the quadrant.** Not built; they appear in their own section, which 11.3 allows.
6. **Install of the test-only change.** Not needed: `dist/` and source are unchanged since `ffdad12`.

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
