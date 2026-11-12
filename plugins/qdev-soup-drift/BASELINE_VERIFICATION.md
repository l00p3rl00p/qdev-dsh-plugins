# SOUP baseline repair verification — 2026-11-06

## Scope and acceptance boundary

Feature 1 (native Settings UI/persistence) remains human-accepted. The human separately approved repairing the baseline runtime-configuration defect. No per-chat settings, live-view, prompt-editing, escalation-policy, per-chat intervention-toggle, or telemetry-UI feature was implemented.

The non-deferred checks are complete at the evidence levels below: installed OFF/ON behavior, current live observation/detection, 35 passing runtime/Client/native integration tests, and the human's confirmation that the colored ON state is visible. **Human scope override:** SOUP receipt verification in ClickHouse and any telemetry redesign are DEFERRED and explicitly NON-BLOCKING for this phase. They are not labelled PASS. Preserve the existing telemetry path unchanged; do not run further receipt/export/credential probes for this deferred item. Feature 2 still requires the separate native-gap and implementation-approval gates.

## Failure reproduced before repair

After the human saved master OFF in native Settings, the running 0.5.3 status still reported `enabled: true` and `observing`. Samples at 20:59:38Z and 20:59:48Z showed observed-event counts increasing from 2687 to 2707. Source read volatile references once into a startup snapshot and did not handle Loader updates.

## Native mechanism and bounded repair

Loader 1.0.6 commits volatile references without remounting, then dispatches `loader/volatile-update` to the owning fiber only. This contract was read in the installed Loader declarations and `_commitVolatile` implementation; the live Event inspector did not catalogue this event. Native Loader integration tests verify the actual dispatch, rather than assuming it from documentation.

The repair keeps the existing Settings surface, profile persistence, official Python detector, and Mentor policy. The Host now rereads committed references on that native notification. Detector changes cancel obsolete work, fence late callbacks, and reseed the fixed reference from committed history. Mentor state remains in the same instance, so these changes do not grant a fresh reminder allowance. Master OFF also aborts pending questions, rejects reset writes, and suppresses session observation/replay. Late answers remain cancelled across OFF/ON. Status reads remain available; already-delivered inbox messages are not retracted.

## Committed source

- `40a03a6`: runtime reconfiguration, deterministic regression tests, and pending-acceptance documentation.
- `afb6217426386350d8c043b5d06ba8b971bd9f7c`: native Host wiring, package 0.5.4, native integration tests, and updated documentation.

The worktree was clean after the second commit. No push was requested or performed.

## Executed validation

`pnpm run verify` (historical run used a deployment-specific interpreter; its path is intentionally omitted) passed:

- TypeScript typecheck and build.
- Host import/export check.
- Browser module syntax, loader identity, imports, and display metadata check.
- **16/16 tests**: eight established policy/official-worker tests, four deterministic configuration regression tests, and four native Loader/Host/real-Python integration tests.

The native tests verify same-fiber configuration updates, real worker threshold/window changes, OFF suppression, cancellation and late answers/rejections/results, ON recovery, unchanged subscriptions/routes/domain ownership, teardown, and preservation of the third-count guard. Only external Host services are in-memory fixtures; these are not browser or installed-profile acceptance tests.

An independent read-only teammate reviewed the fresh runtime/Host diff, found no blocking regression, and separately ran the 12 policy/runtime tests successfully. The Lead read the integration test and final diff and ran the full verification again.

## Package, SHA, and native installation

Sequence followed: **Test → Commit → Package → Verify SHA → Install**.

- Artifact: `qdev-trajectory-drift-soup-0.5.4.tgz`.
- SHA-256: `5c0b482cb69d9634472379fcb508a9bcd89983b4da6ffe7aa7b58af9bcdec5a8`.
- Package source: commit `afb6217426386350d8c043b5d06ba8b971bd9f7c`.
- Archive contents, metadata semantics, and all runtime/documentation bytes were checked against the reviewed source/build.
- Native Plugin Manager returned `application: applied`, version 0.5.4, and no application warnings. Its package-manager output included a peer-dependency warning; this is not recorded as an all-dependencies-clean result.
- Installed manifest and running Host status both reported **0.5.4**. No replacement server or manual profile-file change was used.

