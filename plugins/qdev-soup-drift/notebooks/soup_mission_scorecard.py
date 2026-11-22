# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "marimo",
# ]
# ///
"""SOUP MISSION SCORECARD.

Not a unit-test list and not a test count. One row per MISSION / FRAMEWORK requirement, each with a plain
statement, PASS / FAIL / NOT-PROVEN and the values actually observed. A NOT-PROVEN section always sits beside
any pass count so the scorecard cannot read greener than reality.

The scenarios run black-box through the public boundary (built package entry mounted by the real Cordis
Loader, real soup_worker.py and soup_cli) inside the Harness container with docker exec only. The runner is
mission-scenarios.mjs next to this file. The Studio kernel container has no docker, so there the notebook shows
the LAST SAVED live results and says so; run it on the Mac (marimo MCP run_notebook) to refresh them.

TRUST NOTE: the official SOUP worker / soup_cli is a trusted given. This scorecard uses it but does not evaluate it:
no row grades its KL values, false-alarm behaviour, tokenisation or agreement with another run.
"""

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="full")


@app.cell
def _():
    import json
    import os
    import shutil
    import subprocess
    import time
    from concurrent.futures import ThreadPoolExecutor
    from datetime import datetime
    from pathlib import Path

    import marimo as mo

    return Path, ThreadPoolExecutor, datetime, json, mo, os, shutil, subprocess, time


@app.cell
def _(mo):
    mo.callout(mo.md("**The SOUP worker (soup_worker.py / soup_cli) is trusted and is not evaluated here.** Scenarios run it for real, but no row judges its scores, false-alarm behaviour or tokenisation. Rows only check what the plugin does with what the worker reports."), kind="info")
    return


@app.cell
def _(Path, mo, os):
    # Inputs. A "plugin directory" is a built plugin: package.json main -> dist/index.js. Read-only: copied to staging.
    here = Path(__file__).resolve().parent
    build_a = mo.ui.text(value=os.environ.get("SOUP_BUILD_A", ""), label="Build A plugin directory (older build to compare, e.g. 0.6.3; set SOUP_BUILD_A or type a path)", full_width=True)
    build_b = mo.ui.text(value=os.environ.get("SOUP_BUILD_B", str(here.parent)), label="Build B plugin directory (0.9.0 / 0.10.0 line, may be in progress)", full_width=True)
    runner = mo.ui.text(value=str(here / "mission-scenarios.mjs"), label="Scenario runner (standalone Node script)", full_width=True)
    container = mo.ui.text(value=os.environ.get("SOUP_HARNESS_CONTAINER", "quatrus-harness-deepseek-harness"), label="Harness container (docker exec only)", full_width=True)
    py = mo.ui.text(value="/home/qdev/llm-runtime/tools/venvs/soup/bin/python", label="SOUP_PYTHON inside the container (official soup_cli)", full_width=True)
    live_switch = mo.ui.switch(value=True, label="Run scenarios live now (needs docker on this kernel)")
    broken_switch = mo.ui.switch(value=True, label="Include broken-copy proof (scorecard must be able to FAIL)")
    mo.vstack([build_a, build_b, runner, container, py, mo.hstack([live_switch, broken_switch], justify="start")])
    return broken_switch, build_a, build_b, container, here, live_switch, py, runner


@app.cell
def _(container, live_switch, shutil, subprocess):
    # Can THIS kernel reach docker? (The Studio container cannot; the Mac-side marimo MCP can.)
    docker_ok = False
    docker_why = "docker CLI not found on this kernel"
    if shutil.which("docker"):
        _p = subprocess.run(["docker", "exec", container.value, "true"], capture_output=True, text=True, timeout=30)
        docker_ok = _p.returncode == 0
        docker_why = "docker exec works" if docker_ok else f"docker exec failed: {_p.stderr.strip()[:200]}"
    go_live = bool(docker_ok and live_switch.value)
    return docker_ok, docker_why, go_live


