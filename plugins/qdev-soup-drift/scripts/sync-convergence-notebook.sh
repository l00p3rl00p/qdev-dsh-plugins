#!/bin/bash
# Sync the convergence simulation notebook into the Studio container, make sure its dependencies exist there,
# then check and export it with the server's own marimo. Fails loudly on any error.
# Required: MARIMO_CONTAINER=<studio-container> (the container that serves your Marimo Studio).
# Optional: MARIMO_NOTEBOOK_DIR (default /home/marimo/notebooks, the notebook folder inside that container).
set -euo pipefail

C="${MARIMO_CONTAINER:?set MARIMO_CONTAINER to the name of your Marimo Studio container}"
NBDIR="${MARIMO_NOTEBOOK_DIR:-/home/marimo/notebooks}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/notebooks/convergence_simulation.py"
DEST="$NBDIR/convergence_simulation.py"

docker cp "$SRC" "$C:$DEST"

# matplotlib is not part of the Studio image; install it only when missing.
docker exec "$C" sh -c 'python3 -c "import matplotlib" 2>/dev/null || python3 -m pip install -q matplotlib'

docker exec "$C" sh -c "cd $NBDIR && marimo check convergence_simulation.py"
docker exec "$C" sh -c "cd $NBDIR && marimo export html convergence_simulation.py -o /tmp/convergence_simulation.html"
if docker exec "$C" grep -q "Traceback\|MarimoExceptionRaisedError" /tmp/convergence_simulation.html; then
  echo "notebook raised an error in $C" >&2
  exit 1
fi
echo "convergence_simulation.py synced, checked and exported in $C"
