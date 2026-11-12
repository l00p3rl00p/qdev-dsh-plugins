# /// script
# requires-python = ">=3.11"
# dependencies = ["marimo"]
# ///
# Plugin gotchas check, run locally (no CI). Each check encodes a lesson from LESSONS.md that already bit us.
# A failed check raises, so this notebook fails when exported (scripts/export-marimo-notebook.sh exits 1).
# Run:  scripts/export-marimo-notebook.sh plugins/qdev-soup-drift/notebooks/plugin_gotchas.py

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import json
    import re
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path

    import marimo as mo

    plugin = Path(__file__).resolve().parent.parent
    return Path, json, mo, plugin, re, shutil, subprocess, tempfile


@app.cell
def _(mo):
    import textwrap

    mo.md(
        textwrap.dedent(
            """
            # Plugin gotchas

            Each row is a lesson we already paid for. The checks read the plugin on disk, and rebuild its output into a
            temporary folder. Nothing is installed, pushed or changed.
            """
        )
    )
    return


@app.cell
def _(json, plugin):
    pkg = json.loads((plugin / "package.json").read_text())
    return (pkg,)


@app.cell
def _(pkg, plugin, re):
    # Lesson: packaging. The GitHub install cannot rely on a prepare hook; built output must ship committed.
    no_prepare = "prepare" not in pkg.get("scripts", {})
    # Lesson: one version source. The release number is written only in package.json.
    src_index = (plugin / "src" / "index.ts").read_text()
    no_version_literal = re.search(r"const VERSION\s*=\s*'", src_index) is None
    semver_ok = re.fullmatch(r"\d+\.\d+\.\d+", pkg["version"]) is not None
    return no_prepare, no_version_literal, semver_ok


@app.cell
def _(Path, pkg, plugin, re):
    # Lesson: every relative file the Host imports must ship in package.files, or the installed Host fails to import.
    imports = re.findall(r"from '\.\./([^']+)'", (plugin / "src" / "index.ts").read_text())
    shipped = set(pkg.get("files", []))
    missing_from_files = sorted(i for i in imports if i not in shipped)
    return (missing_from_files,)


@app.cell
def _(plugin, re):
    # Lesson: never read an undeclared service. ctx.<name> in the client must be declared in inject (or be a ctx method).
    client = (plugin / "client.js").read_text()
    inject_match = re.search(r"inject: \[([^\]]*)\]", client)
    declared = set(re.findall(r"'([^']+)'", inject_match.group(1))) if inject_match else set()
    ctx_methods = {"effect", "on", "emit", "plugin", "provide", "inject"}
    used = set(re.findall(r"\bctx\.([A-Za-z]+)", client))
    undeclared = sorted(used - declared - ctx_methods)
    return declared, undeclared


@app.cell
def _(declared, pkg):
    # Lesson: a service the client injects must also be declared in the manifest, so DSH loads its package.
    # Known mapping for the services SOUP uses. An unknown service is reported so the mapping can be extended.
    known_packages = {
        "uiConversation": "@deepseek-ai/dsh-client-ui-conversation",
    }
    manifest_inject = set(pkg.get("dsh", {}).get("client", {}).get("inject", []))
    missing_manifest = sorted(
        known_packages[s] for s in declared if s in known_packages and known_packages[s] not in manifest_inject
    )
    unmapped = sorted(s for s in declared if s not in known_packages and s not in {"slots", "configForms"})
    return missing_manifest, unmapped


@app.cell
def _(Path, plugin, subprocess, tempfile):
    # Lesson: the built output must match the source. Rebuild dist/ into a temporary folder and compare it with the committed file.
    # Needs the plugin's own tsc (node_modules). If it is missing, the check reports False rather than passing silently.
    tsc_bin = plugin / "node_modules" / ".bin" / "tsc"
    dist_built_matches = False
    if tsc_bin.exists():
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run([str(tsc_bin), "-p", "tsconfig.json", "--outDir", tmp], cwd=plugin, check=True)
            fresh_index = Path(tmp) / "index.js"
            committed = plugin / "dist" / "index.js"
            dist_built_matches = fresh_index.read_text() == committed.read_text()
    return (dist_built_matches,)


@app.cell
def _(plugin, subprocess):
    # Lesson: the client contract gate and the policy tests must pass before anything ships.
    gate = subprocess.run(["node", "scripts/check-client.mjs"], cwd=plugin, capture_output=True, text=True)
    policy = subprocess.run(["node", "--test", "test/policy.test.mjs"], cwd=plugin, capture_output=True, text=True)
    return gate, policy


@app.cell
def _(
    dist_built_matches,
    gate,
    missing_from_files,
    missing_manifest,
    mo,
    no_prepare,
    no_version_literal,
    policy,
    semver_ok,
    undeclared,
    unmapped,
):
    checks = [
        ("no prepare hook in package.json", no_prepare),
        ("release number not hard-coded in the Host", no_version_literal),
        ("version is a plain semver string", semver_ok),
        ("every Host import ships in package.files", not missing_from_files),
        ("client reads only declared services", not undeclared),
        ("injected services are declared in the manifest", not missing_manifest),
        ("committed dist/ matches a fresh build", dist_built_matches is True),
        ("client contract gate passes", gate.returncode == 0),
        ("policy tests pass", policy.returncode == 0),
    ]
    rows = "\n".join(f"| {'PASS' if ok else 'FAIL'} | {name} |" for name, ok in checks)
    detail = []
    if missing_from_files:
        detail.append(f"Not in package.files: {missing_from_files}")
    if undeclared:
        detail.append(f"Read but not declared in inject: {undeclared}")
    if missing_manifest:
        detail.append(f"Missing from dsh.client.inject: {missing_manifest}")
    if unmapped:
        detail.append(f"Services without a manifest mapping (extend known_packages): {unmapped}")
    mo.md("## Results\n\n| | check |\n|---|---|\n" + rows + ("\n\n" + "\n\n".join(detail) if detail else ""))
    return checks, detail


@app.cell
def _(checks, detail):
    # Fail the export when any check failed, so the export script reports it.
    failed = [name for name, ok in checks if not ok]
    assert not failed, f"plugin gotchas failed: {failed}. {' | '.join(detail)}"
    return


if __name__ == "__main__":
    app.run()
