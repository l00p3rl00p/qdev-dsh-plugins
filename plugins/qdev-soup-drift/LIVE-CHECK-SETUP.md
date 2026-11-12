# Live check setup: how to drive the running Harness

Read this before saying "Playwright is not installed" or "I have no browser". Playwright IS installed. The problem was setup, not the tool.

## 1. The browser (playwright-cli)

- Tool: `/usr/local/bin/playwright-cli` (package `@playwright/cli`).
- Permanent browser install: `/opt/ms-playwright` (contains `chromium-1252`, `chromium_headless_shell-1252`, `firefox-1569`, `webkit-2386`, `ffmpeg-1013`). Do NOT install or overwrite browsers. Chromium is a permanent install.
- The default cache path `/home/qdev/.cache/ms-playwright` is NOT writable by this session (EACCES). Work around it with environment variables, not by installing:

```bash
export XDG_CACHE_HOME=/tmp/qdev-cache
export PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
mkdir -p "$XDG_CACHE_HOME"
playwright-cli open --browser=chromium http://127.0.0.1:3080/
```

- Plain `playwright-cli open <url>` (without `--browser=chromium`) fails looking for `/opt/google/chrome/chrome`. Always pass `--browser=chromium`.
- The Playwright MCP tool (`mcp__playwright__*`) fails on `/home/qdev/.cache/ms-playwright-mcp`. Use the CLI instead.

## 2. Login (the 401)

- The Harness web UI at `http://127.0.0.1:3080/` returns `401 Unauthorized` without a session cookie.
- The login link is the URL printed by `dsh web` at startup. It carries the access token.
- That output is written to `/home/qdev/.dsh/startup-diagnostics/dsh-web-output.log`, which this session cannot read.
- A cached login is expected: the browser session keeps a cookie once the token-bearing URL has been opened. Persist it with `playwright-cli state-save` and reload it with `playwright-cli state-load` in later sessions.
- Do not pull tokens out of other processes. Ask the owner for the printed URL, or ask them to log in once.

## 3. Driving the live check

Once logged in:

```bash
playwright-cli snapshot
playwright-cli find "Convergence"
```

Then generate readings with the prompts in `HANDOFF-APPENDIX11.md` (prompts 1–7), and confirm on the Convergence tab:
- the drill-down sections;
- the focus buttons (coherence ≥ 0.5, coherence ≥ 0.7, dispersion σ ≤ 0.10);
- the "Test outcomes in this window" section showing "failed".

## 4. Other CLI facts (verified)

- `dsh headless "<task>"` fails with EACCES on `/home/qdev/.dsh/profiles/headless/package.json`.
- `dsh plugin --profile web list` fails with EACCES on `/home/qdev/.dsh/profiles/web/`.
- Bash cannot read the repo (`git` reports "not a git repository" and `ls` is denied), but the Read/Glob/Grep file tools can read it.

## 5. Known blockers to ask about, not work around

- Sandbox file denials on `/home/qdev/.dsh/` and `/home/qdev/.cache/`. Ask the owner to grant access. Do not widen permissions silently.
- The web UI token. Ask the owner.
