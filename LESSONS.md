# DSH plugin lessons learned

Reusable findings from ACC, SOUP, and Telemetry Seams. Implementation steps belong in each plugin's README/RUNBOOK; test evidence and pending work belong in verification records or issues.

## Preserve known-good behavior

- Once an execution path works, do not rewrite it merely to improve instrumentation, packaging, or presentation. Add observation at the boundary, not inside the working value path.
- Isolate experiments from the live Harness and keep a known-good revision. If a peripheral change causes a regression, restore the working behavior before investigating the new addition.
- Keep sensitive deployment details in private operations notes. A public lesson should record the reusable mechanism, not a person's paths, containers, credentials, or session data.

## Package once, install predictably

- Git-hosted installs cannot depend on a `prepare` script: pnpm may reject it. Commit `lib/` or `dist/` with the matching source revision and install by immutable SHA.
- A clean install proves only that the package was accepted. Host import, browser registration, configuration persistence, and actual operation are separate facts.
- Keep runtime and build dependency ownership separate. DSH services are platform peers, not duplicate runtime installations; independent plugin dependencies and external executables have their own owners.
- A package's manifest, emitted browser bundle, and lockfile must agree. Inspect the shipped files and their loader imports, not just the TypeScript that compiled.

## Follow the platform's actual seams

- Discover the installed SDK's slots, service lifecycle, and Loader entry ID before implementing a UI. The Loader entry ID is not necessarily the npm package name.
- A browser bundle can compile and the Host can load while the Web ModuleLoader rejects an external import. Validate the emitted client against the real browser loader.
- Optional diagnostics must never gate an entire plugin UI. ACC's self-mounted readiness remote blocked Settings and Conversation registration; removal restored the native surfaces.
- A remote service mounted by a plugin must be consumed from the supported child injection scope, not read through an uninjected parent context.
- Configuration persistence and runtime application differ. A saved value is not proof that the active detector or Host used it; volatile changes must be read at their actual update boundary.
- An auxiliary plugin record belongs in the platform's ignorable plugin-record channel. Do not append unknown required core session events or fabricate parent tool events.
- For telemetry, distinguish an observed event from an inferred interpretation. Missing environment metadata should be reported as unknown rather than invented.

## Keep runtime recovery bounded

- A broken browser plugin must remain removable through the native CLI without deleting the profile or rebuilding the Harness. Remove only the affected package and its explicit loader insertion, if present.
- Browser actions need observed Host effects; a visible button, green compilation, or lack of import errors is not proof the operation ran.
- Avoid duplicating plugin identities or patching the installed upstream platform to recover one package.
- Use the browser/theme APIs that the running DSH version actually supports; do not work around missing seams with parallel UIs.

## Keep documentation authoritative

- Put current installation instructions first, with a pinned source and the minimal runtime configuration. Move superseded procedures out of the active path.
- Lessons record **failure → cause → reusable principle**, not work orders, test plans, open backlog, or historical shell transcripts. Version-specific evidence belongs with the relevant verification record.
- Do not copy obsolete guidance forward just because it once worked. In particular, the older SOUP `.volatile()` workaround describes a historical SDK seam, not a universal rule for new plugins.
