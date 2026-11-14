# ACC repair spec — for the implementing model

Written 2026-11-11. Lives on `main` at `plugins/dsh-auto-code-correct/ACC-FIX-SPEC.md`:
https://github.com/l00p3rl00p/qdev-dsh-plugins/blob/main/plugins/dsh-auto-code-correct/ACC-FIX-SPEC.md
(also on branch `solution/acc-rc2.2-diagnosis`).
Scope: `plugins/dsh-auto-code-correct` only. Do not touch Telemetry Seams or SOUP.

## 0. Read this first

**The root cause is NOT confirmed.** Static reading narrowed it; the live browser evidence that would
confirm it was not captured (the Web UI needs the tokenized URL). Step 1 below captures it.
Do not skip Step 1 and do not report a fix as working without the Step 5 checks.

Rules for you:

- Work on a new branch cut from `main`. Never edit `working-install/acc-0.1.12-20261110` (install anchor).
- Never push to `the deprecated standalone ACC repository` (deprecated).
- No mocks, no simulated output. If a step fails, stop and report the real output.
- Do not change the correction engine, hygiene hook, LSP wiring, or `cordis.patch.yml`.
- Order is fixed: Test → Commit → Package → Verify SHA → Install (see `AGENTS.md`).
- Append to `.md` files; do not rewrite them.

## 1. Verified facts

| # | Fact | How verified |
|---|------|--------------|
| F1 | Both containers run DSH **0.2.2-rc.1** (not rc.2; rc.2 was published upstream 2026-11-11). | `dsh --version` in `<harness-container>` and `<clean-harness-container>` |
| F2 | Live Harness has `dsh-auto-code-correct@0.1.12` and `dsh-telemetry-seams@0.1.2` installed. Which git commit that 0.1.12 was built from is **unknown**. | `dsh plugin --profile web list` |
| F3 | Clean container has `dsh-auto-code-correct@0.1.3`. Unexpected version; origin unknown. | same command |
| F4 | The "webpage" on the ACC plugin page is **not ACC code**. DSH 0.2.2 added `BundleDetailSection`, which renders the package's README as a detail document on every plugin's page. Absent in 0.2.1-rc.5, present in 0.2.2-rc.1 and rc.2. | upstream `packages/client/ui-plugin-manager/src/client/BundleDetailSection.tsx` at each tag |
| F5 | The slot ACC uses, `plugins.bundle.config` keyed by package name, still exists unchanged in 0.2.2. The page shows the config section only when a client has registered that key. | upstream `PluginManagerPage.tsx`, `config-ledger.ts` |
| F6 | `engines.dsh` is not the cause: DSH checks with `includePrerelease: true`, so `>=0.2.1-0 <0.3.0` accepts 0.2.2-rc.1. | upstream `packages/boot/app-boot/src/plugin-compatibility.ts` |
| F7 | ACC config already has `.volatile()` fields. | `src/index.ts:124-135` |
| F8 | ACC is compiled against `0.2.1-rc.5` dev dependencies while running on 0.2.2-rc.1. | `package.json` devDependencies |
| F9 | `main` does not contain `lib/` (gitignored). Only `fix/acc-restore-native-options-20261110` carries a prebuilt `lib/`. | `git ls-tree`, `.gitignore` |
| F10 | No ACC errors in the last 3000 Host log lines. | `docker logs` grep |

## 2. ACC versus plugins that work in the same live Harness

Read from the installed packages in the live profile.

| Plugin | Works | Settings surface | Slot | Gated on a plugin-mounted remote? |
|--------|-------|------------------|------|-----------------------------------|
| dsh-codex 0.3.2 | yes | Settings page | `settings.section` | no |
| dsh-gemini-pool 0.9.1 | yes | Settings page | `settings.section` | no |
| dsh-superagent 0.1.0 | yes | Plugin row config | `plugins.row.config` (+ `configForms`) | no |
| dsh-anthropic-oauth 0.3.1 | yes | none (composer dock) | `conversation.composer.dock` | no |
| **dsh-auto-code-correct 0.1.12** | **no** | Plugin bundle config | `plugins.bundle.config` + `whileServed` | **yes: `remote.accReadiness`** |
| **dsh-telemetry-seams 0.1.2** | **no (reported)** | none (tab) | `conversation.view` | **yes: `remote.telemetrySeamsInventory`** |

What the two broken plugins share, and no working plugin does:

1. `await ctx.remote.$mount(TYPERT_REMOTE)` at the top of `apply`.
2. **All** UI registration sits inside `ctx.inject([..., 'remote.<namespace>'], ...)`.

