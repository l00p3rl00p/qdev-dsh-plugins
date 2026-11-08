# ACC-specific lessons and installation contract

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
