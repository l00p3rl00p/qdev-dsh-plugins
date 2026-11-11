# Feature 2 verification — per-chat inherited settings

Date: 2026-11-07. Installed package: 0.6.2. **Feature 2 PASS / human-accepted.** The functional build proved live writes, persistence and A/B isolation; subsequent bounded corrections moved it into the native Conversation tab, tightened density and fixed Reload. This document retains source/artifact/runtime evidence and does not claim Feature 3 or later work.

**Later lifecycle finding:** the human disabled 0.6.2 after eager retained-agent replay could halt container startup. This does not revoke the accepted Feature 2 behavior. The isolated 0.6.3 lazy-start repair is now installed with immediate inert-mount proof; the internal SOUP master remains OFF until a real restart is human-accepted. See `BASELINE_VERIFICATION.md`.

## Implemented boundary

- Native `conversation.view` contribution registers a compact session-scoped **SOUP** tab immediately after Telemetry, outside the transcript. It uses dense native-token cards, one-row field actions and a header Reload; no modal or distant Close control remains.
- All seven existing fields inherit current globals until a sparse per-chat override is saved: Python interpreter, master, detector, Gentle Mentor, sensitivity, baseline count and window count.
- Per-field **Use global** deletes only that override. Own-property presence preserves explicit `false`, preset `0`, and equal-default values.
- The global master is a hard cap. Chat controls cannot bypass it.
- Native `storageDomain` persists schema-validated, revisioned sparse sidecars keyed by SessionId. Session headers/events and global profile configuration are not changed.
- Native Connection owns the authenticated owner-only exact Fetch route. The existing reset action also checks native Connection admission when available.
- Each chat has an isolated runtime/detector generation and retained Mentor guard. Applying A's settings does not reset or reconfigure B.
- No score/history card, plan editor, escalation-message change, intervention suppression feature, or telemetry redesign was added.

## Source and platform proof

The implementation reuses the seams recorded in `NATIVE_CAPABILITY_AUDIT.md`: global Settings remains profile-scoped; session sidecars use native durable storage; the chat control registers additively in the native Conversation View slot; authentication uses native Connection. The original detector, Mentor algorithm/message policy and telemetry files (`drift.mjs`, `reanchor.mjs`, `runtime.mjs`, `soup_worker.py`) are unchanged from the accepted 0.5.5 baseline.

## Executed verification

`PYTHONDONTWRITEBYTECODE=1 SOUP_PYTHON=/home/qdev/llm-runtime/tools/venvs/soup/bin/python pnpm run verify` passes **69/69 tests**, plus typecheck, build, Host import, Client syntax/static metadata checks and `git diff --check`.

Breakdown:

- 35 existing baseline Client/Host/policy/runtime tests.
- 14 sparse-record unit tests: strict schema, own-property intent, A/B/C inheritance, false/zero/equal-default overrides, per-field reset, hard global cap, all bounds, unsafe keys, durable-before-runtime commit, same-chat serialization/stale revisions, different-chat independence, failed writes, cloning, handle recreation and corrupt-record fail-closed behavior.
- 10 Client call-chain tests: native Conversation View/tab registration, immediate authenticated mount read, compact header Reload, absence of modal/Close, seven fields, derived threshold, set/unset requests and revisions, current globals, read-only/global-OFF behavior, validation, conflicts, transport errors, busy guards, abort, unmount and A/B response fencing.
- 10 native integration tests: actual Cordis Context/Loader/Session, official Python worker, public native Connection owner admission/shared Fetch registry, and native Storage/StorageJson/StorageDomain with close/reopen persistence. The added lifecycle cases fence an old worker across same-session disposal/resume, force historical replay after closed-chat global changes, preserve two Mentor strikes, and reject late answers from replaced/reset questions.

The native integration proves:

1. Anonymous/non-owner settings callers cannot reach metadata or mutate storage; the legacy reset action rejects an unauthenticated POST. Owner operations reach the Host.
2. A-only sensitivity/count/Python/master/detector changes affect A's real worker/runtime while B retains inherited behavior.
3. Global updates affect inherited fields but do not erase explicit overrides or unnecessarily discard a fully shadowed chat's partial window.
4. Individual reset follows the latest global value.
5. A per-chat reconfiguration cancels only A's stale work/question; B's worker/question continues, and A's third-count guard remains.
6. Global master OFF freezes both chats, aborts stale work, rejects mutations and preserves durable override intent for recovery.
7. Sparse records survive native JSON domain/Host close and reopen, including a known cold session without transcript reads or model activation.
8. Same-session disposal suspends the retained runtime and invalidates its worker generation; reattachment after a closed-chat global change replays history exactly once and retains two Mentor strikes before the fresh third-strike escalation.
9. A replaced or manually reset question is aborted and removed; a late answer cannot inject stale clarification, reset a newer guard, or write persistence after OFF/ON.
10. The core still boots and detects drift without optional Connection/sessionPersistence UI services; routes/domains/peers/workers clean up.

## Prior 0.6.0 commit, artifact and native installation

Required order completed for the functional build: **Test → Commit → Package → Verify SHA → Install**.

