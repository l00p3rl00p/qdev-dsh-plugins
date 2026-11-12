# Feature 3 handoff — compact per-chat live trajectory card (work in progress)

Status: **unfinished, not accepted, not installed.** Ported onto SOUP 0.6.3 without a version bump.
Typecheck, build and the full suite pass (76 tests, real Python workers). Nothing here has been run in a live Harness.

## What is in this branch

- Host: owner-only exact `GET /api/qdev-soup/session-status?sessionId=...` and a small in-memory per-chat read model
  (reference/window progress, pending, evaluations, drifts, latest KL, errors, Mentor state). No persistence, no transcript
  reads, no activation of an idle chat. Existence uses `agents.get(id)` (not `agents.list()`).
- Client: a read-only "Live trajectory" card at the top of the SOUP conversation tab, polling every 4 s while mounted,
  with per-request fencing and abort on Reload, chat change and unmount.
- Tests: native-Loader Host tests (owner-only, cold chats, A/B isolation, queued windows, OFF states, errors/recovery) and Client tests.

## Known open items

1. **`mentorError` is never set.** It is declared and read in `sessionLiveView`, but nothing assigns it, so the per-chat
   Mentor-error state does not work yet. Capture a failed `userQuestions.ask` per chat and prefer it over `escalated`
   without changing the three-strike guard. Add a test (chat B unaffected; reset/recovery).
2. **Worker timeout path is untested.** `onObservation` now reconciles `runningDetectors`; there is no timeout test.
3. **Scope.** About 700 lines. Consider porting the read model and route first, then the card.
4. **Replay cost.** The first event of a long retained chat replays its whole transcript at once. Not measured.
5. Version and docs were intentionally not changed. Bump and document only after acceptance.

## Before handing out a SHA

`node scripts/check-installable.mjs`, rebuild `dist/` from this commit, then install, confirm Running, and check the UI.
