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
