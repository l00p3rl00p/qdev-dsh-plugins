# Rules for agents and contributors — read first

## This repository is PUBLIC

Anyone on the internet can read every file, every commit and every branch here. Write accordingly.

1. **Never commit secrets.** No tokens, API keys, passwords, credentials files, session files, cookies, or tokenized URLs. Not in code, docs, tests, logs, examples, commit messages or pull request text. If a secret is ever committed, treat it as leaked: rotate it first, then remove it.
2. **Never expose a user's private details.** No real names, email addresses, usernames, home-directory paths (`/Users/<name>`, `/home/<name>`), hostnames, internal URLs, or container and volume names from someone's own machine.
3. **Never hardcode a dependency on a private repository or private infrastructure.** No source links, clone URLs, workflow `uses:`/`repository:` references, install commands or documentation links that only work with access to a private repo. If a reader without special access cannot follow it, it does not belong here.
4. **Every plugin must be completely standalone.** A stranger must be able to install a plugin from this repository alone and have it start, with no other plugin from here installed and no private environment. Anything environment-specific (interpreter paths, tool locations, directories) must be a configuration value with a portable default or an environment variable, never a fixed path from one machine.
5. **Use placeholders in examples.** Write `<harness-container>`, `<profile>`, `<SHA>`, `<path-to-python>` instead of real local values.
6. **Private operational notes live elsewhere.** Machine layouts, container names, recovery steps for a specific deployment and test-environment quirks belong in the owner's private operations repository, not here.

Before every commit, read your own diff once for rules 1–3.

## Plugin work rules

- **Installable from a Git commit.** A plugin is installed with `dsh plugin --profile <profile> add 'github:l00p3rl00p/qdev-dsh-plugins#<SHA>&path:/plugins/<dir>'`, which runs no build. The commit must contain the built output. Check with `node scripts/check-installable.mjs`. The full checklist is in [LESSONS.md](LESSONS.md).
- **Order of work:** Test → Commit → Package check → Verify SHA → Install.
- **`main` is the only long-lived branch.** Work on a short branch, open a pull request. Working releases are tagged (`<plugin>-v<version>`); never move or delete a release tag.
- **"Installs" is not "runs".** Accept a change only when the plugin installs, shows Running, and its own UI works in a real Harness.
- **No mocks or simulated results** in tests or reports. Say what was actually run.
- **Documentation:** append and mark superseded text; do not silently rewrite history. `LESSONS.md` at the root holds lessons shared by all plugins; a plugin's own `LESSONS.md` holds only what is specific to that plugin.

## Known violations of the rules above

These exist today and are tracked in [BACKLOG.md](BACKLOG.md) under "Public-repo hygiene". Do not copy them as a pattern.
