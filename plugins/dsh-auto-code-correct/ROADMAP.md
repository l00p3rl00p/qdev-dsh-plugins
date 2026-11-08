# ACC roadmap

## Current baseline
Package `dsh-auto-code-correct`, version 0.1.12; independently developed in [dsh-auto-code-correct](https://github.com/l00p3rl00p/dsh-auto-code-correct).

## Next
1. Verify actual DSH Web settings read/write persistence after reload and restart, with source of truth in native configuration.
2. Verify readiness reporting and correction visibility for Python (Ruff + ty), Rust (rustfmt + Clippy + cargo check), and TypeScript (ESLint + Prettier + tsc).
3. Preserve bounded, nonblocking automatic correction, Git hygiene and user control.
4. Require strict build/lint/test/browser-loader/package/clean-profile gates and live mounted-UI acceptance for releases.
5. Work in ACC's own repository; update parent submodule commit after passing release checks.

## Acceptance
The active DSH profile loads the verified package; toggles persist; tools and readiness display actual state; scoped CLI removal recovers a bad plugin.
