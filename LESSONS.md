# DSH plugin lessons learned

**One authoritative lessons document for every DSH plugin in `plugins/`.** New discoveries belong here, with the plugin and DSH version identified. Do not create plugin-specific lessons files or duplicate this technical record elsewhere. Each plugin README remains a standalone *operator* guide, including its own emergency escape command; its architecture, environment and runbook document that plugin's actual implementation.

## Shared SDK dependency ownership — November 9, 2026

**Observed:** QClean ACC installs emitted pnpm peer warnings when its profile-installed manifest required DSH-owned services; the test launcher compounded the issue by explicitly installing `@deepseek-ai/dsh-lsp` and `@deepseek-ai/dsh-lsp-stdio` into the Web profile. Official DSH 0.2.2-rc.1 `app-boot/src/profile.ts` builds runtime resolution from the installed CLI dependency graph and profile additions, so profile-local pnpm peer resolution is not the authoritative Host module resolver.

- Declare DSH-provided Cordis, Host SDK and browser React services as platform peers with `peerDependenciesMeta.optional`; retain their version compatibility constraints. This follows Better Left Sidebar's existing third-party convention. Missing optional pnpm peer links do **not** prove runtime availability: separately validate required native services and real browser behavior.
- Do not install another copy of DSH's runtime or its LSP service providers to make a peer warning disappear. Check the already-installed Harness module resolution first and stop if a required service is genuinely unavailable.
- Keep actual independently owned packages (SOUP: `@deepseek-ai/schemastery`, `zod`; ACC: the authored correction support package) as normal dependencies. Tool executables such as `ruff`, `ty`, and `rust-analyzer` are distinct from JS SDK modules.
- Keep Host SDK packages required for compiling TypeScript in `devDependencies` only; no changes to the existing verification toolchain or original locked developer versions are required merely to relocate runtime dependency ownership.
- ACC, Telemetry Seams and SOUP manifests now follow the shared package boundary, but QClean end-to-end checks and SOUP's actual target installation remain **unverified** until run. Do not claim a zero-warning outcome in advance.

## Shared build and release lessons — ACC isolation, November 9, 2026

**Scope:** Applies to every DSH plugin. The observed instance was ACC 0.1.12 in the isolated DSH 0.2.2-rc.1 clean environment. These fixes were committed but still required a complete clean build and browser retest at the time of writing.

1. **Treat warnings as actionable diagnostics, not cosmetic output.** Trace each warning to its producing tool and actual configuration. Do not globally lower log levels or suppress warnings just to get a clean-looking build. A warning is not automatically a security vulnerability, but unexamined warnings weaken release confidence.
2. **Keep dependency build approvals explicit, scoped, and state-aware.** With pnpm 12.18.0, running `approve-builds` after declaring the four requested packages in a local `allowBuilds` policy emitted a warning that none was awaiting approval. Remove redundant approval calls, not the supply-chain checks. New or unexpected install scripts must still be inspected and explicitly authorized.
3. **Separate execution target from output module format.** A browser loader may require a CommonJS wrapper even though the Host runs ESM. ACC's browser bundle inherited the package's Node 22.19 compilation target, prompting tsdown's legacy-CJS warning. The fix is to specify the *browser bundle's* syntax target separately (ACC uses `es2022`) while retaining the loader-required format. Do not blindly convert a working browser bundle to ESM or hide the warning.
4. **Change all sides of a remote API contract together.** When a Host method declares zero arguments, its browser caller, type declaration, generated-equivalent remote descriptor, and package/regression checks must all agree. In ACC, sending an `AbortSignal` as a positional argument to `accReadiness.snapshot()` produced `expected 0 argument(s), got 1`. Cancellation belongs in the caller's UI lifecycle, not as an undeclared serialized method argument. The first source fix exposed a stale package test still requiring the old call: update the test oracle when the contract changes, without weakening the assertion.
5. **A green unit suite and successful bundle do not prove a releasable plugin.** ACC passed 32 unit tests and produced both bundles, then failed the package-contract gate. Required acceptance is: lint/format/types/tests → build → emitted bundle/package checks → native install → actual browser registration, click/action, session creation/reopen and reload. Record which gates genuinely ran; do not claim browser acceptance based on build output.

