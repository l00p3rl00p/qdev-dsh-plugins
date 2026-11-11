# qdev-trajectory-drift-soup

**SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.**

Version **0.6.3** is a native DSH package with a Cordis Host plugin, a first-class **SOUP Drift** page in native DSH **Settings**, a matching **Plugins** row configuration surface, native per-chat inherited settings, packaged locale/icon assets, and authenticated Host operations. It observes committed session events, compares assistant-output token distributions with the official SOUP Python functions, delivers up to two Gentle Mentor reminders after qualifying drift, and asks the human for clarification on the third qualifying drift. The native UI explains average KL drift relative to the active threshold and asks whether to reset the three-strike count or carry it across turns.

The package identity is `qdev-trajectory-drift-soup`. The source directory remains `plugins/qdev-soup-drift/` for continuity.

**📖 [What is SOUP? Understanding drift detection →](SOUP_CONCEPTS.md)**  
**🔧 [Development lessons and discovered seams →](LESSONS.md)**

## Baseline runtime-settings repair (0.5.4)

The accepted Settings UI persists configuration, but a live OFF test on 2026-11-06 found that 0.5.3 kept observing: its Host copied volatile values only at startup. Native Loader commits volatile references without remounting, so persistence alone is not runtime-application proof.

The runtime now supports detector reconfiguration, cancels obsolete workers, rejects late results across OFF/ON, and preserves the same Mentor instance and three-count guard. Sensitivity/window changes discard the unfinished comparison and reseed the fixed reference from committed history; they do not reset Mentor strikes. Four new deterministic regression tests pass alongside the eight existing policy/official-worker tests.

The Host now consumes the native owning-fiber `loader/volatile-update` event, rereads committed references, updates status, and reconfigures the detector without remounting. Master OFF stops the session feed/replay and reset writes, aborts pending human questions, and fences late answers after ON. Status reads remain available; already-delivered inbox messages are not retracted. The ordinary Python interpreter field retains the native remount behavior.

Four native Loader/Host/real-Python integration tests also pass, for **16 total tests**. They verify actual threshold/window changes, same-fiber updates without duplicate subscriptions, OFF suppression, pending-question cancellation, stale-result rejection, and preservation of the three-count guard.

The 0.5.4 repair was committed, SHA-verified, installed through native Plugin Manager, and verified in the existing profile: master OFF froze counters and rejected reset writes; ON resumed observation/detection without remounting or duplicating subscriptions. The installed 0.5.5 follow-up passes 35 tests, and the human confirmed the colored ON state is visible. See [baseline evidence](BASELINE_VERIFICATION.md) for exact verification limits. **Human scope decision:** SOUP receipt verification in ClickHouse and any telemetry redesign are DEFERRED and NON-BLOCKING for this phase, not PASS; leave that path unchanged and perform no further receipt/export/credential work under this scope. Feature 2 per-chat settings are installed and human-accepted in 0.6.2 as described below. Live authenticated writes, A/B isolation, remount persistence, the native order-40 SOUP tab, requested density and direct Reload all pass; the temporary Chat A test override was removed afterward. Later features have not been implemented.

## Lazy startup activation (0.6.3)

The human disabled 0.6.2 after it could halt container startup. The Host was eagerly enumerating every retained live agent during plugin mount and synchronously replaying each session snapshot before the container finished starting. That is not an acceptable background lifecycle.

Version 0.6.3 mounts only storage, routes, and event subscriptions. It does **not** enumerate agents, read session snapshots, construct per-chat runtimes, or launch SOUP workers at startup. Global setting changes also update only already-activated runtimes. A chat activates on its first subsequent committed session event; at that boundary, SOUP resolves only that chat, replays only events before the triggering event, then observes the trigger exactly once. Explicit settings reads may check live-agent existence but never replay a transcript or create a runtime. This preserves monitoring accuracy without putting retained-session work on the container critical path.

A native Loader/Host test mounts with retained agents, proves zero agent enumeration and zero snapshot reads through startup and a volatile settings update, then proves the first event activates and replays only its own chat. Full local verification passes 70/70 tests, including existing real-worker, OFF/ON, persistence, isolation, Mentor and Client coverage. The exact 0.6.3 artifact is installed; immediate remount verification shows zero activated agents, replayed events, evaluations or errors. Keep the internal SOUP master OFF until a real container restart is accepted.

**Commit/audit limitation (2026-11-06):** The shared pre-commit hook invokes `npm audit` although this package uses a pnpm lockfile; it fails with `ENOLOCK`. A separate `pnpm audit --audit-level=high` reports the already-pinned Zod 4.4.3 advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), also present through pinned DSH dependencies. This repair does not upgrade those shared dependencies or claim the audit passes. The human approved one-time bypasses for scoped SOUP commits after explicit secret/diff/tests checks; the shared hook remains unchanged and package/live acceptance is separate.

