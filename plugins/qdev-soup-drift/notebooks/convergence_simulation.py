# /// script
# requires-python = ">=3.10"
# dependencies = ["marimo", "numpy", "matplotlib"]
# ///
# Simulation of the Convergence logic (SOUP Live & Mentor, Appendix 11).
# SYNTHETIC DATA ONLY. The logic here mirrors client.js (spcAnalysis, failureType,
# qualifiedConvergence). It is a check of the reasoning, not of the live Harness.

import marimo

__generated_with = "0.20.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import numpy as np
    import matplotlib.pyplot as plt
    return mo, np, plt


@app.cell
def _(mo):
    import textwrap

    mo.md(
        textwrap.dedent(
            """
            # Convergence simulation (synthetic)

            Scenarios generate calculations (KL readings) and tool failures. The same rules as
            `client.js` then decide what the evidence supports. **Nothing here is a real chat.**
            Use the controls to change the threshold, noise and scenario.
            """
        )
    )
    return


@app.cell
def _(mo):
    scenario = mo.ui.dropdown(
        options={
            "steady: no signal": "steady",
            "riding the edge: just under the limit": "edge",
            "one spike": "spike",
            "one tool repeating one failure": "repeat",
            "one failure across two tools": "shared",
        },
        value="riding the edge: just under the limit",
        label="scenario",
    )
    threshold = mo.ui.slider(0.05, 0.4, value=0.2, step=0.01, label="decision threshold")
    noise = mo.ui.slider(0.0, 0.02, value=0.005, step=0.001, label="noise (sd)")
    seed = mo.ui.number(1, 999, value=7, label="random seed")
    mo.hstack([scenario, threshold, noise, seed])
    return noise, scenario, seed, threshold


@app.cell
def _(np, noise, scenario, seed, threshold):
    # Synthetic calculations (KL) and tool calls. Time is the calculation index.
    rng = np.random.default_rng(int(seed.value))
    n = 24
    L = threshold.value
    sd = noise.value
    kl = 0.4 * L + rng.normal(0, sd, n)
    tools = []
    if scenario.value == "edge":
        kl[-10:] = 0.95 * L + rng.normal(0, sd, 10)
    if scenario.value == "spike":
        kl[15] = 2.5 * L
    if scenario.value == "repeat":
        for at in (12, 16, 19):
            kl[at] = 0.9 * L
            tools.append({"name": "web_fetch", "at": at, "reason": f"Request timed out after {25 + at} seconds"})
    if scenario.value == "shared":
        for at, name in ((9, "edit"), (13, "write"), (17, "edit")):
            kl[at] = 0.85 * L
            tools.append({"name": name, "at": at, "reason": f"Malformed edit: old_string not found at line {at * 3}"})
    kl = np.clip(kl, 0, None)
    return L, kl, n, tools


@app.cell
def _(np):
    # Mirrors spcAnalysis in client.js: sigma from the average moving range (d2 = 1.128).
    def spc_analysis(values):
        values = np.asarray(values, dtype=float)
        if len(values) < 8:
            return None
        mean = values.mean()
        moving = np.abs(np.diff(values))
        sigma = moving.mean() / 1.128
        ucl = mean + 3 * sigma
        lcl = max(0.0, mean - 3 * sigma)
        flags = []
        for i, v in enumerate(values):
            if v > ucl or v < lcl:
                flags.append((i, "Rule 1"))
        for i in range(2, len(values)):
            w = values[i - 2 : i + 1]
            if sum(w > mean + 2 * sigma) >= 2 or sum(w < mean - 2 * sigma) >= 2:
                flags.append((i, "Rule 2"))
        for i in range(7, len(values)):
            w = values[i - 7 : i + 1]
            if np.all(w > mean) or np.all(w < mean):
                flags.append((i, "Rule 4"))
        return {"mean": mean, "sigma": sigma, "ucl": ucl, "lcl": lcl, "flags": flags}

    return (spc_analysis,)


