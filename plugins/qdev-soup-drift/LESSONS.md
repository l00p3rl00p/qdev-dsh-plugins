# SOUP lessons learned

Specific integration findings from SOUP 0.5.x–0.6.3. Shared principles live in [../../LESSONS.md](../../LESSONS.md); verification evidence lives in [BASELINE_VERIFICATION.md](BASELINE_VERIFICATION.md) and [FEATURE2_VERIFICATION.md](FEATURE2_VERIFICATION.md).

- **A Settings page needs the actual native configuration seam.** The initial page rendered with disabled controls because the installed DSH Settings namespace exposed no usable fields. Inspect the running SDK and a working plugin before adopting `configForms`, `settings.section`, or a version-specific `.volatile()` mechanism.
- **The form namespace is the Loader entry ID.** It is not necessarily the npm package name. Read `cordis.patch.yml`, rather than guessing the ID when calling `configForms.get(...)`.
- **Saving a setting is not applying it.** SOUP's master OFF persisted while observation continued because the Host cached a value at startup. Read committed configuration at the update boundary and cancel/fence old detector generations and pending human replies.
- **Independent chats need independent state.** Sparse overrides inherit global values unless explicitly set; an explicit `false` or `0` is not absence. A chat's detector, strikes, and revision must not spill into another chat.
- **Mounting must be lazy.** Eager enumeration/replay of retained chats during startup can block the entire Harness. Activate only the chat receiving a committed event and replay only the history needed for that chat.
- **One authority for the Python interpreter.** The saved plugin `python` setting determines the interpreter; `python3` is the portable default. A hidden environment-variable fallback masks the user's setting. The worker needs an interpreter with official `soup_cli`, but this is a runtime dependency, not a Git-install requirement.
- **An installed plugin is not an operating detector.** Host import, Settings display, a real Python evaluation, and actual inbox delivery are separate observations. Never infer the later steps from the earlier ones.
- **A single package identity prevents double registration.** Remove obsolete linked/tarball packages through the native plugin manager rather than hand-editing profile internals.
- **Shipped code must be reproducible.** Because Git installation uses committed `dist/` rather than `prepare`, regenerate `dist/` with source changes. Keep the README to the active install/configure/build procedure; retain old investigations in dedicated evidence records or Git history.