## Settings control audit and master visibility (0.5.5)

The master control is now a larger native button/switch with visible **ON/OFF** text, a high-contrast text-colored thumb, and distinct native success/warning outlines and tinted backgrounds. Text and thumb position distinguish states without relying on color alone; native keyboard focus is not suppressed. Both reset buttons and their handlers are disabled while the master is OFF, matching the Host's rejection rule. No new settings surface or intervention policy was introduced.

The full local verification passes **35 tests**:

| Existing page control | Executed verification |
| --- | --- |
| Master | Installed 0.5.4 OFF/ON observation/detection check; native Loader cancellation/guard tests; component mutation and ON/OFF state styling |
| Detector | Real worker pauses while native session/assistant counters continue; ON resumes with the same Mentor allowance |
| Global reanchoring | Real detections continue with no reminder/question while OFF; ON resumes at the retained strike count |
| Five sensitivity positions | Native form paths/revisions and actual Python-worker thresholds 0.05/0.10/0.20/0.30/0.40 |
| Baseline/window counts | Input commit/invalid-draft behavior; real worker batching at bounds 1 and 100; rejected native invalid candidates retain prior effective config |
| Reset Yes/No | Same-origin POST handlers, busy/OFF guards, Host storage-write payloads, and fresh-count versus carried-count next-turn behavior |
| About/source link/status | Disclosure handlers, current explanatory values, source-link properties, polling cleanup, and errors |

Twelve Client tests execute the shipped ModuleLoader/slots/components/handlers with small React/form/fetch scheduling stand-ins. Eleven Host tests use real native Loader/Session and official Python workers with in-memory external services; eight established policy tests and four deterministic runtime tests remain. These tests are **not** proof of real-browser rendering/navigation, keyboard operation, computed contrast, or profile-disk durability. The Python interpreter is ordinary Cordis configuration, not an editable field on this custom page. Installed visual confirmation remains required; restore any settings changed during manual testing.

## Per-chat inherited settings (0.6.2, Feature 2)

A compact native **SOUP** Conversation tab registers directly after Telemetry and presents all seven existing settings in dense cards. Reload stays in the tab header, there is no separate Close action, and each field keeps its control and **Use global** reset together on one row. Each field initially follows the current global value. Saving creates a sparse, revisioned override for that chat; **Use global** removes only that field so it immediately follows later global changes. Explicit `false`, preset `0`, and values equal to the global default remain real overrides. The global master is a hard cap and makes chat settings read-only while OFF.

SOUP stores only the sparse override record in the native `storageDomain` facility. It does not modify session headers, append invented events, read transcripts, or create/activate agents. The authenticated native Connection owner route validates the session, revision, field, bounds, content type, action header, and durable commit before applying settings. The existing reset action now also uses native Connection authentication when that optional service is mounted. The monitoring core still boots without the optional chat UI services.

Each live chat has an isolated detector/runtime generation and Mentor state. Changing A cancels/reseeds only A's detector work, preserves A's strikes, and does not change B. Global changes reconfigure only inherited fields. The original SOUP detector, Mentor message policy, third-count guard, and telemetry path remain byte-unchanged.

Local verification passes **69 tests**: the established 35 baseline tests, 14 sparse-store tests, 10 Client call-chain tests, and 10 native integration tests using real Cordis Loader/Session, official Python worker, native Connection owner admission, and native JSON storage close/reopen. The integration suite proves A/B isolation, current-global inheritance, individual reset, false/zero/equal-default presence, revision conflicts, durable cold-session reopen, global-master cancellation, per-chat question isolation, Python interpreter selection, core operation without optional UI services, and native route cleanup. Browser rendering/focus and installed-profile behavior remain separate live-acceptance steps; see [Feature 2 evidence](FEATURE2_VERIFICATION.md).

## Package contents

- `src/index.ts` → `dist/index.js`: native Host plugin, Config schema, session subscriptions, delivery tracking, escalation, and status route.
- `client.js`: plain ModuleLoader Web client registered into native Settings, Plugins row-config and session-scoped Conversation View slots; global forms use DSH `configForms`, while the per-chat tab uses the authenticated owner route.
- `locale/en.json` and `icon.svg`: packaged client presentation assets.
- `drift.mjs`, `runtime.mjs`, and `reanchor.mjs`: detector and intervention policy.
- `soup_worker.py`: bridge to official `soup_cli.utils.drift_alarm` functions.
- `cordis.patch.yml`: default Loader registration.

## Emergency escape — recover DSH without the browser

If the SOUP plugin breaks DSH Web during load, remove **only SOUP v3** from the installed Web profile. From the Mac Terminal:

