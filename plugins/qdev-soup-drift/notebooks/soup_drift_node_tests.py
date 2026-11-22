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
    import hashlib
    import marimo as mo
    import os
    import re
    import shlex
    import shutil
    import subprocess
    import tempfile

    return hashlib, mo, os, re, shlex, shutil, subprocess, tempfile


@app.cell
def _(hashlib, os, shlex, shutil, subprocess):
    # ONE staging contract between this notebook and the Harness container (no bind mount or shared directory is assumed):
    #   1. build the copy to run in a temporary directory on THIS machine;
    #   2. empty the destination directory inside the container, then stream the copy in as a tar archive through
    #      `docker exec -i ... tar -x` (files end up owned by the container user, so the next run can empty them again);
    #   3. read SHA-256 hashes of every staged file back from inside the container and require them to equal ours.
    # Anything that fails (no docker, no container, destination not writable, hash mismatch) raises StagingError with
    # what to fix. Files already present in the container are never reused: the destination is emptied first.
    class StagingError(RuntimeError):
        pass

    def docker(*args, timeout=300):
        exe = shutil.which("docker")
        if exe is None:
            raise StagingError("`docker` was not found on PATH: run this notebook where the docker CLI can reach the Harness container")
        return subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout)

    def docker_must(*args, what, timeout=300):
        done = docker(*args, timeout=timeout)
        if done.returncode != 0:
            raise StagingError(f"{what} failed (exit {done.returncode}): {(done.stderr or done.stdout).strip()[:500]}")
        return done

    def local_manifest(root):
        found = {}
        for base, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
            for name in files:
                path = os.path.join(base, name)
                if os.path.islink(path):
                    continue
                with open(path, "rb") as handle:
                    found["./" + os.path.relpath(path, root)] = hashlib.sha256(handle.read()).hexdigest()
        return found

    def container_manifest(container, dest):
        done = docker_must(
            "exec", "-w", dest, container, "sh", "-c",
            "find . \\( -name node_modules -o -name .git \\) -prune -o -type f -print0 | sort -z | xargs -0 -r sha256sum",
            what="reading the staged files back from the container",
        )
        return {line[66:]: line[:64] for line in done.stdout.splitlines() if len(line) > 66}

    def ship(local_dir, container, dest):
        """Copy local_dir into dest inside the container and prove the container holds exactly these files."""
        docker_must(
            "exec", container, "sh", "-c", f"rm -rf {shlex.quote(dest)} && mkdir -p {shlex.quote(dest)}",
            what=f"emptying {dest} in container {container!r} (is the container running, and is that directory writable by its user? set SOUP_STAGE_DIR)",
        )
        exe = shutil.which("docker")
        pack = subprocess.Popen(["tar", "-C", local_dir, "-cf", "-", "."], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env={**os.environ, "COPYFILE_DISABLE": "1"})  # COPYFILE_DISABLE: no macOS ._ metadata files
        unpack = subprocess.run([exe, "exec", "-i", container, "tar", "-xf", "-", "-C", dest], stdin=pack.stdout,
                                capture_output=True, timeout=900)
        pack.stdout.close()
        pack_err = pack.stderr.read().decode(errors="replace").strip()
        if pack.wait() != 0 or unpack.returncode != 0:
            raise StagingError(f"transferring the copy into {container}:{dest} failed: {pack_err or unpack.stderr.decode(errors='replace').strip()[:500]}")
        mine, theirs = local_manifest(local_dir), container_manifest(container, dest)
        missing = sorted(set(mine) - set(theirs))
        extra = sorted(set(theirs) - set(mine))
        different = sorted(k for k in mine.keys() & theirs.keys() if mine[k] != theirs[k])
        if missing or extra or different:
            raise StagingError(
                f"staged files in {container}:{dest} do not match the files staged here: "
                f"{len(missing)} missing {missing[:5]}, {len(extra)} unexpected {extra[:5]}, {len(different)} different {different[:5]}"
            )
        return {"files": len(mine), "from": local_dir, "to": f"{container}:{dest}", "hashes_equal": True}

    return StagingError, docker, ship


