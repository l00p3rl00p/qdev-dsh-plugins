# qdev-trajectory-drift-soup

**SOUP-powered trajectory drift detection and Gentle Mentor reanchoring for DeepSeek Harness sessions.**

Version **0.5.3** is a native DSH package with a Cordis Host plugin, a first-class **SOUP Drift** page in native DSH **Settings**, a matching **Plugins** row configuration surface, packaged locale/icon assets, and an authenticated runtime-status endpoint. It observes committed session events, compares assistant-output token distributions with the official SOUP Python functions, delivers up to two Gentle Mentor reminders after qualifying drift, and asks the human for clarification on the third qualifying drift. The native UI explains average KL drift relative to the active threshold and asks whether to reset the three-strike count or carry it across turns.

The package identity is `qdev-trajectory-drift-soup`. The source directory remains `plugins/qdev-soup-drift/` for continuity.

**📖 [What is SOUP? Understanding drift detection →](SOUP_CONCEPTS.md)**  
**🔧 [Development lessons and discovered seams →](LESSONS.md)**

## Package contents

- `src/index.ts` → `dist/index.js`: native Host plugin, Config schema, session subscriptions, delivery tracking, escalation, and status route.
- `client.js`: plain ModuleLoader Web client registered into native Settings and Plugins row-config slots, both backed by DSH `configForms`.
- `locale/en.json` and `icon.svg`: packaged client presentation assets.
- `drift.mjs`, `runtime.mjs`, and `reanchor.mjs`: detector and intervention policy.
- `soup_worker.py`: bridge to official `soup_cli.utils.drift_alarm` functions.
- `cordis.patch.yml`: default Loader registration.

## Emergency escape — recover DSH without the browser

If the SOUP plugin breaks DSH Web during load, remove **only SOUP v3** from the installed Web profile. From the Mac Terminal:

```sh
docker exec -it <harness-container> bash -lc 'dsh plugin --profile web remove qdev-trajectory-drift-soup'
docker restart <harness-container>
```

If it still loads, inspect `dsh --profile web --dump-config` for a separate SOUP Cordis patch insertion and disable only that insertion through native profile configuration before restarting once. Preserve other plugins, sessions, and DSH data. See [shared plugin lessons](../plugin-lessons.md).

## Web plugin safety, health and escape

Every DSH Web plugin must follow the [shared plugin lessons](../plugin-lessons.md). SOUP's `pnpm run check:client` verifies its exact browser `client.js` syntax, loader identity, manifest and external imports against DSH's registered Web modules, then smoke-executes its factory under a guarded DSH-style loader. The [Docker packaging workflow](../../.github/workflows/dsh-soup-plugin-v2.yml) and [native verification workflow](../../.github/workflows/soup-native-verify.yml) both execute this deterministic check before packing. A clean Host install alone does **not** prove that the Web client mounted, connected or delivered an intervention; those require a real DSH session.

If a bad SOUP Web client makes DSH inaccessible, recover without the browser using `dsh plugin --profile web remove qdev-trajectory-drift-soup` from within the Harness container, then restart **once**. If SOUP is manually inserted into the active Cordis patch, remove only its entry as documented in the [shared recovery lesson](../plugin-lessons.md). Never delete the entire DSH profile or replace telemetry/correction plugins as collateral damage.

## Build, test, and install

1. In DSH, open **Plugins → Add plugin** and install from an **immutable, reviewed commit SHA**:

   ```text
   github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift
   ```

   SOUP ships with committed `dist/`; the installation does **not** build source or require `prepare` / `allowBuilds` approval. Choose the SHA of the intended release, not a moving branch.
2. SOUP uses `python3` by default. For drift detection, that interpreter must have the official `soup-cli` package installed. If it does not, set the plugin's `python` configuration to an interpreter that does. `SOUP_PYTHON` is an optional deployment override, **not an installation requirement**.
3. After installing or updating, restart the existing DSH Web process once and verify the plugin loads, its UI appears, and live drift processing works. A successful package install or `--dump-config` entry alone is not runtime proof.

**If changing code:** In `plugins/qdev-soup-drift`, run `pnpm install`, `pnpm run verify` (including the package tests), and `pnpm run build`. Commit regenerated `dist/` alongside the source changes. Do not depend on build-on-install.

## Native Settings and Plugins configuration

Open **Settings → SOUP Drift** for the primary operational page. Version 0.5.3 registers that page through the SDK's `settings.section` slot and subscribes to the Host-owned `configForms` store, following the same native pattern as the Codex settings page. The installed package and row remain inspectable in **Plugins**, where the same component is exposed through `plugins.row.config`; no parallel settings service or independent application is created.

