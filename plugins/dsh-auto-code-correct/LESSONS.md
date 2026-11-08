# ACC-specific lessons

The shared package and recovery law is [../plugin-lessons.md](../plugin-lessons.md). This document records ACC-specific incidents and verification criteria.

- A successful Host install is not proof the browser module can load. Inspect **emitted** client imports against the available DSH ModuleLoader modules.
- Missing `@deepseek-ai/dsh-lsp-stdio` can break ACC setup; verify prerequisite availability and native load, rather than treating a successful package build as proof of readiness.
- A visible configuration control is not proof of persistence. Save, reload and inspect the effective Host config.
- A correction pass must remain bounded, visible, and nonblocking; avoid infinite retry/restart cycles.
- Keep real integrations and run results as acceptance evidence; do not replace them with mocks.
