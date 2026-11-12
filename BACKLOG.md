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

All plugin repositories have been established, and source directories are fully tracked as Git submodules with independent histories.
