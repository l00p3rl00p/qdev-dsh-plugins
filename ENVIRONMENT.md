# Environment

## Execution environments

| Environment | Purpose | Boundary |
| --- | --- | --- |
| GitHub source repository | Source, documentation and PR review | Does not deploy a plugin |
| GitHub Actions | Test, build, package, clean-profile registration | Temporary runners, not the live QDev session |
| DeepSeek Harness Web profile | Installed native plugin execution | Requires explicit deployment and in-session acceptance |
| Private source repository | Working experiments and original source snapshots | Not automatic promotion to a release |

The plugin workflow uses **Node.js 24**, **pnpm 10**, and, for SOUP tests, **Python 3.13** with official `soup-cli==0.77.1`. Runtime compatibility is defined by each plugin's `package.json`. The SOUP worker needs a Python interpreter with `soup_cli`; the configured path is environment-specific.

## Paths

- Parent cross-plugin CI: [`.github/workflows/plugins.yml`](.github/workflows/plugins.yml)
- ACC package: [`plugins/dsh-auto-code-correct/package.json`](plugins/dsh-auto-code-correct/package.json)
- SOUP package: [`plugins/qdev-soup-drift/package.json`](plugins/qdev-soup-drift/package.json)
- Telemetry package: [`plugins/dsh-telemetry-seams/package.json`](plugins/dsh-telemetry-seams/package.json)
- QDev runtime and container deployment instructions remain in the deployment's own startup tooling, not this coordination repository.

## Configuration rules

Use the supported native DSH configuration lifecycle, inspect Loader entry IDs rather than guessing from npm names, and verify the saved value influences runtime behavior. Do not treat the historical SOUP `.volatile()` workaround as a general recipe. See [general lessons](LESSONS.md).

## Source transfer

This PR stages source directories; **the planned independent Git submodules do not yet exist here**. Once migrated, clone with `git clone --recurse-submodules` or run `git submodule update --init --recursive` in a checked-out parent. Before that migration, plain clone is appropriate.
