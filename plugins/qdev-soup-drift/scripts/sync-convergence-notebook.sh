#!/bin/bash
# Sync the convergence simulation notebook into the Studio container, make sure its dependencies exist there,
# then check and export it with the server's own marimo. Fails loudly on any error.
# Container: quatrus-development-marimo (serves Studio on 127.0.0.1:2718). Override with MARIMO_CONTAINER.
set -euo pipefail

C="${MARIMO_CONTAINER:-quatrus-development-marimo}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/notebooks/convergence_simulation.py"
DEST="/home/marimo/notebooks/convergence_simulation.py"

docker cp "$SRC" "$C:$DEST"

# matplotlib is not part of the Studio image; install it only when missing.
docker exec "$C" sh -c 'python3 -c "import matplotlib" 2>/dev/null || python3 -m pip install -q matplotlib'

docker exec "$C" sh -c "cd /home/marimo/notebooks && marimo check convergence_simulation.py"
docker exec "$C" sh -c "cd /home/marimo/notebooks && marimo export html convergence_simulation.py -o /tmp/convergence_simulation.html"
if docker exec "$C" grep -q "Traceback\|MarimoExceptionRaisedError" /tmp/convergence_simulation.html; then
  echo "notebook raised an error in $C" >&2
  exit 1
fi
echo "convergence_simulation.py synced, checked and exported in $C"
