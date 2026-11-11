# SOUP Plugin Development Lessons

**Captured:** 2026-11-06  
**Plugin:** qdev-trajectory-drift-soup v0.5.2  
**DSH Version:** 0.2.1-rc.5

**Purpose:** Document the **seams and integration points** we discovered in DSH so you don't waste 2 days looking for them. These are "the seam exists and here's how to find it" lessons, not SDK rewrites.

## The Critical Discovery: Volatile Config Fields

### The Problem

The Settings page rendered correctly but showed "Configuration is unavailable" and all controls were disabled.

### Root Cause Investigation

**Before creating Settings UI, read:**
- `@deepseek-ai/dsh-settings/README.md` - explains volatile field requirement
- DSH Cordis Plugin Development skill references

**What we discovered:**
- DSH Settings only exposes Config fields marked `.volatile()`
- SOUP's original Config had zero `.volatile()` fields
- Therefore DSH intentionally excluded it from settings namespace directory

**How we found it:**
1. Used subagents to trace SDK source (not guessing from examples)
2. Compared dsh-superagent (working) vs dsh-codex (different pattern)
3. Read installed `dsh-settings` source to understand the mechanism

### The Solution

**Read first:**
- Schemastery documentation for `.volatile()` usage
- `@cosmokit` types for `Volatile<T>` refs
- DSH plugin development skill: `references/practices.md` section on Config

