# Runbook

## Select one plugin

Use [Components](COMPONENTS.md) to choose the plugin, then follow **that plugin's own README and runbook** for build, configuration, installation, and targeted recovery. The parent does not install every plugin as a group.

## Verify staged code

```sh
cd plugins/dsh-auto-code-correct
pnpm install
pnpm run verify
```

```sh
cd plugins/qdev-soup-drift
pnpm install
# SOUP_PYTHON must point to an interpreter with the official soup_cli installed.
SOUP_PYTHON=python pnpm run verify
```

```sh
cd plugins/dsh-telemetry-seams
pnpm install
pnpm run verify
```

These commands operate on source. They do not install or replace anything in the running Harness. Run the build using each plugin's documented dependencies and package manager.

## Strict source-to-release package contract

Every plugin release must pass **all** required checks, in sequence. A green unit test or package-install row alone is not sufficient.

1. **Exact source:** check out the committed revision; record the full Git SHA and validate the expected plugin package name, version, manifest, source and lockfile.
2. **Deterministic dependencies:** `pnpm install --frozen-lockfile`; reject drift, missing locks and silent resolver updates. Use the declared official SOUP worker dependency for SOUP.
3. **Verify:** run the plugin's actual `verify` command, including static checks, real tests, build and browser-loader/package checks. Fail the build on any error.
4. **Inspect actual output:** check Host and browser entrypoints and the emitted client, including compatibility with the DSH browser ModuleLoader; do not accept a Host-only pass as full Web readiness.
5. **Package the tested commit:** create the versioned tarball, inspect its entries, generate SHA-256 and write the complete source Git SHA alongside it.
6. **Verify artifact integrity:** check the SHA-256, install that exact tarball into a clean official DSH profile, inspect registration, recheck SHA-256 and publish the tarball, checksum and source revision together.
7. **Live acceptance boundary:** installation into a temporary profile proves registration, **not** browser mounting, enabled button behavior, session operations, runtime persistence or safe restart. Verify those separately in the actual intended profile before treating a release as deployed and operational.

**No alternate source, untracked build, unverified tarball, skip-on-failure, or package-only green status may be used as release evidence.** Do not automatically install into the running QDev environment. Use [GitHub Actions](.github/workflows/plugins.yml) as the collection-level packaging enforcement and [general lessons](LESSONS.md) for reusable SDK acceptance rules.

## Verify a release

1. Test the exact commit and build the artifact.
2. Commit and package according to the shared workflow and [lessons](LESSONS.md).
3. Verify the artifact checksum and clean official DSH-profile registration.
4. Install only the chosen plugin into the intended live DSH Web profile.
5. Verify Host activation with `dsh plugin --profile web list` and `dsh --profile web --dump-config`.
6. Inspect actual client slot registration, activate the UI control, confirm the real effect, and check persistence when applicable.
7. Record observed results, source revision, and remaining unverified conditions. Parent CI does not substitute for steps 4–6.

## Recover one plugin

Every plugin README must contain an exact package-specific removal procedure. To avoid collateral changes, identify the failing package, remove **that package only** using `dsh plugin --profile web remove <actual-package-name>`, inspect any separate Cordis insertion if the plugin remains active, and preserve all other profiles and sessions. Follow [general lessons](LESSONS.md) before operating on the live environment.

## Update a submodule after migration

Work and commit in the dedicated plugin repository first. After passing its checks, update the tested submodule commit pointer in a focused parent PR; do not copy changed source files into the parent or update other plugin pointers unintentionally.