So if the mount rejects, or `remote.<namespace>` is never provided on 0.2.2, nothing registers: no tab, no
options. That matches the symptom. It is the leading hypothesis, **not a proven cause**.

Second difference: the Plugins page hands a ready `form` to `plugins.row.config` entries but not to
`plugins.bundle.config` entries. ACC builds its own form through `configForms.whileServed(['auto-code-correct'])`.
If that namespace is not served, the options page never registers even when everything else is fine.

## 3. Steps

### Step 1 — SKIP unless the new package fails (revised 2026-11-11)

The owner has already tested the earlier builds; they did not work. Go straight to Step 2, then revised
Step 3, then Step 5. Come back here only if the **new** package fails the owner's test, and then ask for
exactly the items below, once.

Ask the human for an authenticated Web UI session (they open the URL printed by `dsh web`). Record, verbatim:

1. Browser console errors on load, filtered for `auto-code-correct`, `accReadiness`, `ModuleLoader`, `inject`.
2. From a DSH agent session, the two slot trees:
   - `cordis_inspect_query platform=client provider=Slots method=listSubTree input='{"root":"main"}'` — look for `plugins.bundle.config` key `dsh-auto-code-correct`.
   - the `conversation.view` subtree — look for the AutoCorrect tab.
3. Which commit the installed 0.1.12 came from (ask the human or read the install source in the profile's `package.json`).

Then pick the row:

| Observed | Meaning | Go to |
|----------|---------|-------|
| Console error naming a module or `require` | Browser bundle cannot load | Step 2, then fix the import; stop and report |
| No error; tab absent **and** options absent | Child injection never resolved (`remote.accReadiness`) | Steps 2, 3 |
| Tab present; options absent | `whileServed(['auto-code-correct'])` not served | Steps 2, 3, 4 |
| Both present | Not reproduced on this install; report and stop | — |

### Step 2 — Compile against the running version

> **HISTORICAL — do not execute.** This step records the 2026-11-11 diagnosis. Current `package.json` no longer pins versions: every `@deepseek-ai/dsh-*` devDependency uses the range `>=0.2.2-0 <0.3.0`, and `dsh-lsp-actions` uses `^0.5.17`. Exact versions are recorded only in `pnpm-lock.yaml`.

On your branch, set every `@deepseek-ai/dsh-*` devDependency from `0.2.1-rc.5` to `0.2.2-rc.1`, reinstall,
run `pnpm run typecheck`. Paste the real output. Type errors here are direct evidence of a changed contract;
fix only those in files under `src/client/` and `src/typert.*`. If versions cannot be installed, stop and report.

### Step 3 (REVISED 2026-11-11, supersedes the original Step 3 below) — Remove the remote service

Owner direction: ACC has no reason to mount its own remote. Verified against the source:

- The remote `accReadiness` has **one** consumer: the "Environment readiness" card on the options page.
- ACC's actual job (post-edit autofix and checks, LSP routing, hygiene hook, `/acc` commands) never calls it.
- The AutoCorrect tab reads `ctx.uiConversation.binding(...)`, not the remote.
- `/acc status <capability-id>` already reports tool availability through the native Commands seam.
- The Host side hand-calls the `@Remote` decorator "so rc.5's Gateway can discover" it
  (`src/readiness-service.ts:20-32`). That is an rc.5-specific workaround; the Gateway changed in 0.2.2.
- The remote is why the browser bundle carries Typert and zod (about 19,000 of its lines).

Do this:

1. `src/client/index.tsx`
   - Remove the `TYPERT_REMOTE` and `AccReadinessSnapshot` imports and the `dsh-api-remotes/client` type import.
   - `export const inject = ['slots', 'configForms', 'uiConversation']` (drop `remote`).
   - `apply` becomes synchronous, no `$mount`, no child `ctx.inject`, no returned disposer:
     call `registerAutoCorrectView(ctx)`, then keep the existing
     `ctx.effect(() => ctx.configForms.whileServed(['auto-code-correct'], () => ctx.slots.inject('plugins.bundle.config', ...)))`
     registration with key `dsh-auto-code-correct`, reading `ctx.configForms.get('auto-code-correct')`.
   - `createPluginPage` and `ConfigPage` lose the `loadReadiness` parameter. Delete the readiness state,
     `refreshReadiness`, its `useEffect`, and the whole "Environment readiness" `<section>`.
     The existing "Tool resolution" card already tells the operator to use `/acc status`; keep it.
   - Change nothing else in `ConfigPage`, `PreferenceToggle`, or the styles.
   - Reference: `git show origin/fix/acc-restore-native-options-20261110:plugins/dsh-auto-code-correct/src/client/index.tsx`
     is this same shape. Read it, but write the change on your own branch from `main`; do not merge that branch.
2. `src/index.ts`: remove the `AccReadinessService` import (line 18) and `new AccReadinessService(ctx, config)` (line 299).
3. Remove from git (`git rm`, on your branch only): `src/readiness-service.ts`, `src/typert.host.ts`,
   `src/typert.remote-client.ts`. **Keep `src/readiness.ts` and `test/readiness.test.ts`.**
4. `package.json`
   - `exports`: remove `./typert` and `./remote`.
   - `dsh.client.inject`: remove `@deepseek-ai/dsh-api-remotes`.
   - Remove `@deepseek-ai/dsh-typert-protocol` from `peerDependencies`, `peerDependenciesMeta`, `devDependencies`.
   - Remove `@deepseek-ai/dsh-api-remotes` and `zod` from `devDependencies` only if `pnpm run typecheck` and
     `pnpm run build` still pass without them. Report which you removed.
5. `tsdown.config.ts`: remove the `typertRemoteInfoRuntime` block, the `typert.host` and `typert.remote-client`
   entries, the `alias`, and `deps.alwaysBundle`. Keep the `__ModuleLoader__` banner/footer and `neverBundle` list.
6. `scripts/check-package.mjs`: delete the readiness/remote assertions (lines 24-82 region). Replace them with:
   - client source contains no `$mount`, no `remote.accReadiness`, no `dsh-typert-protocol`;
   - emitted `lib/client.js` contains only `require("react")` and `require("react/jsx-runtime")`;
   - client source still registers `plugins.bundle.config` with key `dsh-auto-code-correct` and `conversation.view`.
   Keep every unrelated assertion.
7. Docs: append one dated line to `README.md`, `ARCHITECTURE.md` and root `LESSONS.md` stating the readiness
   remote was removed and why. Do not rewrite existing sections.

Then go to Step 5. Step 4 still applies only if Step 1 showed "tab present, options absent".

### Step 3 (ORIGINAL, superseded — kept for history) — Isolate the three registrations in `src/client/index.tsx`

Goal: one failing dependency must not remove the other surfaces. Replace the single gated block in `apply`
with three independent scopes. Keep `ConfigPage`, `PreferenceToggle`, and all styles as they are.

1. **Options page** — `ctx.inject(['slots', 'configForms'], scope => ...)`. Keep the existing
   `whileServed` → `slots.inject('plugins.bundle.config')` → `register({ key: 'dsh-auto-code-correct' })`.
   It must not require `remote.accReadiness` or `uiConversation`.
2. **AutoCorrect tab** — `ctx.inject(['slots', 'uiConversation'], scope => registerAutoCorrectView(scope))`.
   Check what `registerAutoCorrectView` reads from its context; if it needs `remote`, treat it like item 3.
3. **Readiness** — wrap `ctx.remote.$mount(TYPERT_REMOTE)` in `try/catch`; on failure `console.error` with the
   real error and continue. Read `remote.accReadiness` in its own `ctx.inject(['remote.accReadiness'], ...)`
   and hand the loader to the options page through a small module-level holder. Until it is available the
   Environment readiness card shows "Readiness service unavailable" instead of blocking the page.

Keep `snapshot()` zero-argument. Keep `export const inject = ['slots', 'configForms', 'uiConversation', 'remote']`
unless Step 1 shows one of those services is missing; if so remove only that one from the module-level list.

Update `scripts/check-package.mjs` assertions to match the new structure without weakening them.

### Step 4 — Only if Step 1 said "tab present, options absent"

Add a second registration that mirrors the working `dsh-superagent` pattern: slot `plugins.row.config`,
key `dsh-auto-code-correct#auto-code-correct`, using the `form` prop the page passes in
(`PluginConfigViewProps.form`). Reuse the same `ConfigPage`. Do not remove the bundle registration.

### Step 5 — Verify, in this order, and report each gate separately

1. `pnpm run verify` (lint, format, types, tests, build, package check). Paste the tail of real output.
2. Commit. Build `lib/` and include it in the installable revision (see root `LESSONS.md`, packaging contract; no `prepare` hook).
3. Install into **`<clean-harness-container>` first**, never the live Harness first.
4. In the clean UI: options section visible on the ACC plugin page; toggle one switch; reload; value persisted;
   AutoCorrect tab visible; Refresh on readiness returns tools or a visible error.
5. Only after the human confirms step 4, install into the live Harness.

Escape if the UI breaks:

```sh
docker exec -it <clean-harness-container> bash -lc 'dsh plugin --profile web remove dsh-auto-code-correct'
```

## 3a. Install and packaging facts (added 2026-11-11 from the owner's terminal log) — INSTALLER IS FROZEN

**Do not change the install method. Do not add `prepare`. Do not touch `allowBuilds`. Fix the package only.**

The one install command, with `<SHA>` a full commit on `l00p3rl00p/qdev-dsh-plugins`:

```sh
docker exec -it <clean-harness-container> dsh plugin --profile web add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/dsh-auto-code-correct'
```

```sh
docker restart <clean-harness-container>
```

| Commit | Contents | Result | Source |
|--------|----------|--------|--------|
| `83eaca8` (anchor `working-install/acc-0.1.12-20261110`) | source only, **no `lib/`** | installs | repo `LESSONS.md`; `git ls-tree` shows no `lib/` |
| `9e23e78` | options source restored, **no `lib/`** | installs | owner's log |
| `ee9197a` | adds `prepare` build | **fails**: `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` | owner's log |
| `5d5dac3` (tip of `fix/acc-restore-native-options-20261110`) | prebuilt `lib/` committed | **owner installed and looked: did NOT work** | owner, 2026-11-11 |

**All earlier commits and versions are failed attempts, tested by the owner. Do not re-install, re-test, or
re-litigate any of them, and do not investigate version-number history. Build the new package forward.**

Consequences:

- A commit without `lib/` installs but has no `lib/index.js` to run. So "installed, README page shows, options
  missing" on the anchor is what a package with no runtime looks like. This is an inference from the file
  list, not an observed "Not running" status. It means the anchor proves the **installer**, nothing about ACC's UI.
- **Every commit you install must contain a `lib/` built from that same commit's source.** Before committing:
  run `pnpm install --frozen-lockfile && pnpm run build`, `git add -f lib`, commit, then rebuild once more and
  confirm `git status --short lib` is empty. If it is not empty, the committed `lib/` is stale; stop and report.
- `5d5dac3`'s `lib/client.js` contains no `$mount` and no `accReadiness`, and registers `plugins.bundle.config`
  and `conversation.view`. But its `lib/index.js` **still contains the Host `AccReadinessService`** with the
  rc.5 hand-decorator workaround, and `package.json` still exports `./typert` and `./remote`. Revised Step 3
  removes those; if the Host half fails to start on 0.2.2, that is the first suspect.
- Whether `5d5dac3`'s `lib/` was built from its own source is unverified.

Acceptance bar (owner's words): **installs → shows Running → native Options/Settings page is back.**
"Installs" alone is not a pass.

Since `5d5dac3` already had the client-side remote removed and still failed, the remaining difference this
spec makes is on the **Host** side: revised Step 3 items 2-5 (remove `AccReadinessService`, the Typert files,
the `./typert` and `./remote` exports) plus Step 2 (compile against 0.2.2-rc.1). Those are mandatory, not optional.

The owner is the tester. Give them exactly one SHA and the frozen command. Do not ask them to test anything else.

## 4. Decisions that belong to the human

- **The README "webpage" (F4).** It is native DSH 0.2.2 behaviour and appears for every plugin. ACC cannot
  switch it off. Options: leave it; or replace the packaged README with a short operator page. Do not attempt
  to hide it with DOM or CSS changes.
- **Upgrade to 0.2.2-rc.2.** Not tested here. Fix on rc.1 first.
- **Clean container's ACC 0.1.3 (F3).** Confirm whether to remove it before the clean install.

## 5. Not done / unknown

- Removing the remote is still unproven as the fix until Step 5 passes in the clean container.
  `fix/acc-restore-native-options-20261110` has the same client shape; whether it was installed and tested is unknown.
- The Environment readiness card is dropped, not replaced. If the owner wants it back, it needs a native seam
  (for example a Commands-backed action), as a separate change.

- Root cause unconfirmed (see section 0).
- Whether `fix/acc-restore-native-options-20261110` (which dropped the remote entirely) was ever installed and tested is unknown.
- Upstream changes to `packages/api/gateway/src` between rc.5 and rc.1 (about 100 lines) were not read; they may bear on `$mount`.
- No marketplace index is configured by default in DSH; the comparison in section 2 used the plugins installed in the live Harness instead.
- Telemetry Seams and SOUP were not analysed.

## Status — RESOLVED 2026-11-11

ACC 0.1.13 implements revised Step 3 (readiness remote removed on Host and client) and ships a prebuilt `lib/`. The owner confirmed it working in the clean test Harness on DSH 0.2.2-rc.1. Step 1 and Step 4 were not needed. This file is kept as the record of the diagnosis; the durable lessons are in the root `LESSONS.md`.