```sh
docker exec -it quatrus-harness-deepseek-harness bash -lc 'dsh plugin --profile web remove qdev-trajectory-drift-soup'
docker restart quatrus-harness-deepseek-harness
```

If it still loads, inspect `dsh --profile web --dump-config` for a separate SOUP Cordis patch insertion and disable only that insertion through native profile configuration before restarting once. Preserve other plugins, sessions, and DSH data. See [shared plugin lessons](../plugin-lessons.md).

## Web plugin safety, health and escape

Every DSH Web plugin must follow the [shared plugin lessons](../plugin-lessons.md). SOUP's `pnpm run check:client` verifies its exact browser `client.js` syntax, loader identity, manifest and external imports against DSH's registered Web modules, then smoke-executes its factory under a guarded DSH-style loader. The [Docker packaging workflow](../../.github/workflows/dsh-soup-plugin-v2.yml) and [native verification workflow](../../.github/workflows/soup-native-verify.yml) both execute this deterministic check before packing. A clean Host install alone does **not** prove that the Web client mounted, connected or delivered an intervention; those require a real DSH session.

If a bad SOUP Web client makes DSH inaccessible, recover without the browser using `dsh plugin --profile web remove qdev-trajectory-drift-soup` from within the Harness container, then restart **once**. If SOUP is manually inserted into the active Cordis patch, remove only its entry as documented in the [shared recovery lesson](../plugin-lessons.md). Never delete the entire DSH profile or replace telemetry/correction plugins as collateral damage.

## Build, test, and install

Inside the DSH container, using the Scratchpad `main` checkout:

```sh
cd ~/scratchpad/plugins/qdev-soup-drift
pnpm install --ignore-scripts
SOUP_PYTHON=/home/qdev/llm-runtime/tools/venvs/soup/bin/python pnpm run verify
# Review and commit only intended source, tests, and documentation before packaging.
pnpm pack --pack-destination /tmp
sha256sum /tmp/qdev-trajectory-drift-soup-0.6.3.tgz
# Verify that digest against the recorded approved artifact, then install that exact file.
dsh plugin --profile web add /tmp/qdev-trajectory-drift-soup-0.6.3.tgz
dsh --profile web --dump-config
```

QDev's dedicated interpreter contains official `soup-cli==0.77.1`. Other environments must set `SOUP_PYTHON` to an interpreter containing `soup_cli` and configure the same interpreter in the plugin settings or `cordis.patch.yml`. CI uses `python` after installing the pinned SOUP package.

Install into the profile actually used by DSH Web. After adding or updating the package, restart the existing DSH Web process and open its token-bearing URL. Do not start a replacement Web server to validate this plugin.

`pnpm run verify` typechecks, builds, and runs the package tests. A successful build, package installation, or `--dump-config` row proves only static packaging and Loader registration. It does **not** prove that the browser client rendered, session events reached the host, SOUP evaluated a live trajectory, an injected message entered the agent inbox, or a human escalation completed.

## Native Settings and Plugins configuration

Open **Settings → SOUP Drift** for the global operational page. Version 0.6.3 registers that page through the SDK's `settings.section` slot and subscribes to the Host-owned `configForms` store. The installed package and row remain inspectable in **Plugins**, where the same component is exposed through `plugins.row.config`; no parallel settings service or independent application is created.

DSH 0.2.1-rc.5 renders a generic Settings glyph for third-party `settings.section` registrations because the live SDK contract exposes only `id`, `order`, and `label`. SOUP's own packaged icon appears in the page and Plugin Manager. The client does not patch the DOM or replace a shipped Settings section to imitate an unsupported custom navigation icon.

The configuration includes:

- master enablement;
- detector enablement;
- Gentle Mentor reanchoring;
- five sensitivity positions, including the numeric KL threshold;
- baseline and live-window message counts;
- a human-readable average KL readout relative to the active threshold;
- a clickable **Yes — reset to 0** / **No — carry 3 forward** accountability decision after escalation; and
- the Python interpreter used by the worker (ordinary Cordis configuration globally; available as a sparse override in the per-chat SOUP tab).

The Host exports a Schemastery `Config`, so values saved by native Settings or Plugin Manager are the same Loader configuration. The six volatile controls apply through the native Loader notification without remounting; ordinary configuration changes remount the entry. Acceptance requires saving values, reopening Settings, and confirming that both the rendered form and runtime status reflect the persisted values. Merely seeing controls is not persistence proof.

## Runtime status

The Host registers `GET /qdev-soup-drift/status` for status and an authenticated same-origin `POST` on the same route for the user-only reset decision. The Plugins row client uses these entry points to report:

