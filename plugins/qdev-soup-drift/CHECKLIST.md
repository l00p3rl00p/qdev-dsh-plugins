# SOUP checklist: what is done, against the plan, the hand-off and the spec

Status date: 2026-11-13. Branch `feature/soup-feature3-live-mentor`, head `825a641` (in sync with origin).
Sources compared: `SOUP-CHAT2-BUILD-SPEC-v2.md` (the plan, sections 1–9), `HANDOFF-APPENDIX11.md` (the hand-off), `SOUP-build-v2-final.md` (the spec decisions B1–B6 and amendments A1–A9).

Mark key: [x] done and in the repo · [~] built, not verified live · [ ] not built · [!] conflict, needs owner decision.

## A. Plan features (SOUP-CHAT2-BUILD-SPEC-v2.md, section 4 and section 9)

- [x] Feature 6: per-chat intervention toggle (label + proof test) — plan §4, status §9.
- [x] Feature 5: escalation wording (drift 1 exact sentence; drift 2 message, plan, amendments; drift 3 unchanged).
- [x] Feature 4: Gentle Mentor message, plan and amendments, editable per chat.
- [x] Feature 7: live drift telemetry per chat.
- [x] Feature 3: Live & Mentor view inside the SOUP tab (Settings | Live & Mentor switch).
- [x] Global settings page and per-chat settings (plan §1, items 1–2).
- [~] Appendix 11 §11.4 evidence: tool calls, decisions, test outcomes, failure grouping. Built; not verified on the live Harness.
- [ ] Appendix 11 §11.4–11.6 gaps: event relationship graph; concept-blindness evidence (needs an evidence source).
- [ ] Outlier subsets drawn on the quadrant. The plan allows them as their own section, so this is optional.
- [ ] Appendix 11 Examples A, B, C reproduced by the view (checked by formula; a 5-reading window test exists for each).
- [ ] Domain-meaning text §11.5 (aircraft, creative writing, governance). Blocked: source text is not in the repo.
- [ ] Verified test-runner source. Outcomes are still text patterns.

## B. Hand-off items (HANDOFF-APPENDIX11.md, "Open items")

- [x] 1. Focus rule selectable (commit 9ee6823; spec 9f).
- [x] 2. Mentor plan size and "Use default" fix (commit af973fe).
- [x] A. First drift stays one sentence (owner decision; no code change).
- [x] D. Persistence seam for Intent: SOUP Mentor store, no session-log write (decision; no DSH change).
- [~] B. Live check on the Harness: restart `dsh web`, hard-reload, save a long plan, press "Use default", confirm the SOUP guide button opens the tab. Owner-only.
- [ ] C. Per-chat Intent in the Mentor store (set, Amend, pause, stop; SOUP button above chat). Decided in the spec; not built.
- [ ] E. Domain-meaning text §11.5 (blocked on source text).
- [ ] F. Verified test-runner source.
- [ ] G. Outlier subsets on the quadrant (optional).
- [ ] H. Restrained layout pass on the other SOUP tabs (Settings, Live, Mentor, Details). Decided: quieter, closer to the host.

## C. Spec decisions not in the plan (SOUP-build-v2-final.md)

- [x] A1–A9: button location, per-chat scope, user-chosen plan, Intent storage, "Amend" wording, first-drift rule, storage field, actions, settings UI. Decisions recorded; A8 (set, Amend, pause, stop) and A9 (settings UI path) are not built.
- [x] B1 global escalation bypass switch (persisted config, not volatile) — commit 9ede47a.
- [x] B1 per-chat bypass switch (Mentor record) — commit 9ede47a.
- [x] B2 bypass on = never escalates; drift 1–9 first sentence — commit 9ede47a; tests in test/bypass.test.mjs.
- [x] B3 every 10th drift sends the full second-drift message — commit 9ede47a; tests.
- [x] B4 register: one entry per drift, per chat, its own domain `qdev_soup_register` — commit 9ede47a.
- [x] B5 register never cleared; no clear control — commit 9ede47a / 825a641.
- [x] B6 per-chat pop-up control and register view (inside the Mentor card) — commit 825a641.
- [ ] B4/B6 register as its own `conversation.view` View (allowed seam). Not built. [!] owner decision.

## D. Install and verification

- [x] Sidebar tab + guide button branch `soup-sidebar-tabtype`, head `6547cea` (pushed).
- [~] Installed in the main Harness: profile lists `qdev-trajectory-drift-soup@0.8.0`. Which commit is live is not confirmed. [!] see conflicts.
- [x] Test suite: 108 of 108 pass on `feature/soup-feature3-live-mentor` (fakes plus real worker tests).
- [ ] Live Web UI check: Live, Mentor, Details, Convergence, bypass control, register. Owner-only, after restart.
- [ ] Spec section 9 not updated for the escalation bypass (B1–B6) and the Register tab. The spec still describes only what was built before 2026-11-13.
- [ ] Owner check: three drifts in one chat show the three steps in order (plan §4, Feature 5).

## E. Release (plan §5)

- [!] Version: the plan says 0.7.0; `package.json` and spec §9 say 0.8.0. Keep 0.8.0 unless the owner says otherwise.
- [ ] Dated section appended to root LESSONS.md; one line each in plugin README.md and ROADMAP.md.
- [ ] Report per feature with SHA and open owner checks.

## Corrected against the code (2026-11-13)

- [x] Five SOUP views: Settings, Live, Mentor, Details, Convergence (client.js lines 1318–1324).
- [x] Evidence relationships graph (client.js `EvidenceRelationships`, ~line 765). Was wrongly listed as not built.
- [x] Outlier clusters shown in their own section (client.js `OutlierClustersSection`, ~line 874), as spec 11.3 allows. Was wrongly listed as not built; the chart-marking part is still open.
- [x] Escalation bypass control and drift register (in the Mentor card).
- [ ] Intent (set, Amend, pause, stop, SOUP button above chat): not built. No `intent` in client.js or the Mentor record.
- [x] Register as its own tab in the SOUP tab row (client.js `RegisterView`; commit `c00a914`). Reads the same register data as the Mentor card.
- [ ] Outlier points marked on the four-quadrant chart: not built.
- [ ] Layout restraint on Settings, Live, Mentor, Details: not done.
- [ ] Domain-meaning text (11.5): blocked on source text.
- [!] "Detector error" shown on the Live and Details views in the running build. Cause not confirmed. Likely the worker's Python interpreter (`python3`, src/index.ts line 273) cannot import `soup_cli`. Needs the Harness log to confirm.

## Dropped by owner decision (2026-11-13)

- **Sidebar tab and guide button** (`soup-sidebar-tabtype`, `6547cea`): dropped. It did not work and took too long. Not on the working branch; no live build depends on it.
- **Live-build conflict**: closed. Owner confirms build 8 is running (installed `qdev-trajectory-drift-soup@0.8.0`).

## Conflicts for the owner to decide

1. **Live build.** Hand-off: `6547cea` installed, restart pending. Spec 9b: `623fac8` live. Which is running?
4. **Version.** Plan §5 says 0.7.0; spec §9 and `package.json` say 0.8.0.
5. **Bypass and register.** In the spec (B1–B6) only, not in the plan or hand-off. Keep them as a new section, or fold them into §9?
6. **Register placement.** Inside the Mentor card (built) or as its own `conversation.view` View (allowed, not built)?
