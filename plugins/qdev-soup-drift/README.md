# qdev-trajectory-drift-soup

**SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.**

Version **0.6.3** is a native DSH package with a Cordis Host plugin, a first-class **SOUP Drift** page in native DSH **Settings**, a matching **Plugins** row configuration surface, native per-chat inherited settings, packaged locale/icon assets, and authenticated Host operations. It observes committed session events, compares assistant-output token distributions with the official SOUP Python functions, delivers up to two Gentle Mentor reminders after qualifying drift, and asks the human for clarification on the third qualifying drift. The native UI explains average KL drift relative to the active threshold and asks whether to reset the three-strike count or carry it across turns.

The package identity is `qdev-trajectory-drift-soup`. The source directory remains `plugins/qdev-soup-drift/` for continuity.

**📖 [What is SOUP? Understanding drift detection →](SOUP_CONCEPTS.md)**  
**🔧 [Development lessons and discovered seams →](LESSONS.md)**

## Current behavior and evidence

- **0.5.4 — runtime settings:** native volatile configuration updates reconfigure the detector without remounting; OFF cancels work and fences stale callbacks. [Baseline verification](BASELINE_VERIFICATION.md).
- **0.5.5 — Settings:** native master ON/OFF control, accessible state feedback, threshold/window controls, and reset actions. [Baseline verification](BASELINE_VERIFICATION.md).
- **0.6.2 — per-chat:** inherited global settings, sparse persistent overrides, per-chat isolation, and an authenticated Host route. [Feature 2 verification](FEATURE2_VERIFICATION.md).
- **0.6.3 — lazy startup:** plugin mount does not enumerate retained agents or replay transcripts; the first subsequent committed chat event activates only that chat. Earlier local verification reported 70/70 tests; **this branch's interpreter changes require a fresh run before deployment**. [Baseline verification](BASELINE_VERIFICATION.md).

The global master controls observation and interventions. The existing reminder, third-strike clarification, and qualified telemetry behavior remain unchanged. Historical build narratives and acceptance evidence live in the linked verification records, not in the install procedure.

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
docker exec -it <harness-container> dsh plugin --profile web remove qdev-trajectory-drift-soup
docker restart <harness-container>
```

If it still loads, inspect `dsh --profile web --dump-config` for a separate SOUP Cordis patch insertion and disable only that insertion through native profile configuration before restarting once. Preserve other plugins, sessions, and DSH data. See [shared plugin lessons](../plugin-lessons.md).

## Web plugin safety, health and escape

Every DSH Web plugin must follow the [shared plugin lessons](../plugin-lessons.md). SOUP's `pnpm run check:client` verifies its exact browser `client.js` syntax, loader identity, manifest and external imports against DSH's registered Web modules, then smoke-executes its factory under a guarded DSH-style loader. The [Docker packaging workflow](../../.github/workflows/dsh-soup-plugin-v2.yml) and [native verification workflow](../../.github/workflows/soup-native-verify.yml) both execute this deterministic check before packing. A clean Host install alone does **not** prove that the Web client mounted, connected or delivered an intervention; those require a real DSH session.

If a bad SOUP Web client makes DSH inaccessible, recover without the browser using `dsh plugin --profile web remove qdev-trajectory-drift-soup` from within the Harness container, then restart **once**. If SOUP is manually inserted into the active Cordis patch, remove only its entry as documented in the [shared recovery lesson](../plugin-lessons.md). Never delete the entire DSH profile or replace telemetry/correction plugins as collateral damage.

## Build, test, and install

1. In DSH, open **Plugins → Add plugin** and install the reviewed **0.6.3** build from an immutable commit SHA:

   ```text
   github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift
   ```

   This package ships with committed `dist/`; no build-on-install, `prepare`, or `allowBuilds` approval is required. Use the SHA containing the tested 0.6.3 build, not a moving branch.
2. The plugin defaults to `python3`. To enable drift detection, ensure the chosen interpreter has official `soup-cli` installed. If it does not, configure the plugin's `python` setting with the appropriate interpreter. No environment variable is required; the plugin's own `python` setting is authoritative.
3. After installation or replacement, restart the existing DSH Web process once. Confirm the plugin and its per-chat UI load, then observe an actual SOUP drift evaluation. Installation success or `--dump-config` alone is insufficient.

**If changing source:** Run `pnpm install`, `pnpm run verify` (including the full 0.6.3 test suite), and `pnpm run build` from `plugins/qdev-soup-drift`. Commit regenerated `dist/` in the same change. A changed runtime must pass its checks before deployment.

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