@app.cell
def _(mo, os):
    # INPUTS. The node tests are the PROOF (real SOUP worker, real built Host); this notebook only stages them,
    # runs them inside a Harness container and shows the result. Required configuration (no machine-specific defaults):
    #   SOUP_HARNESS_CONTAINER  name of a RUNNING Harness container that has Node and the plugin's dependencies
    #   SOUP_PYTHON             path, INSIDE that container, of a Python that has the official soup-cli
    # Optional:
    #   SOUP_PLUGIN_DIR         plugin directory to test (default: the plugin this notebook sits in). It must contain
    #                           installed node_modules and the built dist/, because the copy is what gets run.
    #   SOUP_STAGE_DIR          directory INSIDE the container that receives the copy (default /tmp/soup-notebook-stage).
    plugin_dir = mo.ui.text(
        value=os.environ.get("SOUP_PLUGIN_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        label="SOUP plugin directory (on this machine)",
        full_width=True,
    )
    soup_python = mo.ui.text(
        value=os.environ.get("SOUP_PYTHON", ""),
        label="SOUP_PYTHON inside the Harness container (python with soup-cli) - required",
        full_width=True,
    )
    container = mo.ui.text(
        value=os.environ.get("SOUP_HARNESS_CONTAINER", ""),
        label="Harness container name - required",
        full_width=True,
    )
    stage_dir = mo.ui.text(
        value=os.environ.get("SOUP_STAGE_DIR", "/tmp/soup-notebook-stage"),
        label="Staging directory inside the container (emptied on every run)",
        full_width=True,
    )
    mo.vstack([plugin_dir, soup_python, container, stage_dir])
    return container, plugin_dir, soup_python, stage_dir


@app.cell
def _(StagingError, container, mo, plugin_dir, re, shutil, ship, soup_python, stage_dir, subprocess, tempfile, docker):
    mo.stop(
        not (container.value.strip() and soup_python.value.strip()),
        mo.callout(mo.md("**Not run.** Set `SOUP_HARNESS_CONTAINER` (a running Harness container) and `SOUP_PYTHON` (a Python with soup-cli, as a path inside that container), then re-run."), kind="warn"),
    )
    # Decisions A (off is off), B (in-flight window kept), C (baseline growth from history).
    TEST_FILES = [
        "test/off-is-off.test.mjs",
        "test/in-flight-off.test.mjs",
        "test/baseline-growth.test.mjs",
    ]
    STAGE_CTR = stage_dir.value.rstrip("/") + "/soup-proof"
    stage_error = None
    staged = None
    _tmp = tempfile.mkdtemp(prefix="soup-nb-")
    try:
        _local = _tmp + "/soup-proof"
        shutil.copytree(plugin_dir.value, _local, symlinks=True, ignore=shutil.ignore_patterns(".git"))
        staged = ship(_local, container.value, STAGE_CTR)
        # Fail early and plainly if the staged copy cannot run the tests (e.g. node_modules missing from the plugin dir).
        for _rel in TEST_FILES:
            if docker("exec", "-w", STAGE_CTR, container.value, "test", "-f", _rel).returncode != 0:
                raise StagingError(f"{_rel} is not in the staged copy at {container.value}:{STAGE_CTR}")
        if docker("exec", "-w", STAGE_CTR, container.value, "test", "-d", "node_modules").returncode != 0:
            raise StagingError("the plugin directory has no node_modules, so the staged copy cannot run the tests: install dependencies there first")
    except (StagingError, OSError, subprocess.TimeoutExpired) as _e:
        stage_error = f"{type(_e).__name__}: {_e}"
    finally:
        shutil.rmtree(_tmp, ignore_errors=True)
    mo.stop(stage_error is not None, mo.callout(mo.md(f"**Staging failed, nothing was run.**\n\n{stage_error}"), kind="danger"))
    completed = docker(
        "exec", "-w", STAGE_CTR, "-e", f"SOUP_PYTHON={soup_python.value}", container.value,
        "node", "--test", "--test-reporter=tap", *TEST_FILES, timeout=600,
    )
    rows = []
    for line in completed.stdout.splitlines():
        found = re.match(r"^(not ok|ok) \d+ - (.*?)(?: # (SKIP|skip).*)?$", line)
        if found:
            verdict = "SKIP" if found.group(3) else ("PASS" if found.group(1) == "ok" else "FAIL")
            rows.append({"result": verdict, "test": found.group(2)})
    return STAGE_CTR, completed, rows, staged


@app.cell
def _(completed, mo, rows, staged):
    counts = {k: sum(r["result"] == k for r in rows) for k in ("PASS", "FAIL", "SKIP")}
    mo.vstack([
        mo.md(f"Staged {staged['files']} files `{staged['from']}` -> `{staged['to']}`; SHA-256 of every staged file read back inside the container and equal."),
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