**What we did:**
1. Marked UI-editable fields `.volatile()` in Host Config
2. Updated runtime to call `.get()` on volatile refs (they're not primitives)
3. Simplified client to `ctx.configForms.get(ENTRY_ID)` (see dsh-superagent example)

**SOUP-specific files changed:** `src/index.ts`, `client.js`

**Key lesson:** Before implementing Settings UI, verify your Config has volatile fields. Otherwise the namespace won't exist.

## Namespace Identity Rules

**Read first:**
- `dsh-client-ui-settings` type definitions: `config-form.d.ts`
- Plugin Manager slot contract: `slot-contract.d.ts`

**Critical discovery:** The namespace ID for `configForms.get()` is the **Loader entry ID** from `cordis.patch.yml`, not the npm package name.

**Check installed examples:**
- Codex: package `dsh-codex` but Loader ID is `llm-openai-codex` (they differ!)
- SOUP: both happen to be `qdev-trajectory-drift-soup` (coincidence)

**Don't guess** - inspect `cordis.patch.yml` to find the actual row ID.

## Working Reference Patterns

**For Config-backed Settings UI, read these installed examples:**

1. **dsh-superagent** (recommended pattern)
   - Uses `.volatile()` Config fields
   - Client calls `ctx.configForms.get(ENTRY)`
   - Files: `src/deployment.ts`, `src/client/index.tsx`

2. **dsh-codex** (different approach)
   - Does NOT use `configForms` at all
   - Custom HTTP endpoints + `fetch()` from browser
   - Files: `src/client/OpenAICodexSettings.tsx`, `src/auth-routes.ts`

3. **Built-in Settings pages** (various patterns)
   - General: additive `settings.general.item` rows
   - Models: custom controller, not Config-based
   - Plugins: tab chrome only

**Key lesson:** Don't copy code. Read the source to understand which pattern fits your use case, then follow SDK documentation for that pattern.

## Discovered Seams and Patterns

### Settings UI Seam: `settings.section`

**The seam exists:** You can add a first-class Settings page without creating a parallel app.

**How to find it:**
```bash
cordis_inspect_query platform=client provider=Slots method=listSubTree input='{"root":"settings.section"}'
```

**Integration points:**
- Slot: `settings.section` (list slot, registration needs `id`, `order`, `label`)
- Config integration: `ctx.configForms.get(LOADER_ENTRY_ID)`
- Owner prop: `close` callback (that's it - your page brings its own data)

**Pattern that works:**
- Page receives `{ source: ctx.configForms.get(ENTRY) }` via inject
- Use `useSyncExternalStore` to subscribe to form state
- Call `form.mutate([{op, path, value}], revision)` to write

**Where to see it working:** dsh-superagent, Auto Code Correct

### Plugin Row Config Seam: `plugins.row.config`

**The seam exists:** Plugin Manager can show your custom config UI per package.

**Slot:** `plugins.row.config` (keyed slot, key is `<package>#<row-id>`)
**Injected prop:** `form` - same pattern as Settings, but Manager provides it
**Used by:** dsh-superagent deployment page

### UI Explanation Pattern

**Pattern that works:**
- Inline `hint` props on controls (brief, shows current values dynamically)
- Expandable "About" section with `useState(false)` toggle
- `aria-expanded` for accessibility

**Why this works:** Users need context without clutter. Inline hints for quick reference, expandable section for concepts.

**SOUP example:** Settings page has both - hints show current threshold, expandable section explains KL divergence

## Preventing Duplicate Plugins

**The seam:** DSH CLI `dsh plugin --profile X remove <name>` handles profile cleanup.

**Problem we hit:** Two cards for same plugin (linked source + tarball under different names).

**How to fix:**
1. Use `dsh plugin --profile X remove <old-name>` (don't edit files manually)
2. Verify with `plugin_manager list_bundles` 
3. Install new version with one canonical name only

**Why this matters:** Manually editing `package.json`/`cordis.patch.yml` can cause `plugin_manager` to fail with "bundle-in-use" or leave orphaned entries.

**One canonical name rule:** Pick the final package identity early. Don't use aliases or change names across versions.

## How to Discover Seams

**Don't guess. Use these tools:**

1. **Cordis Inspect** - find slots and services
   ```
   cordis_inspect_list  # what providers exist?
   cordis_inspect_query platform=client provider=Slots method=listSubTree input='{"root":"settings.section"}'
   ```

2. **Read installed examples** - see what actually works
   - `dsh-superagent` for Config-based Settings
   - `dsh-codex` for custom HTTP pattern
   - Built-in UI plugins for slot patterns

3. **Use subagents** - delegate SDK tracing
   - "Trace how dsh-superagent Settings page works"
   - "Compare Settings mechanisms in Codex vs Superagent"

4. **Check runtime state** - verify what DSH exposes
   - `/qdev-soup-drift/status` for plugin state
   - `configForms.describe()` to see namespaces
   - Browser DevTools to inspect slot injections

**Pattern:** Before building something, spend 30 minutes finding the seam. It's faster than 2 days of custom code.

## Critical Testing Distinction

**Settings UI working ≠ Runtime behavior changed**

Test **both** separately:

1. **UI persistence:** Change → Close → Reopen → Still there?
2. **Runtime application:** Change → Check `/status` endpoint → Detector using new value?

**Correction from the 2026-11-06 baseline audit:** Settings persistence was human-accepted, but the 0.5.3 master-OFF runtime check failed: status still reported enabled and observed-event counts increased. Earlier runtime-PASS statements above are not sufficient acceptance evidence for this case.

Loader 1.0.6 keeps the fiber alive for volatile-only edits, commits its references, then emits `loader/volatile-update` to that fiber only (`src/config/entry.ts`, `_commitVolatile`; contract in `lib/types/index.d.ts`). Reading `.get()` only at startup is insufficient. SOUP 0.5.4 listens on its own context, rereads the references, replaces only the detector, and preserves its Mentor instance/strikes. Detector generations fence callbacks from cancelled workers; each pending question captures its own abort signal so OFF/ON cannot reactivate an old answer.

Native Loader + built Host + real Python integration tests now cover effective sensitivity/window changes without remount, master-OFF suppression, cancellation, late callbacks, and the three-count guard. Installed-profile OFF/ON and eligible ClickHouse receipt are separate pending checks; source, unit tests, and a successful install do not prove them.

**Don't claim baseline PASS until persistence, runtime behavior, and end-to-end receipt are separately verified.**

## Theme Tokens Seam

**The seam:** DSH exposes design tokens via `--dsw-alias-*` CSS variables.

**How to find allowed tokens:**
```
cordis_inspect_query platform=client provider=Theme method=listTokens
```

**Pattern:** Use only approved tokens. Check `scripts/check-client.mjs` to enforce.

**Why:** Hardcoded colors break light/dark themes and look out of place.

## Quick Reference: Seams We Used

| Need | Seam | How to Find |
|---|---|---|
| Settings page | `settings.section` slot | `cordis_inspect_query` Slots listSubTree |
| Plugin row UI | `plugins.row.config` slot | Check Plugin Manager slot contract |
| Config persistence | `configForms` service + `.volatile()` fields | Read `dsh-settings` README |
| Theme styling | `--dsw-alias-*` tokens | `cordis_inspect_query` Theme listTokens |
| Remove old plugin | `dsh plugin remove` | DSH CLI help |
| Verify install | `plugin_manager list_bundles` | MCP tool |

## Key Lessons

1. **Find the seam first** - 30 min investigation > 2 days custom code
2. **Use Cordis Inspect** - don't guess what slots/services exist
3. **Read working examples** - installed plugins show real patterns
4. **User must test UI** - your verification isn't enough
5. **One canonical name** - no aliases, ever

## What Changed (0.5.2)

**Problem:** Settings page showed "Configuration unavailable"  
**Root cause:** Config had no `.volatile()` fields  
**Fix:** Marked 6 UI-editable fields `.volatile()`, called `.get()` on refs  
**Evidence:** User tested Settings page, confirmed persistence + runtime updates  
**Commit:** `15f567f`