@app.cell
def _(Path, ThreadPoolExecutor, broken_switch, build_a, build_b, container, go_live, json, py, runner, shutil, subprocess, time):
    # Stage copies under /tmp (the host /tmp is mounted at /home/qdev/github in the container), then run the runner.
    STAGE_ROOT = Path("/tmp/soupscore-nb")
    CONT_ROOT = "/home/qdev/github/soupscore-nb"

    def stage(src, name, patch=None):
        dst = STAGE_ROOT / name
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst, symlinks=True, ignore=shutil.ignore_patterns(".git"))
        shutil.copy(runner.value, dst / "mission-scenarios.mjs")
        applied = []
        for rel, old, new in (patch or []):
            f = dst / rel
            text = f.read_text()
            applied.append({"file": rel, "applied": old in text})
            f.write_text(text.replace(old, new))
        return applied

    def run_stage(name, label, only=""):
        cmd = ["docker", "exec", "-w", f"{CONT_ROOT}/{name}", "-e", f"SOUP_PYTHON={py.value}", container.value,
               "node", "mission-scenarios.mjs", "--label", label] + (["--only", only] if only else [])
        t0 = time.time()
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        rows, summary = {}, None
        for line in p.stdout.splitlines():
            if line.startswith("RESULT "):
                r = json.loads(line[7:]); rows[r["id"]] = r
            elif line.startswith("SUMMARY "):
                summary = json.loads(line[8:])
        return {"label": label, "rows": rows, "summary": summary, "seconds": round(time.time() - t0, 1), "exit": p.returncode, "stderr": p.stderr[-600:]}

    # Deliberately broken copies of build A (real sources are never modified; the break is made in the staged copy).
    BREAKS = {
        "evidence-dropped": {
            "what": "native drift-evidence event no longer published",
            "patch": [("dist/index.js", "() => ctx.parallel('qdev-soup/drift-evidence/v1', evidence)", "() => undefined")],
            "only": "A1,A2,A3,A4,A7,P7",
        },
        "consumer-failure-not-isolated": {
            "what": "a throwing consumer (Mentor delivery) is no longer caught in the detector",
            "patch": [("drift.mjs", "try { fn(payload) } catch (error) { reportError(error, { ...details, phase: 'consumer', consumer: name }) }", "fn(payload)")],
            "only": "P1,P7",
        },
    }

    # Pre-fix proof for the signal-channel row: build B staged, then dist/mentor-host.js restored from the pre-fix commit
    # c7cda85 (git show into the STAGED copy only; real sources are never modified).
    PREFIX = {"signal-not-isolated": {
        "what": "pre-fix 0.10.0 (commit c7cda85): the older qdev-soup/signal channel published with ctx.emit (not isolated)",
        "rev": "c7cda85", "files": ["dist/mentor-host.js"], "only": "P8,P7", "base": "B"}}
    BREAKS.update({k: {"what": v["what"], "patch": [], "only": v["only"], "base": v["base"]} for k, v in PREFIX.items()})

    def stage_prefix(src, name, spec):
        stage(src, name)
        applied = []
        for rel in spec["files"]:
            _p = subprocess.run(["git", "-C", src, "show", f"{spec['rev']}:./{rel}"], capture_output=True, text=True, timeout=60)
            _ok = _p.returncode == 0 and "emit('qdev-soup/signal'" in _p.stdout.replace("\n", " ")
            if _p.returncode == 0:
                (STAGE_ROOT / name / rel).write_text(_p.stdout)
            applied.append({"file": rel, "applied": _ok})
        return applied

    results = {}
    break_results = {}
    brk_applied = {}
    if go_live:
        def _a():
            stage(build_a.value, "buildA")
            return run_stage("buildA", "A")

        def _b():
            stage(build_b.value, "buildB")
            return run_stage("buildB", "B")

        jobs = {"A": _a, "B": _b}
        if broken_switch.value:
            for _k, _v in BREAKS.items():
                def _mk(_kk=_k, _vv=_v):
                    if _kk in PREFIX:
                        _ap = stage_prefix(build_b.value, "broken-" + _kk, PREFIX[_kk])
                    else:
                        _ap = stage(build_a.value, "broken-" + _kk, _vv["patch"])
                    brk_applied[_kk] = _ap
                    return run_stage("broken-" + _kk, "A-broken:" + _kk, _vv["only"])

                jobs["broken:" + _k] = _mk
        def _collect():
            with ThreadPoolExecutor(max_workers=4) as _ex:
                _futs = {_name: _ex.submit(_fn) for _name, _fn in jobs.items()}
                for _name, _fu in _futs.items():
                    try:
                        _out = _fu.result()
                    except Exception as _e:  # a crashed run is reported, never hidden
                        _out = {"label": _name, "rows": {}, "summary": None, "seconds": 0, "exit": -1, "stderr": f"runner crashed: {_e}"}
                    (break_results if _name.startswith("broken:") else results)[_name.replace("broken:", "")] = _out
        _collect()
        saved = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "results": results, "broken": break_results, "break_defs": {_n: {"what": _d["what"], "base": _d.get("base", "A"), "applied": brk_applied.get(_n)} for _n, _d in BREAKS.items()}, "python": py.value}
        (Path(__file__).with_name("soup_mission_scorecard_results.json")).write_text(json.dumps(saved, indent=1))
        provenance = f"LIVE run at {saved['ts']}"
    else:
        _f = Path(__file__).with_name("soup_mission_scorecard_results.json")
        if _f.exists():
            saved = json.loads(_f.read_text())
            results, break_results = saved["results"], saved["broken"]
            provenance = f"SAVED results from {saved['ts']} (NOT a live run on this kernel)"
        else:
            saved = {"break_defs": {}}
            provenance = "NO RESULTS: no docker on this kernel and no saved results file"
    return BREAKS, break_results, provenance, results, saved


