#!/bin/bash
# Export any marimo notebook to HTML, and fail if a cell fails.
#
# WHY EXPORT (and not just check):
#   `marimo check` only lints the code. It cannot tell whether the cells run.
#   `marimo export` runs every cell top to bottom, so it is the test that the notebook actually works.
#   The HTML it writes is also a snapshot anyone can read without opening Studio.
#   Exit status is not enough: a cell can fail while the export still succeeds, so we also search the
#   HTML for error markers.
#
# Usage:
#   scripts/export-marimo-notebook.sh <notebook.py> [output.html]
#
# Modes:
#   Local (default): runs marimo through uv, which reads the notebook's own PEP 723 dependency header.
#   Studio container: set MARIMO_CONTAINER=<name>. The notebook is copied into /home/marimo/notebooks,
#     checked and exported with the server's own marimo, and the HTML is copied back.
#     Packages the notebook imports must already exist in that container. A missing one shows up as an
#     error in the export, and the script reports it. It does not install anything there.
set -euo pipefail

NB="${1:?usage: $0 <notebook.py> [output.html]}"
[ -f "$NB" ] || { echo "no such notebook: $NB" >&2; exit 2; }
OUT="${2:-${NB%.py}.html}"
BASE="$(basename "$NB")"
ERROR_MARK="Traceback\|MarimoExceptionRaisedError\|some cells failed"

if [ -n "${MARIMO_CONTAINER:-}" ]; then
  C="$MARIMO_CONTAINER"
  docker cp "$NB" "$C:/home/marimo/notebooks/$BASE"
  docker exec "$C" sh -c "cd /home/marimo/notebooks && marimo check '$BASE'"
  docker exec "$C" sh -c "cd /home/marimo/notebooks && marimo export html '$BASE' -o /tmp/$BASE.html" || true
  docker cp "$C:/tmp/$BASE.html" "$OUT"
  HTML_OUT="$OUT"
else
  # Read the notebook's PEP 723 dependency list and pass each one to uv, so the export sees the same packages the notebook declares.
  # The header is TOML inside comment lines. tomllib reads it whatever its layout (one line or many).
  # (Plain loop, not mapfile: macOS ships bash 3.2, which has no mapfile.)
  DEPS_PY='import re, sys, tomllib
src = open(sys.argv[1]).read()
m = re.search(r"^# /// script\n(.*?)^# ///", src, re.M | re.S)
if m:
    block = "\n".join(l[2:] if l.startswith("# ") else l[1:] for l in m.group(1).splitlines())
    for dep in tomllib.loads(block).get("dependencies", []):
        print(dep)'
  WITH=(--with marimo)
  while IFS= read -r dep; do
    WITH+=(--with "$dep")
  done < <(python3 -c "$DEPS_PY" "$NB")
  uv run "${WITH[@]}" marimo check "$NB"
  # marimo can return 0 when a cell failed, so the HTML is searched below. A missing file is a failure.
  uv run "${WITH[@]}" marimo export html "$NB" -o "$OUT" || true
  HTML_OUT="$OUT"
fi

if [ ! -s "$HTML_OUT" ]; then
  echo "export of $BASE produced no HTML at $HTML_OUT" >&2
  exit 1
fi
if grep -q "$ERROR_MARK" "$HTML_OUT"; then
  echo "export of $BASE contains a cell error; see $HTML_OUT" >&2
  exit 1
fi
echo "exported $BASE -> $HTML_OUT (all cells ran)"