DSH 0.2.1-rc.5 renders a generic Settings glyph for third-party `settings.section` registrations because the live SDK contract exposes only `id`, `order`, and `label`. SOUP's own packaged icon appears in the page and Plugin Manager. The client does not patch the DOM or replace a shipped Settings section to imitate an unsupported custom navigation icon.

The configuration includes:

- master enablement;
- detector enablement;
- Gentle Mentor reanchoring;
- five sensitivity positions, including the numeric KL threshold;
- baseline and live-window message counts;
- a human-readable average KL readout relative to the active threshold;
- a clickable **Yes — reset to 0** / **No — carry 3 forward** accountability decision after escalation; and
- the Python interpreter used by the worker.

The Host exports a Schemastery `Config`, so values saved by native Settings or Plugin Manager are the same Loader configuration and are applied when that entry reloads. Acceptance requires saving values, reopening Settings, and confirming that both the rendered form and runtime status reflect the persisted values. Merely seeing controls is not persistence proof.

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

The GitHub workflows typecheck, build, test, inspect required package files, pack `qdev-trajectory-drift-soup-0.5.3.tgz`, install it into a temporary clean DSH profile, and verify the Loader row. Those CI jobs are not live operational acceptance tests.

### 2. Installed UI and persistence verification

In the authenticated DSH Web page:

1. Open **Settings → SOUP Drift**, then open the SOUP Plugins row and capture both native views.
2. Change enablement, sensitivity, baseline/window sizes, and Gentle Mentor behavior in Settings.
3. Save, close and reopen Settings, and restart/reload the profile as required by the native configuration host.
4. Confirm the saved values appear in the form and `/qdev-soup-drift/status`.
5. Capture browser errors and Host load errors; absence of an error alone is not proof of event intake.

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
- UI assets missing after installation: inspect the packed tarball for `client.js`, `locale/en.json`, and `icon.svg`, then confirm the installed package is version 0.5.3.
- `qdev-soup-drift` in a profile package listing may be the historical local-link label. The Loader entry and canonical package identity must be `qdev-trajectory-drift-soup`.
- `node_modules/`, `dist/`, generated tarballs, and `.pnpm-store/` are local install/build state and should remain untracked.

The original experimental sources remain under `experiments/`. Treat 0.5.3 as operationally accepted only after the installed UI, live event intake, detector evaluation, native inbox delivery, and human clarification flow have been captured in the real Web profile.

## Prebuilt install payload (added 2026-11-11)

The GitHub install no longer builds on arrival. `dist/` is committed with the source and the `prepare` script was removed, because pnpm blocks Git-hosted build scripts (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`). This supersedes the "Git build approval" and `prepare` paragraphs above: no `allowBuilds` entry is needed. After changing `src/`, run `pnpm run build` and commit the regenerated `dist/` in the same commit. Install a specific commit with `dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/qdev-soup-drift'`.

<details>
<summary>Historical install instructions — superseded, do not execute</summary>

The earlier build-on-install and pnpm approval procedure is retained only for historical context; current installation uses prebuilt `dist/` and an immutable commit SHA.

> **Superseded 2026-11-11:** the build-on-install text below is historical. `prepare` was removed and the built runtime is committed with the source, so no `allowBuilds` entry or Git build approval is needed. See "Prebuilt install payload" at the end of this file.

**Git build approval (native DSH Web):** First use **Plugins → Add plugin** with the Git spec above. If pnpm refuses the source `prepare` script, DSH's own Plugin Manager records the exact pending `allowBuilds` key and offers **Allow these scripts and retry**. Review the named source and approve **only the intended plugin**. DSH writes the approval into the active Web profile's `pnpm-workspace.yaml` and retries the install. You do **not** have to pre-edit YAML or install via a tarball from the clean test Harness.

As an alternative when the Web approval control is unavailable, use the exact key printed by the failed installer and explicitly add it under the *existing* profile `allowBuilds:` mapping (preserve other entries). The current pnpm 12 documentation permits a repository-wide `<package-name>@git+https://github.com/l00p3rl00p/qdev-dsh-plugins.git` key even for `github:` shorthand downloaded from `codeload.github.com`, but an exact commit key is narrower and preferred for a one-time approval. An approved `prepare` script runs on your machine with the profile user's permissions. Never use `pnpm approve-builds --all`, `dangerouslyAllowAllBuilds`, or `--ignore-scripts` to bypass this check.

The `path:` fragment selects the actual package inside this monorepo; the `prepare` script builds and verifies the Host and Web assets before installation. It uses the DSH runtime's existing SDK packages and does not install another Cordis or DSH service implementation. Restart the existing DSH process after a replacement.

</details>
