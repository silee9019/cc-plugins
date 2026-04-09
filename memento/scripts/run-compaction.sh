#!/bin/sh
# memento compaction runner — auto-upgrade (self-healing cache) + bun run compact.mjs
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Auto-upgrade (self-healing cache) ───
# CURRENT_VER: cache dir name is the version (e.g. .../memento/1.6.5/)
MARKETPLACE_PLUGIN="$HOME/.claude/plugins/marketplaces/cc-plugins/memento/.claude-plugin/plugin.json"
if [ -f "$MARKETPLACE_PLUGIN" ]; then
  CURRENT_VER="$(basename "$PLUGIN_ROOT")"
  LATEST_VER="$(grep '"version"' "$MARKETPLACE_PLUGIN" | head -1 | cut -d'"' -f4)"
  if [ -n "$LATEST_VER" ] && [ "$CURRENT_VER" != "$LATEST_VER" ]; then
    NEW_CACHE="$HOME/.claude/plugins/cache/cc-plugins/memento/$LATEST_VER"
    if [ -d "$NEW_CACHE" ]; then
      # Update installed_plugins.json — gate for re-exec
      UPGRADE_OK=false
      INST_FILE="$HOME/.claude/plugins/installed_plugins.json"
      if [ -f "$INST_FILE" ] && command -v jq >/dev/null 2>&1; then
        if jq --arg p "$NEW_CACHE" --arg v "$LATEST_VER" \
          '(.plugins["memento@cc-plugins"][0].installPath=$p)|(.plugins["memento@cc-plugins"][0].version=$v)' \
          "$INST_FILE" > "$INST_FILE.tmp" && [ -s "$INST_FILE.tmp" ]; then
          mv "$INST_FILE.tmp" "$INST_FILE"
          UPGRADE_OK=true
        else
          rm -f "$INST_FILE.tmp"
          echo "[memento] auto-upgrade: failed to update installed_plugins.json" >&2
        fi
      fi
      if [ "$UPGRADE_OK" = true ]; then
        # Re-exec from new cache (old cache cleanup via /memento:setup)
        exec sh "$NEW_CACHE/scripts/run-compaction.sh"
      else
        echo "[memento] auto-upgrade: skipped (registry update failed)" >&2
      fi
    fi
  fi
fi

# ─── Run compaction ───
if ! command -v bun >/dev/null 2>&1; then
  echo "[memento] bun not found — compaction skipped." >&2
  exit 1
fi
exec bun run "$SCRIPT_DIR/compact.mjs" "$@"
