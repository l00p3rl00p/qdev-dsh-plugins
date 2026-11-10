# ACC-specific lessons and installation contract

## QClean install observation — November 10, 2026

Observed in the clean DSH 0.2.2 test environment:

- ACC **installs successfully**.
- The installed plugin renders its own embedded Web surface/page inside the plugin UI.
- That embedded Web surface is not currently useful to the operator and should not be treated as evidence that the prior native plugin pages survived.
- The previously available **options/tasking pages are absent** in this installed build.
- Therefore, keep these as separate facts: **installation succeeds**, but **the prior options/tasking UI is not present**.

## Protect known-good execution paths

- Once an execution path is proven to work, treat that behavior as **immutable by default**. Do not change it merely to improve diagnostics, observability, presentation, packaging, or operator convenience.
- Add observation around a working path; do not insert transformations into the live value/control path unless the change is explicitly required by the feature itself.
- Security handling belongs at the boundary where information is copied, persisted, or displayed. Preserve the authoritative runtime value until the consumer that actually needs it has received it.
- Experimental changes must be isolated in a branch, worktree, disposable profile, or test-only path. Do not alter the known-good implementation in place to test an idea.
- Before replacing working behavior, prove the replacement against the same real execution boundary. Mocks, static checks, and package success are not substitutes for the live behavior that was already known to work.
- If a regression appears after an ancillary change, restore the last known-good behavior first, then investigate the ancillary feature separately.
- Lessons and diagnostics should describe the engineering principle and validation boundary without exposing secrets, credentials, or unnecessary security-sensitive implementation details.

General DSH activation, browser controls, durable configuration, package gates, and emergency recovery are in [../../LESSONS.md](../../LESSONS.md). This file owns the **ACC-specific** implementation and its repeatable target-project configuration.

## Project installation kit — keep formatting and linting from fighting

Every ACC-enabled project needs one coherent formatting and linting policy, aligned to its actual language and existing configuration. The verified ACC source contains these portable starting points:

1. **`AGENTS.md`** — project/agent working contract. The ACC source's version requires **Test → Commit → Package → Verify SHA → Install** for plugin releases, but a host project's `AGENTS.md` must be merged with its existing instructions rather than silently overwritten.
2. **`.prettierrc.json`** — Prettier's actual formatting contract. Current ACC source uses `semi: false`, `singleQuote: true`, `trailingComma: 'all'`, and `printWidth: 110`.
3. **`eslint.config.js`** — ESLint's lint scope and rules; ACC's actual implementation uses TypeScript parser and excludes generated `lib/**` and `node_modules/**`. Explicitly disable conflicting stylistic autofixes or adopt the same formatter's choices; do not allow ESLint and Prettier to change the same syntax back and forth.
4. **`package.json` scripts/dependencies** — the third machine-readable piece of the tool contract: matching ESLint, TypeScript ESLint parser, Prettier, and explicit `lint`, `formatcheck`, and `format` scripts. Reconcile with the target project's dependencies and package manager.

Treat this set as an **installation/merge recipe**, not permission to copy ACC's plugin-development package.json wholesale into an unrelated project. Read existing config first, preserve the project's established formatting choices when possible, and choose one final authority for code style. The formatter formats; the linter checks correctness and diagnostics. Validate by running format → lint autofix → format check, and ensure that a second pass makes no new changes. Keep source/project configurations and emitted packages independently verifiable.

**Authoritative starting files:** [AGENTS.md](AGENTS.md), [.prettierrc.json](.prettierrc.json), [eslint.config.js](eslint.config.js), and [package.json](package.json). The actual installed files and scripts, not this prose, are the source of truth.

## ACC-specific live failures and checks

- A successful Host install is not proof the browser module can load. Inspect **emitted** client imports against the available DSH ModuleLoader modules.
- Missing `@deepseek-ai/dsh-lsp-stdio` can break ACC setup; verify prerequisite availability and native load, rather than treating a successful package build as proof of readiness.
- A visible ACC control is not proof of persistence. Save, reload and inspect the effective Host config, then perform a real supported edit and verify the correction result in the AutoCorrect tab.
- ACC's `remote.accReadiness` service needs the correct child Cordis injection scope; an active Host plugin does not prove the Refresh action populates the readiness view.
- A correction pass must remain bounded, visible, and nonblocking; avoid infinite retry/restart cycles.
- Keep real integrations and run results as acceptance evidence; do not replace them with mocks.

- **Clean Harness, Nov 9 2026:** ACC v0.1.12 loaded and the session UI continued working, but Environment readiness reported `client api: accReadiness/snapshot expected 0 argument(s), got 1`. The browser passed an `AbortSignal` as a positional argument to a zero-parameter Remote method. Fixed the browser invocation to `snapshot()` and aligned the client type declaration; the local `AbortSignal` still prevents stale UI updates. This is a readiness-view contract bug, **not** a reproduced session-loading failure. Fix committed, runtime reinstallation and browser recheck pending.

- **ACC clean-build warnings (Nov 9, 2026):** 32 tests passed and both bundles built, but `check-package.mjs` still asserted the previous `snapshot(signal)` browser invocation, rejecting the corrected zero-argument Remote API. Updated the test to assert `snapshot()`, a zero-argument Typert type/descriptor, and to reject accidental positional `AbortSignal` serialization. The `tsdown` CJS warning arose because the **browser bundle** inherited ACC's Node 22.19 target from `engines.node`. Explicitly target `es2022` only for the browser bundle, retaining CommonJS plus `window.__ModuleLoader__` (required by the current DSH browser). This corrects the build target, rather than globally suppressing warnings. Live package build and browser acceptance remain to be verified.
