# /// script
# requires-python = ">=3.11"
# dependencies = ["marimo"]
# ///
# Plugin gotchas check, run locally (no CI). Each check encodes a lesson from LESSONS.md that already bit us.
#
# DETERMINISTIC: the same code gives the same result every run. Nothing here reads the clock, a random number
# or an unpinned tool. The only external inputs are the plugin files, the committed dist/ and an interpreter
# you name explicitly with SOUP_PYTHON. If that is not set, the worker-backed policy check FAILS with a message,
# rather than picking up whatever Python happens to be installed.
#
# A failed check raises, so exporting this notebook fails (scripts/export-marimo-notebook.sh exits 1).
# Run:
#   SOUP_PYTHON=/path/to/soup-venv/bin/python scripts/export-marimo-notebook.sh plugins/qdev-soup-drift/notebooks/plugin_gotchas.py

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import json
    import os
    import re
    import subprocess
    import tempfile
    from pathlib import Path

    import marimo as mo

    plugin = Path(__file__).resolve().parent.parent
    return Path, json, mo, os, plugin, re, subprocess, tempfile


@app.cell
def _(mo):
    import textwrap

    mo.md(
        textwrap.dedent(
            """
            # Plugin gotchas

            Each row is a lesson we already paid for. The checks read the plugin on disk and rebuild its output into a
            temporary folder. Nothing is installed, pushed or changed.
            """
        )
    )
    return


@app.cell
def _(json, plugin):
    pkg = json.loads((plugin / "package.json").read_text())
    src_index = (plugin / "src" / "index.ts").read_text()
    client = (plugin / "client.js").read_text()
    return client, pkg, src_index


@app.cell
def _(pkg, re, src_index):
    # Lesson: packaging. The GitHub install cannot rely on a prepare hook; built output must ship committed.
    no_prepare = "prepare" not in pkg.get("scripts", {})
    # Lesson: one version source. The release number is written only in package.json.
    no_version_literal = re.search(r"const VERSION\s*=\s*'", src_index) is None
    semver_ok = re.fullmatch(r"\d+\.\d+\.\d+", pkg["version"]) is not None
    return no_prepare, no_version_literal, semver_ok


@app.cell
def _(pkg, re, src_index):
    # Lesson: every relative file the Host imports must ship in package.files, or the installed Host fails to import.
    imports = re.findall(r"from '\.\./([^']+)'", src_index)
    shipped = set(pkg.get("files", []))
    missing_from_files = sorted(name for name in imports if name not in shipped)
    return (missing_from_files,)


@app.cell
def _(client, re):
    # Lesson: never read an undeclared service. ctx.<name> in the client must be declared in inject, or be a ctx method.
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
def _(re, src_index):
    # Lesson: every storage domain the Host opens must be closed by a matching effect, or teardown leaks it.
    # Also, domain names must be unique, or two features write into the same storage.
    opened = dict(re.findall(r"const (\w+) = await ctx\.storageDomain\.open\((\w+)\)", src_index))
    closed = set(re.findall(r"ctx\.effect\(\(\) => \(\) => (\w+)\.close\(\)\)", src_index))
    unclosed = sorted(var for var in opened if var not in closed)
    domain_names = re.findall(r"name: '(qdev_[a-z_]+)'", src_index)
    duplicate_domains = sorted({n for n in domain_names if domain_names.count(n) > 1})
    return duplicate_domains, unclosed


@app.cell
def _(Path, plugin, subprocess, tempfile):
    # Lesson: the built output must match the source. Rebuild dist/ into a temporary folder and compare with the committed file.
    # The plugin's own tsc is used, so the build is the same one the repo pins. A missing tsc is a failure, not a pass.
    tsc_bin = plugin / "node_modules" / ".bin" / "tsc"
    dist_built_matches = False
    if tsc_bin.exists():
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run([str(tsc_bin), "-p", "tsconfig.json", "--outDir", tmp], cwd=plugin, check=True)
            dist_built_matches = (Path(tmp) / "index.js").read_text() == (plugin / "dist" / "index.js").read_text()
    return (dist_built_matches,)


@app.cell
def _(plugin, re):
    # Lesson: the Host tests must run against the built output the package ships, not against source.
    host_tests = {
        name: (plugin / "test" / name).read_text()
        for name in ("session-host.test.mjs", "host-config.test.mjs")
    }
    loads_dist = {name: re.search(r"new URL\('\.\./dist/index\.js'", text) is not None for name, text in host_tests.items()}
    tests_use_dist = all(loads_dist.values())
    return (tests_use_dist,)


@app.cell
def _(plugin, subprocess):
    # Lesson: the client contract gate must pass before anything ships.
    gate = subprocess.run(["node", "scripts/check-client.mjs"], cwd=plugin, capture_output=True, text=True)
    gate_ok = gate.returncode == 0
    return (gate_ok,)


@app.cell
def _(os, plugin, subprocess):
    # Lesson: the policy tests include the Python worker. The interpreter must be named explicitly, so the result
    # depends on the code and the named interpreter only. No named interpreter is a deterministic failure.
    interpreter = os.environ.get("SOUP_PYTHON", "")
    if interpreter:
        policy = subprocess.run(
            ["node", "--test", "test/policy.test.mjs"],
            cwd=plugin,
            capture_output=True,
            text=True,
            env={**os.environ, "SOUP_PYTHON": interpreter},
        )
        policy_ok = policy.returncode == 0
        policy_note = f"interpreter {interpreter}"
    else:
        policy_ok = False
        policy_note = "SOUP_PYTHON is not set. Name the soup-cli interpreter explicitly."
    return policy_note, policy_ok


@app.cell
def _(
    dist_built_matches,
    duplicate_domains,
    gate_ok,
    mo,
    missing_from_files,
    missing_manifest,
    no_prepare,
    no_version_literal,
    policy_note,
    policy_ok,
    semver_ok,
    tests_use_dist,
    undeclared,
    unclosed,
    unmapped,
):
    checks = [
        ("no prepare hook in package.json", no_prepare),
        ("release number not hard-coded in the Host", no_version_literal),
        ("version is a plain semver string", semver_ok),
        ("every Host import ships in package.files", not missing_from_files),
        ("client reads only declared services", not undeclared),
        ("injected services are declared in the manifest", not missing_manifest),
        ("every storage domain the Host opens is closed", not unclosed),
        ("storage domain names are unique", not duplicate_domains),
        ("Host tests load the built dist/", tests_use_dist),
        ("committed dist/ matches a fresh build", dist_built_matches is True),
        ("client contract gate passes", gate_ok),
        (f"policy tests pass ({policy_note})", policy_ok),
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
    if unclosed:
        detail.append(f"Storage domains opened but not closed: {unclosed}")
    if duplicate_domains:
        detail.append(f"Duplicate storage domain names: {duplicate_domains}")
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