- package identity and resolved configuration;
- lifecycle state and live-agent count;
- committed and replayed session-event counts;
- assistant-message, baseline, and live-window progress;
- detector evaluations, average and latest KL results, threshold ratio, human-readable severity, turn, and single-turn status;
- current and carried qualifying-drift counts plus any pending reset decision;
- reminder, escalation, and clarification delivery records; and
- recent errors.

Delivery is recorded as successful only after a native `agent/inbox/spliced` session event confirms that the SOUP-authored message entered the receiving agent inbox. A request to `agent.inject(...)`, a drift log, or a pending delivery record is not equivalent evidence.

## Verification levels

Keep these checks separate.

### 1. Static package verification

```sh
pnpm run verify
pnpm pack --pack-destination /tmp
```

Capture the command output, package version, tarball contents, and clean Git status. The tarball must contain `dist/`, `client.js`, `locale/en.json`, `icon.svg`, the runtime modules, worker, Cordis patch, and README.

The GitHub workflows define typecheck/build/test, required-file, packing, clean-profile installation, and Loader-row checks. Remote CI has not been rerun for 0.6.3 during this repair. Local test success and those CI jobs are not live operational acceptance tests.

### 2. Installed UI and persistence verification

In the authenticated DSH Web page:

1. Open **Settings → SOUP Drift**, then open the SOUP Plugins row and capture both native views.
2. Change enablement, sensitivity, baseline/window sizes, and Gentle Mentor behavior in Settings.
3. Save, close and reopen Settings. For volatile controls, verify runtime application without restarting/remounting.
4. Confirm the saved values appear in the form and `/qdev-soup-drift/status`; with master OFF, session/evaluation/intervention counters must stop despite new session events. Restore ON and verify observation recovers.
5. In chats A and B, open **SOUP settings** from each chat header. Override A only, close/reopen it, and confirm B and globals remain unchanged. Change a global value and verify only A's inherited fields follow it; use **Use global** on one A field and verify that field follows the latest global value.
6. Capture browser errors and Host load errors; absence of an error alone is not proof of event intake.

### 3. Live trajectory and delivery verification

Use a disposable conversation. Start with a clear instruction, for example:

> Our only mission is to explain how to sort a list of numbers. Stay focused on sorting algorithms.

With defaults (`baselineCount: 4`, `windowCount: 4`, `preset: 2`, threshold `0.2`), collect four relevant assistant messages for the fixed baseline, then at least four assistant messages on an unrelated subject for one comparison window. A particular wording is not guaranteed to exceed the threshold.

Capture correlated evidence from the same session and turn:

1. the status event counters and baseline/window progress increasing;
2. a completed detector evaluation with KL divergence and threshold;
3. a `SOUP DRIFT` Host log for an affirmative result;
4. reminder attempts one and two changing from `pending` to `delivered` with native inbox event sequence numbers; and
5. on the third qualifying same-turn drift, the structured human clarification prompt, its answer, and delivery of that clarification into the agent inbox.

After the third qualifying drift, automatic reanchoring pauses until the human chooses whether to reset. **Yes** clears the intervention count to zero. **No** durably carries three strikes into later turns, so the next qualifying drift escalates immediately instead of granting the model a fresh allowance. This policy count never changes the SOUP worker's measured KL value. Stale cross-turn worker results remain suppressed rather than reanchoring a newer turn.

The deterministic worker/policy test drives three independent drift windows and checks two reminder callbacks plus one escalation callback. It validates detector-policy integration but does not prove live DSH message delivery or browser escalation.

## Troubleshooting

- `ModuleNotFoundError: No module named 'soup_cli'`: use the dedicated QDev interpreter or another interpreter with the pinned official package; do not assume generic `python3` contains SOUP.
- No event progress in status: verify the correct Web profile is running, the package loaded without error, and the conversation produced committed assistant messages.
- Drift evaluations but no affirmative drift: the measured KL divergence did not exceed the selected threshold.
- Pending or failed reminder: inspect the live-agent count, delivery record, recent errors, and Host logs. A missing receiving agent is reported explicitly.
- UI assets missing after installation: inspect the packed tarball for `client.js`, `locale/en.json`, and `icon.svg`, then confirm the installed package is version 0.6.3.
- `qdev-soup-drift` in a profile package listing may be the historical local-link label. The Loader entry and canonical package identity must be `qdev-trajectory-drift-soup`.
- `node_modules/`, `dist/`, generated tarballs, and `.pnpm-store/` are local install/build state and should remain untracked.

The original experimental sources remain under `experiments/`. Version 0.6.3 preserves the human-accepted Feature 2 UI, isolation and persistence while removing eager retained-session replay from container startup. Feature 3 and later remain separate increments and are paused until the lazy-start repair is installed and restart-accepted.
