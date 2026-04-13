#!/bin/sh
# kr-workday-context — SessionStart hook entry
# Delegates to workday_context.py for KST time + Korean business day injection.
# Runs non-blocking; any failure is logged to stderr but must not break the session.

set -eu

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Drain stdin so upstream hook pipeline does not stall.
cat >/dev/null 2>&1 || true

if ! command -v python3 >/dev/null 2>&1; then
  echo "[kr-workday-context] python3 not found — skipping" >&2
  exit 0
fi

python3 "$PLUGIN_ROOT/scripts/workday_context.py" --plugin-root "$PLUGIN_ROOT" || {
  echo "[kr-workday-context] workday_context.py failed — skipping" >&2
  exit 0
}