- Source commit: `49d8505eac861e71f9a0969803943239463e05b6`.
- Artifact: `/tmp/soup-feature2-0.6.0.Z2onXZ/qdev-trajectory-drift-soup-0.6.0.tgz`.
- SHA-256: `edaec0391f3ffef39372086f9e37f35ac99c66dafdbf0572bb6f95bec65d7fce`.
- Packed manifest: 17 intended files, including built Host, Client, sparse settings module and verification documents; no tests, `node_modules`, credential names or environment files.
- Native Plugin Manager replaced 0.5.5 with 0.6.0, returned `application: applied`, kept the entry enabled/active, and reported no application warnings. Existing pnpm peer warnings remain disclosed.
- At 03:57:12Z on 2026-11-07, the running Host and installed manifest both reported 0.6.0. The Host was active/observing with four subscriptions, eight live agents, preserved human settings (preset 3 / threshold 0.3 / counts 5/5), and zero errors.
- Installed Host, Client, session-settings module, core detector/runtime/policy files and verification documents matched committed source bytes; installed `package.json` matched semantically (pnpm reordered fields).
- Live Client slot inspection showed active additive occupant `soup-session-settings` at order 35 in the session-scoped `conversation.session.header.actions` native slot.
- Human browser checks proved the dialog, authenticated 0.40 Chat A override and unchanged 0.30 global/Chat B values. The human then rejected the dialog placement and excessive scrolling; this is not Feature 2 visual PASS.

## 0.6.1 compact-tab correction

- Live native inspection selected the session-scoped additive `conversation.view` seam, whose existing order is Chat 0, Trajectory 10, AutoCorrect 20 and Telemetry 30. SOUP registers at order 40 with label **SOUP**.
- The floating header button and modal are removed. A fixed tab header keeps title, override count and Reload together; the scroll body uses responsive compact cards modeled on the native-token density of AutoCorrect and Telemetry.
- All seven fields retain global/effective/source context, controls and per-field **Use global**. Runtime controls span the view width so the interpreter path does not force narrow-card overflow.
- The correction changes Client presentation/registration and package/Host version only. The Host settings route, sparse storage, per-chat runtime isolation, detector/Mentor behavior and telemetry files remain unchanged.
- Targeted shipped-Client call-chain tests pass 10/10 against the new tab, including immediate authenticated GET, no dialog/Close, header Reload, all mutations/resets, global cap, validation, A/B/C response fencing and unmount cancellation.
- The 0.6.1 correction independently completed **Test → Commit → Package → Verify SHA → Install**.
- Source commit: `5d4c22165bb34ed0934fbbdad5457f9f22e90d0e`.
- Artifact: `/tmp/soup-feature2-0.6.1.5wvVck/qdev-trajectory-drift-soup-0.6.1.tgz`.
- SHA-256: `0cfa039be1bfbfa1640691098fdf34c7eeff2501887027becfc3cf557dcac3bb`.
- Native Plugin Manager replaced 0.6.0 with 0.6.1 and returned `application: applied`. At 16:58:17Z on 2026-11-07, installed and running versions were 0.6.1; source/installed Host, Client, settings and unchanged detector/Mentor files matched bytes. The Host remained active/observing with the human's preset 3 / threshold 0.3 / counts 5/5, four subscriptions and zero errors.
- The first post-install Client inspection found no connected page while the bundle was reloading; this is recorded as unavailable, not a slot PASS.
- After refresh, the human confirmed the tab direction but requested about 20% more density and reported that Reload did not fire. Therefore 0.6.1 is not visual PASS.

## 0.6.2 density and Reload correction

- Session-only header/body/card paddings, row height, gaps, badges, buttons, slider, inputs and toggles are reduced by approximately 20%; the accepted global Settings surface is unchanged.
- Reload now invokes the authenticated GET request directly from its click handler instead of incrementing an effect key. The existing busy guard, Loading label, AbortController and session/generation fencing remain.
- Targeted shipped-Client tests pass 10/10, including a real handler click that adds the Reload GET, duplicate-busy suppression, unmount cancellation and zero late state updates.
- Full 69-test verification, commit, package, SHA and native installation completed.
- Source commit: `66be104f817dbd7951e29ba9dc685197064c9443`.
- Artifact: `/tmp/soup-feature2-0.6.2.7xxj2v/qdev-trajectory-drift-soup-0.6.2.tgz`.
- SHA-256: `e31c98abcc825e81cf9dbeb52f2c66a8fefa91474279231df82235c94e65119b`.
- Plugin Manager replaced 0.6.1 with 0.6.2 and returned `application: applied`. At 17:28:09Z on 2026-11-07, source/installed bytes matched, the running Host reported 0.6.2, preserved preset 3 / threshold 0.3 / counts 5/5, remained active/observing with four subscriptions, and had zero errors.
- Live Client inspection after refresh confirmed active additive `conversation.view` occupant `soup-session-settings` at order 40, after Chat 0 / Trajectory 10 / AutoCorrect 20 / Telemetry 30.
- The human confirmed the approximately 20% tighter layout and direct Reload behavior are good.
- Chat A's 0.40 override survived Host/plugin remounts while Chat B and global remained 0.30, proving installed-profile persistence and isolation. After acceptance, the human used **Use global** to remove the test override and restore Chat A to inherited 0.30.

## Evidence limits and next gate

Client tests execute shipped ModuleLoader registration/components/handlers with minimal React/fetch scheduling stand-ins. Native integration dispatches the actual Connection shared Fetch handler in-process with a deterministic external BrowserAuth stand-in; it is not a real socket/cookie lifecycle. The installed 0.6.0 dialog rendered and real-cookie writes plus live A/B isolation passed, but the human rejected its placement and density. Client tests are not browser layout proof. The exact 0.6.2 artifact is installed and the requested dark-theme layout, direct Reload and remount persistence were human-accepted. Automated Client tests still are not general browser-layout proof; no separate light-theme or exhaustive keyboard accessibility sweep was requested. These documented limits do not block the accepted Feature 2 scope.

SOUP receipt verification in ClickHouse and telemetry redesign remain **DEFERRED / NON-BLOCKING**, not PASS. No telemetry code or path changed and no probe/export/credential work was performed.

Feature 2 is installed and human-accepted. Feature 3 may now start as a separate verified increment; do not mix Feature 4 or later work into it.
