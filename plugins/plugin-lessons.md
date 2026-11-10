# General DSH plugin lessons

## Protect known-good execution paths

- Once an execution path is proven to work, treat that behavior as **immutable by default**. Do not change it merely to improve diagnostics, observability, presentation, packaging, or operator convenience.
- Add observation around a working path; do not insert transformations into the live value/control path unless the change is explicitly required by the feature itself.
- Security handling belongs at the boundary where information is copied, persisted, or displayed. Preserve the authoritative runtime value until the consumer that actually needs it has received it.
- Experimental changes must be isolated in a branch, worktree, disposable profile, or test-only path. Do not alter the known-good implementation in place to test an idea.
- Before replacing working behavior, prove the replacement against the same real execution boundary. Mocks, static checks, and package success are not substitutes for the live behavior that was already known to work.
- If a regression appears after an ancillary change, restore the last known-good behavior first, then investigate the ancillary feature separately.
- Lessons and diagnostics should describe the engineering principle and validation boundary without exposing secrets, credentials, or unnecessary security-sensitive implementation details.

The single authoritative, cross-plugin lessons file is [../LESSONS.md](../LESSONS.md). This compatibility link is preserved for plugin README references migrated from Scratchpad.

Plugin-specific incident findings belong in each plugin's `LESSONS.md`.
