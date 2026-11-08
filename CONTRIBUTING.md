# Contributing

This is the coordination repository for independently managed DeepSeek Harness plugins. Keep plugin implementation changes in the individual plugin repository; use a focused parent PR for shared documentation, backlogs, CI coordination, or the verified submodule pointer.

## Change ownership

- **Parent:** [BACKLOG.md](BACKLOG.md), [LESSONS.md](LESSONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [ENVIRONMENT.md](ENVIRONMENT.md), [RUNBOOK.md](RUNBOOK.md), [COMPONENTS.md](COMPONENTS.md), and [ROADMAP.md](ROADMAP.md).
- **Child:** plugin code, `README.md`, `ROADMAP.md`, `LESSONS.md`, source, tests, manifests, release artifacts and per-plugin recovery.
- **Reusable CI authority:** [git-shared-workflows](https://github.com/l00p3rl00p/git-shared-workflows).

## Contribution flow

1. Choose one plugin and read its roadmap, lessons, and actual package manifest.
2. Keep changes focused to that plugin. Preserve working code, tests, releases and the original Git history.
3. Run the plugin's actual verification command and inspect the package/loader contract, not merely the compile result.
4. Confirm browser mounting, click behavior, and persistent runtime effects separately when the change affects the UI.
5. Use a dedicated plugin PR for the implementation; update the parent verified submodule commit in a separate scoped PR once the repository topology is finalized.
6. Do not modify installed QDev components as a side effect of repository documentation changes.

## README convention

Use the [README template](https://github.com/l00p3rl00p/git-shared-workflows/blob/main/README.template.md) and its [contribution guidance](https://github.com/l00p3rl00p/git-shared-workflows/blob/main/CONTRIBUTING.md): centered title, concise purpose, one consistent badge row, working navigation links to real documentation, explicit prerequisites, tested commands, and no invented claims. Keep the standard document navigation consistent across repositories.