At 21:17:13Z the running status reported active/observing, enabled true, four subscriptions, zero recorded errors, and saved sensitivity position 3 / threshold 0.3 with baseline/window counts 5/5. Those are the effective saved values loaded by the repaired Host; they were not overwritten with schema defaults. No detector evaluation had completed since the upgrade at that sample, so post-upgrade live detection/delivery is not inferred from installation.

## Audit limitation and approved commit exception

The shared pre-commit hook invokes `npm audit` in a pnpm project and failed with `ENOLOCK`. A separate `pnpm audit --audit-level=high` reports the already-pinned Zod 4.4.3 advisory GHSA-mrhx-c7xc-m3w5, including transitive pinned DSH dependencies. This repair neither resolves nor claims a passing dependency audit.

The human explicitly approved one-time hook bypasses for the scoped SOUP commits. Explicit staged diff, Gitleaks, shell-script, large-file, and relevant test checks passed. The shared hook and its policy were not changed.

## Installed-profile master OFF — PASS

The human confirmed switching SOUP's own setting OFF while leaving the plugin activated. At 21:22:35Z and 21:22:51Z, the existing 0.5.4 status reported enabled false and trajectory/detector/Mentor disabled. Across intervening tool/session activity, counters stayed fixed: 383 session events, 50 assistant messages, 10,169 replayed events, three evaluations and three detected drifts. A reset POST addressed to a synthetic probe id was rejected with HTTP 409 / `soup-disabled`; it did not alter counters. Both samples retained `startedAt: 1793999760216`, four subscriptions, and zero recorded errors, proving this was a same-mounted-Host transition, not a restart. The human was immediately asked to restore ON.

## Installed-profile ON recovery — observation/detection PASS

After the human restored the setting ON, the 21:32:36Z sample reported enabled true, trajectory observing, 469 session events / 61 assistant messages, and four evaluations / four detected drifts (up from three while OFF). The Host retained `startedAt: 1793999760216`, four subscriptions, saved sensitivity position 3 / threshold 0.3 and counts 5/5, with zero errors. This establishes same-Host observation/detection recovery and saved-setting preservation. A status label alone is not treated as proof of a new delivered intervention.

## Settings control follow-up (0.5.5) — local verification PASS

The human appended two bounded requirements: test every existing page control against real runtime effects, and make the nearly invisible master visually distinguishable. The follow-up changes only Client master presentation/disabled-action guards and displayed package versions; detector and Mentor algorithms are unchanged.

The master now has ON/OFF text, a text-colored thumb, and native success/warning borders plus tinted backgrounds; focus styling is not suppressed. Both reset controls and their handlers refuse dispatch while master OFF. No additional settings page or feature was created.

The Lead read both teammates' test changes and ran the full typecheck/build/Host/client/test verification: **35/35 tests PASS**. Eleven native Loader/Host/Session/real-Python tests now cover all five actual thresholds, detector OFF/ON observation-versus-calculation behavior, global Mentor suppression/re-enable with retained strikes, baseline/window bounds 1/100, atomic rejection of invalid native values, and both reset choices' storage payloads and next-turn consequences. Fixture settings are restored where changed; no live profile settings were changed by those tests. The ordinary Python field is not exposed on this custom page and was not part of this page-control audit.

Twelve additional tests follow actual ModuleLoader/slot/component/handler code for all page inputs/buttons, native form paths/revisions, numeric commits, about disclosure, source-link properties, resets, errors, read-only/busy/OFF guards, and polling teardown. Their React scheduling/form/fetch are stand-ins. They do not prove browser rendering/navigation, actual keyboard behavior, computed color contrast, or profile-disk durability. The existing eight policy tests and four deterministic runtime tests remain green.

### Committed package and installed follow-up

- Source commit: `d57ebb6dbc19edb732e775f7c5c97160943e5a65`.
- Artifact: `qdev-trajectory-drift-soup-0.5.5.tgz`.
- SHA-256: `a586fc9f588a4b3c24753114585b20b5a68a9401a5618dc239f3fc73a05844d0`.
- Full verification passed 35/35 before commit. After commit, archive bytes/manifest were verified against source/build before native Plugin Manager installation.
- Plugin Manager returned `application: applied`, version 0.5.5, no application warnings (package-manager peer warnings remain disclosed).
- At 21:42:01Z installed manifest and running status both reported 0.5.5, enabled/observing, four subscriptions, preserved threshold 0.3 and counts 5/5, with zero errors. Installed Host, Client, detector/runtime/policy, locale, and icon hashes matched the reviewed artifact.
- Live Client inspection found the native SOUP Settings entry active. Slot registration and installed file hashes are not proof of rendered colors; refresh the existing GUI and obtain human visual confirmation.

