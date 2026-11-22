# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "marimo",
#     "pytest",
# ]
# ///

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import os
    import re
    import shutil
    import subprocess

    return mo, os, re, shutil, subprocess


@app.cell
def _(mo, os):
    # Where the plugin lives and which Python holds the official soup-cli. The node tests are the
    # PROOF (real SOUP worker, real built Host); this notebook only runs them and shows the result.
    plugin_dir = mo.ui.text(
        # Default: the plugin this notebook lives in (notebooks/ sits directly inside the plugin directory).
        # Override with SOUP_PLUGIN_DIR to test another build.
        value=os.environ.get("SOUP_PLUGIN_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        label="SOUP plugin directory",
        full_width=True,
    )
    # The stack's own Soup venv (soup-cli) lives INSIDE the Harness container, mounted read-only;
    # tests run there with the container's own Node, not on the Mac.
    soup_python = mo.ui.text(
        value=os.environ.get("SOUP_PYTHON", "/home/qdev/llm-runtime/tools/venvs/soup/bin/python"),
        label="SOUP_PYTHON inside the Harness container (python with soup-cli)",
        full_width=True,
    )
    container = mo.ui.text(
        value=os.environ.get("SOUP_HARNESS_CONTAINER", "quatrus-harness-deepseek-harness"),
        label="Harness container",
        full_width=True,
    )
    mo.vstack([plugin_dir, soup_python, container])
    return container, plugin_dir, soup_python


@app.cell
def _(container, plugin_dir, re, shutil, soup_python, subprocess):
    # Decisions A (off is off), B (in-flight window kept), C (baseline growth from history).
    TEST_FILES = [
        "test/off-is-off.test.mjs",
        "test/in-flight-off.test.mjs",
        "test/baseline-growth.test.mjs",
    ]
    # /tmp on the Mac is mounted in the Harness at /home/qdev/github. Copy the plugin there, then
    # run the real tests with the container's Node and the stack's real soup venv.
    STAGE_HOST, STAGE_CTR = "/tmp/soup-proof", "/home/qdev/github/soup-proof"
    subprocess.run(["rm", "-rf", STAGE_HOST], check=True)
    subprocess.run(["cp", "-a", plugin_dir.value, STAGE_HOST], check=True)
    docker = shutil.which("docker")
    completed = subprocess.run(
        [docker, "exec", "-w", STAGE_CTR, "-e", f"SOUP_PYTHON={soup_python.value}", container.value,
         "node", "--test", "--test-reporter=tap", *TEST_FILES],
        capture_output=True, text=True, timeout=600,
    )
    rows = []
    for line in completed.stdout.splitlines():
        found = re.match(r"^(not ok|ok) \d+ - (.*?)(?: # (SKIP|skip).*)?$", line)
        if found:
            verdict = "SKIP" if found.group(3) else ("PASS" if found.group(1) == "ok" else "FAIL")
            rows.append({"result": verdict, "test": found.group(2)})
    return completed, rows


@app.cell
def _(completed, mo, rows):
    counts = {k: sum(r["result"] == k for r in rows) for k in ("PASS", "FAIL", "SKIP")}
    mo.vstack([
        mo.md(f"**node exit code {completed.returncode}** - {counts['PASS']} pass, {counts['FAIL']} fail, {counts['SKIP']} skipped"),
        mo.ui.table(rows, selection=None),
    ])
    return (counts,)


@app.cell
def _(completed, mo):
    mo.accordion({"Raw TAP output": mo.md(f"```\n{completed.stdout[-6000:]}\n```")})
    return


@app.cell
def _(completed, rows):
    def test_node_suite_exits_zero():
        assert completed.returncode == 0, completed.stdout[-2000:]

    def test_every_test_ran_and_passed():
        assert rows, "no tests were parsed from the node output"
        assert all(r["result"] == "PASS" for r in rows), [r for r in rows if r["result"] != "PASS"]

    return


if __name__ == "__main__":
    app.run()
