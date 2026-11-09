# Library catalog

Standalone reusable libraries live under `library/<name>/`, separate from native DeepSeek Harness plugins under `plugins/<name>/`.

## Ownership

Each `library/<name>/` is an independently versioned **Git repository**, mounted into this catalog as a Git submodule pinned to a verified commit. Do not copy library source into the parent catalog or the DSH plugin tree. A parent commit records the tested child revision; library implementation, tests, and releases belong to its child repository.

## First library

**DSH Telemetry Library** — planned child path: `library/dsh-telemetry-library/`.

The independent TypeScript library is built first and validated independently. The native DSH service plugin is a separate product under `plugins/`, depending on a tested library release.

The library source is not yet mounted here: create/publish the independent child Git repository first, then add the verified submodule link. Do not replace this with a staged source copy or fake Git submodule.

## Release discipline

Test → secret scan → commit → package → verify checksum → publish. Run ShellCheck on changed shell scripts. Only declare live Collector/ClickHouse delivery after verifying the actual record in ClickHouse.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for repository ownership and release conventions.