**Code authority:** [ACC implementation](plugins/dsh-auto-code-correct/), its [package check](plugins/dsh-auto-code-correct/scripts/check-package.mjs), [build configuration](plugins/dsh-auto-code-correct/tsdown.config.ts), and [QClean recovery runbook](https://github.com/l00p3rl00p/qdocker-compose/blob/main/cleanbuild/RUNBOOK.md). The standalone ACC GitHub repository and Scratchpad ACC copy are deprecated; do not use them as sources for fixes or release artifacts.

## Shared operational rules — reusable across every DSH plugin

### Configuration design: no `.volatile()` in new plugin configuration

Do not introduce Schemastery `.volatile()` into our plugin implementation as a default or as a shortcut to making a Settings page editable. Use and inspect the supported persisted DSH configuration lifecycle instead; a setting must survive close/reopen and process restart, and the running Host must read the saved value. The old SOUP investigation below records why a historical rc.5 UI appeared disabled and what was tried at the time; **it is historical evidence, not an instruction to copy that workaround into new plugins**. If the installed SDK exposes only the historical volatile seam for a particular UI, document that compatibility conflict and identify a supported persistence seam before changing production code. Do not silently contradict this policy.

### Distinguish plugin registration from an actually working UI action

1. **Host/plugin activation:** `dsh plugin --profile web list` checks package registration; `dsh --profile web --dump-config` checks that the plugin Loader entry is enabled in the active profile. Neither proves the browser registered the page or button.
2. **Client slot registration:** inspect DSH's actual slot tree using `cordis_inspect_query platform=client provider=Slots method=listSubTree input='{"root":"settings.section"}'` for Settings (or the equivalent actual `conversation.view` subtree). This checks the client slot, **not** whether the control handles clicks.
3. **Active button/action:** open the running Web UI, confirm the control is visible and enabled, click it, and verify the actual Host-side effect (remote call, saved setting, probe, or operation) with output/status evidence. A mounted control without a proven action is not operational.
4. **Durability:** reload the page, revisit the setting, restart only when the release plan calls for it, and check both persistence and behavior. Distinguish `registered`, `mounted`, `enabled`, `executed` and `persisted` in verification records.

These are universal acceptance boundaries. Put the plugin-specific button, service, configuration and tool names in that plugin's own runbook and lessons.

## 1. Recover a broken plugin without the Web UI

**Observed failure (ACC, DSH 0.2.1-rc.5):** the Host plugin and clean-profile package installation passed, but the Web client bundle contained `require("@deepseek-ai/dsh-typert-protocol/remote-info")`. The browser `window.__ModuleLoader__` did not provide this Node package, and the resulting loader exception made the DSH Web UI unusable. Installing an npm dependency inside Docker is not equivalent to registering a browser module.

**Mandatory escape:** DSH's native CLI must remain usable when the browser/plugin manager cannot load. From the Mac's terminal, remove *only the defective installed package* from the intended profile, then restart the Harness container **once**:

```sh
docker exec -it quatrus-harness-deepseek-harness bash -lc 'dsh plugin --profile web remove ACTUAL_PLUGIN_PACKAGE_NAME'
docker restart quatrus-harness-deepseek-harness
```

Use the real package identity from that plugin's `package.json` (e.g. `dsh-auto-code-correct` or `qdev-trajectory-drift-soup`). **Every plugin README must include the actual, copyable commands with its name**, not just link to this document—even a non-Web plugin should document its removal path. If the installed package is absent or removal fails, diagnose the active profile instead of deleting files speculatively.

**Separate configuration insertion:** removing a dependency may leave a manually inserted Cordis bundle in the active configuration. Inspect `dsh --profile web --dump-config` and the actual `$DSH_HOME/profiles/web/cordis.patch.yml` or `$DSH_HOME/cordis.patch.yml`, if present; remove only that plugin's insertion through supported configuration. Preserve all other plugins, sessions, tokens, profiles and Docker data. Do not delete `~/.dsh`, rebuild the entire QDev environment, or patch the installed upstream DSH source just to recover one plugin.

Document and verify the actual deployed profile's CLI escape **before release**, not after the interface breaks.

Reference: [DSH plugin manager](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md) · [DSH CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md).

## 2. Browser-load and package health are mandatory GitHub Actions gates

**Observed failure (ACC):** Host imports, typechecking and even clean-profile installation succeeded while the emitted browser JS still contained a broken external import. A package file existing or a Host Cordis fiber being active is not proof that a browser component mounted.

For every **Web-capable** plugin package workflow:

1. Build the exact Git commit under test, run lint/format/typecheck/tests, and package the *same* emitted artifact that was inspected. Use a versioned `.tgz`, not a mutable link or stale installed copy. Keep workflow artifact filenames derived from `package.json`.
2. Check `./client` export, `dsh.client.platform: web`, required `immediately` behavior, package identity, and `dsh.client.inject`. The client module's exported `inject` list is **separate** from `dsh.client.inject` and must include the Cordis services it actually uses.
3. Scan the **generated browser JavaScript** for unsupported static `require()` calls and external imports; compare against modules actually provided by DSH's Web loader. Fail closed on unsupported imports. Include a known-bad import regression fixture to prove the scanner detects the original defect. Do not rely solely on `tsdown` dependency declarations or `deps.onlyImport` (which may miss CommonJS `require()`).
4. Verify `window.__ModuleLoader__.load` package registration and smoke-execute the *emitted* client factory under a guarded native-style loader; check `apply` and `inject` exports. This is a deterministic **module-initialization** test, not proof of React mounting or live behavior.
5. Verify the packed file list and actual runtime entrypoints; clean-profile install with the target DSH version and inspect resulting registration. For ACC on rc.5 the package includes `lib/index.js`, `lib/client.js`, `lib/cli.js`, and `cordis.patch.yml`.
6. If CI has an actual DSH Web/browser test environment, check real client mounting and console/loader errors. Otherwise mark this **live-Web acceptance unverified**, not passed. Run a real disposable operation in the installed environment before describing a plugin as operational.

**Build implementation observations (ACC):** `@deepseek-ai/dsh-typert-protocol/remote-info` remained external despite tsdown bundling settings; importing its published pure JavaScript leaf allowed the dependency into the Web bundle. Keep target-loader compatibility verified rather than trusting imports resolved by Node. For the ACC workflow, extract version with a multiline script: `version=$(node -p "require('./package.json').version")`, then write `version=$version` into `$GITHUB_OUTPUT`; avoid fragile nested shell quoting. Run full verification before pack; ignored optional native build-script warnings should be reported without falsely treating them as a passing verification failure.

Reference: [tsdown dependency options](https://tsdown.dev/options/dependencies).

## 2.5. Historical SOUP rc.5 `.volatile()` investigation — not the current design rule

**Observed failure:** Settings page rendered but showed "Configuration is unavailable" with all controls disabled.

**Root cause:** DSH Settings (`@deepseek-ai/dsh-settings`) only exposes Config fields marked `.volatile()`. The plugin's Config had zero volatile fields, so DSH intentionally excluded it from the settings namespace directory.

**The seam exists:** `settings.section` slot provides first-class Settings pages. `ctx.configForms` service integrates with Config.

**Historical implementation used at the time (retain as evidence, not as a current build recipe):**

1. **Before building Settings UI:**
   - Read `@deepseek-ai/dsh-settings/README.md` for volatile field requirement
   - Check installed `dsh-superagent` for working Config-backed pattern
   - Use `cordis_inspect_query platform=client provider=Slots method=listSubTree input='{"root":"settings.section"}'` to see the slot contract

2. **Historical workaround: mark UI-editable fields volatile:**
   ```typescript
   export const Config = s.object({
     enabled: s.boolean().default(true).volatile(),  // ✅ UI can edit
     threshold: s.number().default(0.2).volatile(),  // ✅ UI can edit
     systemPath: s.string().default('/bin/tool'),    // ❌ Not UI-editable
   })
   ```

3. **Runtime must read volatile refs:**
   Volatile fields become `Volatile<T>` refs. Call `.get()` at operation boundaries, don't snapshot once.

4. **Client integration:**
   ```javascript
   inject: ['slots', 'configForms'],
   ctx.slots.register({
     name: 'settings.section',
     id: 'your-page-id',
     inject: () => ({ source: ctx.configForms.get(LOADER_ENTRY_ID) }),
   }, YourPage)
   ```

5. **Namespace ID is Loader entry ID:**
   Not the npm package name. Check `cordis.patch.yml` for the actual row `id`. Example: dsh-codex package name is `dsh-codex` but Loader ID is `llm-openai-codex`.

**Testing requirement:** User must test both Settings persistence (UI survives close/reopen) AND runtime application (detector uses new values). These are separate verifications.

**Detailed lessons:** `plugins/qdev-soup-drift/LESSONS.md`  
**Reference:** Schemastery `.volatile()` docs, `@cosmokit` Volatile types, dsh-superagent source

Reference: [tsdown dependency options](https://tsdown.dev/options/dependencies).

## 3. Native DSH UI integration and live readiness (ACC, rc.5)

- Use actual DSH native slots or `conversation.view` registration, never DOM watching/rewriting or a parallel Chat/Trajectory implementation. ACC's `conversation.view` is an ACC-owned supported tab; shipped Chat/Trajectory have no public child-operation renderer in the inspected DSH rc.5 release.
- A Web bundle needs its exported `./client` entry, `dsh.client.platform: web`, and `dsh.client.immediately: true` if the client must exist outside the package-detail page.
- `dsh.client.inject` loads package client dependencies. The client's exported Cordis `inject` declares services. In ACC, omitting `uiConversation` from `['slots','configForms','uiConversation']` prevented the tab from mounting even though the Host was active; additional services such as `remote` must be declared when used.
- Check the **live slot mount**, not only package presence. Separate Host activation, browser mounting, enabled settings, executable presence, version, project configuration, actual check execution, and observed telemetry. `installed` is not `ready`, and `configured` is not `operational`.
- Startup/project preflight should be read-only and lightweight. No implicit dependency installation or expensive retry loops; preserve edits on failed checks. Missing tool/project configuration is `unavailable`, not a code defect.
- Use actual probe evidence for health. Distinguish `configured`, `available`, `operational`, `unavailable`, `failed` and `unknown`. An empty tab, enabled toggle, or reachable endpoint alone must not be labeled healthy.

### Remote namespace lifecycle — ACC readiness dashboard, DSH 0.2.1-rc.5

**Observed error:** `cannot get property "remote.accReadiness" without inject`, while the native settings panel remained stuck on “Checking executable and project configuration readiness…”. ACC's client mounted `TYPERT_REMOTE` via `ctx.remote.$mount(TYPERT_REMOTE)` but then read `ctx.remote.accReadiness.snapshot(...)` from the *mounting fiber*. Cordis requires that service read to happen in a **child injection scope**, even if the service was created by that same plugin.

**Native pattern:** keep module-level `inject` limited to prerequisite services such as `remote`, mount the remote namespace, then register the consuming UI through `ctx.inject(['slots', 'configForms', 'uiConversation', 'remote.accReadiness'], (scope) => { ... })`. Read the service via `scope.remote.accReadiness`, not `ctx.remote.accReadiness`. Do **not** add `remote.accReadiness` to the module-level `inject`: that creates a self-dependency and leaves the mounting plugin pending. Preserve the mount disposer and component teardown ownership.

**Release gate:** test the *installed* settings page, click Refresh, confirm tool readiness loads (not just that the page mounts), and confirm a reload does not regress. A static/loader smoke test cannot prove child-fiber service availability. Record this in the package's CI tests and live acceptance checklist.

Evidence: [DSH upstream discussion #4681](https://github.com/deepseek-ai/deepseek-harness/discussions/4681), and ACC `src/client/index.tsx` / `scripts/check-package.mjs`.

## 4. Tool execution, session evidence and telemetry (ACC, rc.5)

- Do **not** copy/return `ToolExecutionResult` from `tools/execute` just to add metadata. DSH canonicalizes successful wrapper results and discards wrapper-added `meta`; the wrapper contract allows signal changes, not arbitrary result mutation.
- Never fabricate nested DSH `tool/*` or PTC events for plugin subprocesses.
- `tools/post-execute` may supply agent/model-visible contexts, but the inspected rc.5 hook has no supported metadata patch to enrich the parent persisted `tool/result`.
- A plugin-owned typed Session event can provide durable **plugin operation** evidence without pretending to be a parent tool event. A future additive `metaPatch` would still be needed for enrichment *of the parent result itself*. Do not declare either mechanism functional without verification.
- Test a fresh session with a real Python write, examine both the unchanged raw `tool/result` and the real ACC-owned event, and verify what the UI actually projects. The presence of a visible tab is not evidence of durable operation records.

### Native session-persistence seam: required events vs. ignorable plugin records

**Verified DSH API distinction:** Core events are appended through `session.append()` and participate in `SessionEventMap` / the core event schema. During restore, a reader rejects an unknown **required** event type outside `KNOWN_SESSION_EVENT_TYPES`; this prevents reconstructing a session while silently omitting indispensable state. A TypeScript augmentation of `SessionEventMap` in an external plugin does **not** make its type a universally known core event.

For plugin-owned auxiliary history, DSH provides **`appendPluginRecord(session, type, data)`** from `@deepseek-ai/dsh-session`, with payload types declared in **`PluginRecordMap`** rather than `SessionEventMap`. Types follow the `plugin:` namespace, e.g. `plugin:auto-code-correct/operation`. This API validates the record envelope, persists JSON-safe data and stamps the resulting event **`ignorable: true`**. A reader without the plugin can retain/skip the unknown record rather than refuse the entire session. The owner remains responsible for validating historical payloads before interpreting them; `pluginRecordOf(event)` provides the record projection.

**ACC discovery:** an agent reported that ACC used `session.append()` with `auto-code-correct/operation`, making its persisted record appear to a subsequent reader as an unknown *required* event when ACC was unavailable. This is a strong, source-supported mechanism for the reported reopen failure, but the exact installed ACC/DSH failure and remediation must still be confirmed by an enabled/disabled session replay; do not claim that existing history has been migrated.

**Reusable acceptance test:** append a plugin record during an actual session, reopen the same session with the plugin installed, then with it absent, and verify that core history still loads and the plugin record is retained. Re-enable the plugin and confirm its owner can read and validate that record. Separately handle any *existing* incorrectly written required events: changing future writes does not retroactively make prior events ignorable. Avoid rewriting or discarding historical logs without an explicit, tested migration.

This is a **DSH persistence/seam contract**, not merely an ACC UI bug. It applies to all plugins that add durable operational evidence.

**Source:** [DSH session `appendPluginRecord` and `pluginRecordOf`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/index.ts), [event type and `PluginRecordMap` declarations](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/types.ts), [known core session events and reader compatibility policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/known-event-types.ts).

These are release-specific findings, not a blanket declaration that DSH has no other transport or extension mechanisms. Inspect platform source/services for native capabilities before inventing a replacement integration.

## 5. Source, release discipline and cross-plugin safety

- Use native DSH services, SDKs and configuration before custom integration. Do not change installed DSH code, upstream source, or QDev deployment without explicit human authorization.
- Keep plugin manifest, bundle, version, tarball, workflows, README, architecture, environment, runbook and test evidence synchronized. Remove stale tracked release tarballs rather than packaging or installing ambiguous versions.
- Stage only files belonging to the intended change; Scratchpad may contain unrelated ACC, SOUP and Telemetry Seams work. Avoid changing other plugins in a focused release.
- Maintain existing Git hooks and checks. **ACC-specific:** a pre-commit `npm audit` check may fail without an npm lockfile; restore the default hook configuration before committing and do not bypass unrelated checks.
- A real temporary edit/probe is for development and release testing only: create, execute, inspect and remove it automatically; do not require humans to install a probe for normal operation.
- Record validated behavior, limits and exact versions here. Do not turn hypotheses about future versions into proved constraints. A deterministic CI gate protects against known package defects; live installed-profile/Web/session checks remain separate requirements.

## 6. Playwright-cli in the QDev harness container (observability verification, 2026-11-06)

**Context:** `playwright-cli` is installed at `/usr/local/bin/playwright-cli` (version 1.65.0-alpha-2026-10-30). It is used for automated screenshot capture of observability UIs (Prometheus, Grafana, OpenSearch Dashboards).

**Failure mode:** `playwright-cli open` exits with:
```
PlaywrightError: Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome
Run "npx playwright install chrome"
```
Even with `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` set. The CLI's internal lookup hardcodes `/opt/google/chrome/chrome` for the `chrome` channel and ignores the installed Chromium at `/opt/ms-playwright/chromium-1252/chrome-linux-arm64/chrome`.

**Root cause:** `playwright-cli` uses `playwright-core` v1.65.0-alpha which looks for the `chrome` *channel* (Google Chrome stable), not the Playwright-bundled Chromium. The Chromium binary at `/opt/ms-playwright/chromium-1252/` is a different distribution name.

**Working solution:** Use `--browser=firefox`. Firefox is fully installed at `/opt/ms-playwright/firefox-1569/firefox/firefox` and works correctly:
```sh
export PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
export XDG_CACHE_HOME=/tmp/xdg-cache
playwright-cli -s=<session-name> open --browser=firefox <url> &
sleep 8   # wait for browser daemon to start
playwright-cli -s=<session-name> screenshot --filename=/tmp/output.png
```

**Key details:**
- Run `open` in the background (`&`) — it starts a persistent daemon; the foreground process is the CLI client.
- The session name (`-s=`) must match between `open` and subsequent commands.
- `XDG_CACHE_HOME=/tmp/xdg-cache` is required; `~/.cache` is not writable.
- `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` must be set.
- Wait at least 8 seconds after `open` before running screenshot/fill/click commands.
- Use `playwright-cli -s=<name> snapshot` to inspect page structure before interacting.
- Use `playwright-cli -s=<name> find "text"` to verify elements are present before clicking.
- Grafana and OpenSearch Dashboards require authentication; credentials live in the Mac keyring (`GRAFANA_ADMIN_PASSWORD`, `OPENSEARCH_ADMIN_PASSWORD`) and are not injected into the harness container.

**Verified:** Firefox successfully navigated to Prometheus and captured a live graph screenshot at `/tmp/prometheus-graph.png` showing `container_memory_usage_total_bytes{container_name="quatrus-harness-deepseek-harness"}` over 1h.

## 8. Known backlog items (dsh-telemetry-seams, v0.2.0)

**BL-1: DSH_PROFILE reads as "unknown" in host Node.js process**
- Symptom: `profile: unknown` in every inventory output even though `DSH_PROFILE=web` is set at the container level.
- Root cause: `DSH_PROFILE` is set in the Docker compose environment but is not inherited by the DSH host Node.js process's `process.env` at the point this plugin runs.
- Fix needed: Read profile name from DSH's own API (`ctx` or a DSH config service) rather than `process.env.DSH_PROFILE`. Check `ctx.root` or the profile service for the active profile name.
- Why significant: the profile determines which composition, services, configuration, and plugin activation state are being inspected. Reporting `unknown` weakens provenance and makes it harder to distinguish a private QDev deployment from another DSH profile during incident diagnosis, support, and release verification. It does not currently change seam health calculations, but it can make otherwise-correct evidence ambiguous.
- Priority: medium — diagnostic/provenance correctness, not transport health.
- Verified broken: DSH 0.2.1-rc.5, 2026-11-06.

**BL-2: Browser "Run probe" button requires Typert Remote (v0.2.0 scope)**
- Symptom was: clicking "Run probe" in conversation tab returned 404.
- Status: FIXED in v0.1.0 via `InventoryService` + `TELEMETRY_REMOTE`. Retained here for record.
- Lesson: Never use `fetch('/api/tools/invoke')` from a browser plugin — that endpoint does not exist. Use `ctx.remote.$mount(TYPERT_REMOTE)` + child inject pattern (lessons §3).

**BL-3: Auto-probe on tab open — RESOLVED in v0.1.1**
- Delivered as an opt-in checkbox on the Telemetry Seams tab: **Probe automatically when tab opens**.
- Behavior: one probe per tab mount, cancelled on unmount, no background polling. The preference is persisted in browser localStorage.
- Overhead: at most one probe per tab open (normal probe timeout is ~4s); disabled by default until the user opts in.
- Follow-up: keep the setting visible and local; do not turn it into continuous polling without explicit product approval.