## Human confirmation and latest non-deferred runtime check

The human reported "color is on" after being asked to refresh and check the master. This records visible colored ON-state confirmation only; no separate OFF-state visual, numeric contrast measurement, or browser keyboard assessment is claimed. Native OFF/ON state styling/handlers are covered by the component tests, and actual OFF suppression/ON recovery is evidenced above.

At 21:51:33Z the running 0.5.5 Host remained enabled/observing, with four evaluations/four drifts, four subscriptions, the same 0.5.5 start time, preserved threshold 0.3/counts 5/5, and zero errors. Source bytes of the official detector and Mentor policy remained unchanged; current native Loader/Host/real-worker tests preserve the verified injection callback and three-count guard. Eligible native inbox delivery was witnessed in the pre-repair baseline; a fresh post-0.5.5 inbox receipt is not inferred from counters or fixtures.

## Deferred telemetry item — explicitly not a blocker

A historical direct query failed when its private credential file was renamed; access was restored after the human supplied the new reference. The successful read-only retry returned no eligible Mentor receipt. No secret value was displayed and the excluded session was not investigated or used as evidence.

The human then instructed: hold SOUP receipts in ClickHouse, check everything else, and defer possible telemetry redesign rather than blocking progress. The planned disposable receipt probe was deleted before any agent was spawned. No feedback/export was submitted and no telemetry implementation or configuration was changed. No further warehouse or credential work is part of the current phase.

Native DSH session export is feedback-gated; collector health, generic DSH receipt, and status records are not proof of SOUP receipt. Future receipt/redesign work needs its own bounded scope and approval; do not fabricate feedback or bypass sharing authorization.

## Startup lifecycle regression and 0.6.3 repair

After Feature 2 acceptance, the human reported that enabling 0.6.2 could halt container startup and disabled the plugin. Source inspection found an eager mount path: `apply()` immediately enumerated `ctx.agents.list()`, attached every retained agent, synchronously called `session.snapshotEvents()` for each, and built per-chat detector/Mentor runtimes before container readiness. This is treated as a startup regression; Feature 3 is paused.

The 0.6.3 repair removes all agent enumeration and replay from Host mount. `agent/created` records identity only and does not replay a fresh runtime. Global volatile updates touch only already-activated runtimes. The first subsequent committed event resolves only its own receiving agent, replays only events strictly before the trigger, and observes the trigger exactly once. Explicit settings reads may check existence but do not construct a runtime or read a transcript. A native Loader/Host regression test proves zero agent-list and snapshot calls across mount and a settings update, followed by isolated first-event activation.

The repair passed 70/70 tests and staged hygiene, was committed as `96886e2ee2a28cc0a72f783b276ecae0ab03e1e9`, packaged as `/tmp/soup-startup-lazy-0.6.3.FZwH3h/qdev-trajectory-drift-soup-0.6.3.tgz`, and SHA-256 verified as `2a1e11db6cf97c935c8582cd8f59f18d7ab777c6ac60b9ffe731a9a295e52c7d`. Native Plugin Manager installed and activated 0.6.3. The immediate live mount reported zero live/activated agents, zero replayed events, zero evaluations and zero errors with exact source/installed byte matches. The human's internal SOUP master remains OFF; do not turn it back on until a real container restart confirms startup no longer stalls.

## Next gate

The native per-chat gap audit in `NATIVE_CAPABILITY_AUDIT.md` passed and Feature 2 was explicitly approved. The bounded implementation passes 69 local tests, including actual native authority/storage and real A/B worker isolation; see `FEATURE2_VERIFICATION.md`. Functional 0.6.0 live behavior passed, but its oversized modal was human-rejected; the installed 0.6.1 native tab was directionally accepted but needs the approved ~20% density reduction and direct Reload fix. The 0.6.2 correction completed Test → Commit → Package → Verify SHA → Install; the human accepted its density, direct Reload, live isolation and remount persistence. Feature 2 remains functionally accepted, but the package is disabled pending the 0.6.3 lazy-start lifecycle repair above. Preserve all documented test/visual/security limits. Remote CI has not been rerun. Do not resume Feature 3 until the startup repair passes a real restart.