@app.cell
def _(mo):
    # What an independent human would still doubt, per requirement. Written by hand, shown beside every row.
    DOUBTS = {
        "P1": "Uses one corpus, one baseline/window size, one Mentor failure mode (inbox throws). Other Mentor failure modes (hung question, slow delivery) are not driven.",
        "P2": "Structure is not behaviour; nothing here shows responsibilities are actually separated.",
        "P3": "Stand-in agent service returns nothing; a real Harness may resolve agents differently (e.g. late replay on real sessions).",
        "P4": "Uses one marginal drifting window to defeat a cumulative average; if the worker does not report drift for it the row is NOT PROVEN, not failed. Real drift patterns differ.",
        "P5": "One mid-window sensitivity change; baseline/window-size changes are not part of this row.",
        "P6": "Only the Python worker is shown DSH-independent. The plugin detector is untested without DSH-shaped events.",
        "P8": "Only the older signal channel with one sync-throwing and one async-rejecting peer; a peer that hangs forever is not tried.",
        "P7": "Two failure styles (sync throw, async reject) on the published events. A consumer that hangs forever is not tested.",
        "A1": "Peer reads the fact shape-tolerantly; it does not prove the payload shape is a stable contract across versions.",
        "A2": "Status is a consumer inside the same package; 'peer' is shown by behaviour, not by separate packaging.",
        "A3": "Early/late peers are added on the same Cordis context; a peer in a separately installed package is not tried.",
        "A4": "Zero change is shown as identical bytes; a genuinely separate plugin package loaded by a real Harness is not tried.",
        "A5": "Settings ownership is shown through behaviour of two saves; the settings UI (client.js) is not exercised.",
        "A6": "Derived evidence is observed on one policy path (3 strikes); no second consumer is built on top of it.",
        "A7": "Delivery path only. Nothing proves no private bus/registry exists in the source.",
        "M1": "Shows the plugin hands on a drift fact when the worker reports drift. The worker is a trusted given and is not judged here.",
        "M2": "Delivery to the agent is a stand-in inbox; real inbox splice confirmation and the real question UI are not exercised.",
        "M3": "OFF/ON is driven through Loader config saves; the per-chat OFF switch and the Settings UI are not clicked.",
        "M5": "The JSON is complete; whether a human can read it in the real panel is browser-rendering and is NOT proven.",
        "M7": "Stand-in agent inbox and a hand-made splice event; the real Harness inbox and the real chat transcript are not exercised. One drift, one reminder.",
        "M6": "Only the config shape is replayed; previously persisted per-chat/mentor storage records are not replayed.",
    }
    mo.md("")
    return (DOUBTS,)