@app.cell
def _():
    # Mirrors failureType in client.js: lowercase, digits to '#', quotes removed, first six words.
    import re

    def failure_type(reason, tool_name):
        r = re.sub(r"[0-9]+", "#", reason.lower()).replace('"', "").replace("'", "").replace("`", "")
        words = " ".join(r.split()[:6])
        return words or f"{tool_name} failed (no reason recorded)"

    return (failure_type,)


@app.cell
def _(L, failure_type, kl, n, np, spc_analysis, tools):
    # Mirrors qualifiedConvergence in client.js. Levels count independent source families:
    # calculations and tool telemetry. 1 = observed, 2 = corroborated, 3+ = convergent.
    spc = spc_analysis(kl)
    candidates = []
    if n >= 3 and all(0.5 * L <= v < L for v in kl[-3:]):
        candidates.append(("riding just under the limit", {"calculations"}))
    if spc and spc["flags"]:
        candidates.append(("a special cause is moving the calculations", {"calculations"}))
    groups = {}
    for t in tools:
        groups.setdefault(failure_type(t["reason"], t["name"]), []).append(t)
    for failure_kind, calls in groups.items():
        if len(calls) < 2:
            continue
        srcs = {"tool telemetry"}
        lo = min(c["at"] for c in calls)
        hi = max(c["at"] for c in calls)
        if any(0.5 * L <= kl[i] for i in range(lo, hi + 1)):
            srcs.add("calculations")
        candidates.append((f"the same failure keeps recurring: {failure_kind}", srcs))
    level = {1: "observed", 2: "corroborated"}
    rows = [
        f"| {('convergent' if len(s) >= 3 else level.get(len(s), 'observed'))} | {e} | {' + '.join(sorted(s))} |"
        for e, s in candidates
    ]
    table = (
        "| level | candidate event (hypothesis) | independent sources |\n|---|---|---|\n" + "\n".join(rows)
        if rows
        else "No candidate event. The evidence in this scenario does not support a convergence."
    )
    return candidates, groups, spc, table


@app.cell
def _(mo, table):
    mo.md(f"## What the evidence supports (simulation)\n\n{table}\n\n*Every level is a hypothesis to verify, not a verified event.*")
    return


@app.cell
def _(L, kl, n, np, plt, spc):
    # Control chart: centre, limits (from the average moving range), and the threshold.
    fig, ax = plt.subplots(figsize=(8, 3.2))
    x = np.arange(n)
    ax.plot(x, kl, marker="o", ms=3, lw=1, color="#333", label="KL (simulated)")
    if spc:
        ax.axhline(spc["mean"], color="#1f77b4", lw=1, label="centre")
        ax.axhline(spc["ucl"], color="#d62728", ls="--", lw=1, label="UCL (3 sigma)")
        ax.axhline(spc["lcl"], color="#d62728", ls="--", lw=1, label="LCL")
        for i, rule in spc["flags"]:
            ax.plot(i, kl[i], "o", color="#d62728", ms=7)
    ax.axhline(L, color="#ff7f0e", ls=":", lw=1.2, label="decision threshold (not SPC)")
    ax.set_xlabel("calculation (simulated)")
    ax.set_ylabel("KL")
    ax.set_title("Control chart (simulation): centre, limits and the decision threshold are different things")
    ax.legend(fontsize=7, loc="upper left", ncol=2)
    fig.tight_layout()
    fig
    return


@app.cell
def _(groups, plt):
    # Failure scatter: one lane per failure type, one dot per failure, time = calculation index.
    fig2, ax2 = plt.subplots(figsize=(8, 1.2 + 0.6 * max(1, len(groups))))
    for lane, (_kind, _calls) in enumerate(groups.items()):
        ax2.scatter([c["at"] for c in _calls], [lane] * len(_calls), color="#d62728", s=40)
    ax2.set_yticks(range(len(groups)))
    ax2.set_yticklabels([g[:38] for g in groups], fontsize=7)
    ax2.set_xlabel("calculation (simulated)")
    ax2.set_title("Failures by type over time (simulation)")
    fig2.tight_layout()
    fig2 if groups else "No failures in this scenario."
    return


if __name__ == "__main__":
    app.run()
