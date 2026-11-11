# Backlog — what to build next

This is the working queue of implementation work across plugin repositories. It owns sequence, integration chores, verification tasks and technical dependencies. The [Roadmap](ROADMAP.md) lists features only, without task details.

## Next build order

1. **Repository consolidation:** establish independent SOUP and Telemetry Seams repositories; convert all three plugin folders to real Git submodules, preserving sources and independently manageable histories.
2. **Parent verification:** adapt CI to recursively check out pinned plugin commits and run their package/build checks.
3. **Telemetry Seams:** verify actual configured-versus-operational evidence, including real data delivery, without adding transport ownership.
4. **SOUP CHAT 2.0:** implement the frozen per-chat features while retaining proven drift detection and Gentle Mentor behavior.
5. **ACC:** complete live settings persistence, readiness, and visible correction-result verification.

## Shared acceptance and release work

- Verify native Host loading, browser slot mounting, live control activation and actual action results separately.
- Verify persistence, scoped removal and restart behavior where applicable.
- Build and package the exact commit under test; verify checksums and clean-profile installation.
- Keep plugin work in that plugin's repository and update the parent's submodule reference only for verified revisions.
- Keep [general lessons](LESSONS.md) applicable across plugins; individual integration discoveries stay in each plugin's `LESSONS.md`.

## Release boundary

The backlog is **not** a public feature commitment. When preparing a release, draw only its upcoming user-visible features from the [Roadmap](ROADMAP.md); keep subtasks, investigation, infrastructure maintenance and test steps in this backlog or the individual engineering issue/PR.

## Migration status

These source directories are currently staged copies, not Git submodules. ACC already has a canonical standalone repository. SOUP and Telemetry Seams still originate in Scratchpad and need dedicated Git repositories before conversion.

## Public-repo hygiene — added November 11, 2026

This repository is public (see `AGENTS.md`). These items break "standalone" or "no private references". None is a secret; an audit on this date found no credentials and no personal identifiers.

| # | Where | Problem | Fix |
|---|---|---|---|
| H1 | `plugins/qdev-soup-drift/src/index.ts`, `cordis.patch.yml`, `test/policy.test.mjs` | Python interpreter defaults to a fixed path under one machine's home directory | Default to `SOUP_PYTHON` env, else `python3`; document that `soup-cli` must be importable; rebuild `dist/` |
| H2 | `plugins/qdev-soup-drift/src/index.ts`, `client.js` (0.5.3 on `main`) | Source link points at a private repository | Point at this repository (already done on the 0.6.3 feature branch) |
| H3 | `plugins/dsh-auto-code-correct/hooks.json`, `check.sh`, `test/discovery.test.ts` | Fixed home-directory paths | Derive from `DSH_HOME` / `HOME`; no literal user directory |
| H4 | `plugins/dsh-auto-code-correct/.github/workflows/ci.yml` | Checks out a private repository with a token | Remove the private checkout; the workflow must run with this repository alone |
| H5 | `plugins/*/README.md`, `RUNBOOK.md`, `ENVIRONMENT.md`, root `README.md`, `ENVIRONMENT.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `COMPONENTS.md`, `ATTRIBUTION.md` | Mention private repositories, a private test tool, container names and machine paths (about 30 files) | Replace with placeholders or generic wording; move deployment-specific steps to private operations docs |
| H6 | Telemetry Seams, SOUP | Not yet proven installed alone | Install each by itself in a clean Harness profile and record the result |