@app.cell
def _(mo, provenance, results):
    # Summary banner. The pass count is ALWAYS rendered together with the NOT-PROVEN list.
    ORDER = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "M1", "M2", "M3", "M5", "M6", "M7"]

    def counts(rows):
        _c = {"PASS": 0, "FAIL": 0, "NOT-PROVEN": 0}
        for _i in ORDER:
            _c[rows.get(_i, {}).get("verdict", "NOT-PROVEN")] += 1
        return _c

    standing = [
        "Real DeepSeek Harness loading the build: NOT done. Only the Cordis Loader plus stand-in agents/storage/web/questions services.",
        "Browser rendering of the SOUP panel/tab, and a human reading the status there: NOT done.",
        "Grader claim ids: none exist; nothing here carries one.",
        "SOUP mission and permanent mission records: the knowledge graph read timed out on every attempt, so they were NOT read or kp_read verified. Rows marked 'user-stated, no graph record found' have no verified source.",
        "The SOUP worker / soup_cli is a trusted given and is NOT evaluated: no row grades its scores, false alarms or tokenisation.",
        "The natural-language conversations are mine; the P4 verdict depends on them.",
        "A requirement for which no scenario produced a check is reported NOT-PROVEN, never skipped.",
    ]

    def _banner():
        _cards = []
        for _key in sorted(results):
            _c = counts(results[_key]["rows"])
            _v = (results[_key].get("summary") or {}).get("version", "?")
            _cards.append(mo.md(f"### Build {_key}: version {_v}\n**{_c['PASS']} of {len(ORDER)}** mission requirements PROVEN, **{_c['FAIL']} FAIL**, **{_c['NOT-PROVEN']} NOT PROVEN**"))
        _np = mo.md("### NOT PROVEN / cannot be tested here\n" + "\n".join(f"- {_s}" for _s in standing))
        return mo.vstack([mo.md(f"## SOUP mission scorecard  \n_{provenance}_"), mo.hstack([mo.vstack(_cards), _np], align="start", justify="start", gap=4)])

    _banner()
    return ORDER, counts, standing


@app.cell
def _(DOUBTS, ORDER, mo, results):
    COLOR = {"PASS": "#1a7f37", "FAIL": "#cf222e", "NOT-PROVEN": "#9a6700"}

    def badge(v):
        return f'<b style="color:{COLOR.get(v, "#555")}">{v}</b>'

    def _table():
        _keys = sorted(results)
        _ref = results[_keys[0]]["rows"] if _keys else {}
        _head = "".join(f"<th>Build {_k}</th>" for _k in _keys)
        _body = ""
        for _i in ORDER:
            _r0 = _ref.get(_i, {})
            _cells = "".join(f"<td>{badge(results[_k]['rows'].get(_i, {}).get('verdict', 'NOT-PROVEN'))}</td>" for _k in _keys)
            _body += (f"<tr><td><b>{_i}</b></td><td>{_r0.get('statement', '(no result)')}</td><td><small>{_r0.get('source', '')}</small></td>"
                      f"{_cells}<td><small>{DOUBTS.get(_i, '')}</small></td></tr>")
        _t = mo.Html(f"<table style='border-collapse:collapse' border='1' cellpadding='6'><tr><th>ID</th><th>Requirement (plain language)</th><th>Source</th>{_head}<th>What a human would still doubt</th></tr>{_body}</table>")
        return mo.vstack([mo.md("## Requirements, per build, side by side"), _t])

    _table()
    return (badge,)


