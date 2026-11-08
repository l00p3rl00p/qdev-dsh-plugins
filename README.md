# QDev DeepSeek Harness Plugins

Consolidated home for the working DeepSeek Harness plugins. Each plugin retains its native package identity, source, tests and lockfile.

| Plugin | Directory | Package identity | Transferred version |
| --- | --- | --- | --- |
| Auto Code Correct (ACC) | [plugins/dsh-auto-code-correct](plugins/dsh-auto-code-correct) | `dsh-auto-code-correct` | 0.1.12 |
| SOUP Drift + Gentle Mentor | [plugins/qdev-soup-drift](plugins/qdev-soup-drift) | `qdev-trajectory-drift-soup` | 0.5.3 |

## Verification

GitHub Actions: [Working DSH plugins verification](.github/workflows/plugins.yml). ACC uses the existing strict package reusable workflow; SOUP typechecks, builds, runs its tests with the official `soup-cli==0.77.1`, checks native host/client contracts, packs and installs into a clean DSH profile.

Run locally from each plugin directory:

```sh
cd plugins/dsh-auto-code-correct && pnpm install && pnpm run verify
cd ../qdev-soup-drift && pnpm install && SOUP_PYTHON=python pnpm run verify
```

SOUP requires the official `soup_cli` Python package in the interpreter specified by `SOUP_PYTHON`. See each plugin's README for the installed QDev interpreter and targeted emergency removal command.

## Migration

This is a **source consolidation**, not an installation or QDev environment change. Existing source repositories and release tags are retained; their historical Git commits are not rewritten into this monorepo. The copied plugin code is pinned by the transfer PR, with package versions unchanged. Do not delete the legacy sources or change the live Harness installation solely because this repository exists.

The unfinished `dsh-telemetry-seams` scaffold, SOUP v1, and other experimental branches are intentionally excluded.
