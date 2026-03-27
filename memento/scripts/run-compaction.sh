#!/bin/sh
set -eu
# memento 전용 컴팩션 래퍼 — bun run compact.mjs만 실행
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v bun >/dev/null 2>&1; then
  echo "[memento] bun not found — compaction skipped. Install: https://bun.sh" >&2
  exit 1
fi
exec bun run "$SCRIPT_DIR/compact.mjs"