@app.cell
def _(ORDER, json, mo, results):
    # Evidence: the actual observed values for each row of each build.
    def _evidence():
        _blocks = []
        for _k in sorted(results):
            _items = {}
            for _i in ORDER:
                _r = results[_k]["rows"].get(_i)
                if not _r:
                    _items[f"{_i}  NOT-PROVEN (no result)"] = mo.md(f"```\n{results[_k].get('stderr', '')}\n```")
                    continue
                _lines = [f"**{_r['verdict']}**: {_r['why']}", ""]
                for _c in _r["checks"]:
                    _lines.append(f"- {'PASS' if _c['pass'] else 'FAIL'}: {_c['name']}  \n  observed: `{json.dumps(_c['observed'])[:700]}`")
                for _n in _r["notes"]:
                    _lines.append(f"- note: {_n}")
                _items[f"{_i}  {_r['verdict']}  {_r['statement'][:80]}"] = mo.md("\n".join(_lines))
            _blocks.append(mo.vstack([mo.md(f"### Build {_k}"), mo.accordion(_items)]))
        return mo.vstack([mo.md("## Evidence: observed values (expand a row)")] + _blocks)

    _evidence()
    return


@app.cell
def _(BREAKS, ORDER, badge, break_results, mo, results, saved):
    # Honesty check: the scorecard must be able to go red. Broken copies of build A; real sources untouched.
    def _broken():
        if not break_results:
            return mo.md("## Broken-copy proof\nNot present in this view (switch off, or no results).")
        _body = ""
        for _name, _br in break_results.items():
            _bk = (saved.get("break_defs", {}).get(_name) or {}).get("base", "A")
            _base = results.get(_bk, {}).get("rows", {})
            _applied = (saved.get("break_defs", {}).get(_name) or {}).get("applied")
            _ok = all(_a["applied"] for _a in _applied) if _applied else None
            for _i in ORDER:
                if _i in _br["rows"]:
                    _b = _br["rows"][_i]["verdict"]
                    _o = _base.get(_i, {}).get("verdict", "?")
                    _p = "patch applied" if _ok else ("PATCH DID NOT APPLY" if _ok is False else "?")
                    _body += f"<tr><td>{_name}</td><td>{_i}</td><td>{badge(_o)}</td><td>{badge(_b)}</td><td>{_p}</td></tr>"
        return mo.vstack([
            mo.md("## Broken-copy proof: the scorecard can fail\nThe break is made only in a staging copy (build A, or pre-fix commit c7cda85 for the signal row). Rows should turn FAIL where the break matters."),
            mo.Html(f"<table border='1' cellpadding='6' style='border-collapse:collapse'><tr><th>Broken copy</th><th>Row</th><th>Intact build</th><th>Broken copy</th><th>Patch</th></tr>{_body}</table>"),
            mo.md("\n".join(f"- **{_k}**: {_v['what']}" for _k, _v in BREAKS.items())),
        ])

    _broken()
    return


@app.cell
def _(docker_ok, docker_why, mo, shutil):
    mo.md(f"""
    ## How this ran
    - docker reachable from this kernel: **{docker_ok}** ({docker_why}); `docker` on PATH: {bool(shutil.which('docker'))}
    - Execution: staging copies under `/tmp/soupscore-nb`, then `docker exec -w <stage> -e SOUP_PYTHON=... <harness> node mission-scenarios.mjs`. No start/stop/restart; the live container, its profile and config are not modified.
    - Stand-ins (external DSH services only): `agents` (list/get), `storageDomain` (in memory), `webServer` (route table), `userQuestions` (manual promise). Everything else is real: Cordis Loader, built `dist/index.js`, dsh-session events, `soup_worker.py`, `soup_cli`.
    - Peers are written inside the scenarios and use only `ctx.on`.
    """)
    return


if __name__ == "__main__":
    app.run()
