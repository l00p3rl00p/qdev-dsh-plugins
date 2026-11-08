# QDev DeepSeek Harness Plugins

Working DeepSeek Harness plugins maintained together. Each plugin keeps its own package identity, build, tests and documentation.

| Plugin | Path | Source | Version |
| --- | --- | --- | --- |
| Auto Code Correct (ACC) | [`plugins/dsh-auto-code-correct`](plugins/dsh-auto-code-correct) | [`dsh-auto-code-correct`](https://github.com/l00p3rl00p/dsh-auto-code-correct) | 0.1.12 |
| SOUP trajectory drift | [`plugins/qdev-soup-drift`](plugins/qdev-soup-drift) | `quatrus-scratchpad/plugins/qdev-soup-drift` | 0.5.3 |

These packages are copied from the current source trees. Transfer does not change deployed plugins or retire the original repositories. Run each plugin's own `pnpm run verify` in its directory. Keep the original repositories intact until the new repo's CI and live installation are verified.
