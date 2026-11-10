# DSH Plugin Build Rule

Before installing any plugin we build, edit, or modify, we must **Test → Commit → Package → Verify SHA → Install**. Only an explicit user override permits an exception.

**Sole active ACC source:** `l00p3rl00p/qdev-dsh-plugins/plugins/dsh-auto-code-correct`. Never push ACC work to `l00p3rl00p/dsh-auto-code-correct` or `l00p3rl00p/quatrus-scratchpad`; both are deprecated historical repositories. QDocker Compose's `stacks/harness/start-harness.sh` builds a verified package from this directory for first install, and `./qclean test-acc` uses the same source for clean isolation.
