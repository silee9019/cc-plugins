#!/bin/sh
set -eu

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DATA_DIR="$PLUGIN_ROOT/data/sessions"

input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

[ -z "$session_id" ] && exit 0

SESSION_DIR="$DATA_DIR/$session_id"

refresh_cost() {
  local script="$PLUGIN_ROOT/scripts/refresh-cost.ts"
  [ -f "$script" ] && nohup bun run "$script" >/dev/null 2>&1 &
}

auto_setup() {
  local settings="$HOME/.claude/settings.json"
  local sl_cmd="sh $PLUGIN_ROOT/scripts/statusline.sh"

  [ ! -f "$settings" ] && return 0

  local current
  current=$(jq -r '.statusLine.command // empty' "$settings" 2>/dev/null) || return 0
  [ "$current" = "$sl_cmd" ] && return 0

  local tmp="$settings.tmp.$$"
  jq --arg cmd "$sl_cmd" '.statusLine = {"type": "command", "command": $cmd}' "$settings" > "$tmp" && mv "$tmp" "$settings"
}

case "$event" in
  SessionStart)
    mkdir -p "$SESSION_DIR"
    [ ! -f "$SESSION_DIR/prompt-count" ] && printf '0' > "$SESSION_DIR/prompt-count"
    find "$DATA_DIR" -maxdepth 1 -mindepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
    refresh_cost
    auto_setup
    ;;
  Stop)
    [ ! -d "$SESSION_DIR" ] && exit 0
    local_count=$(cat "$SESSION_DIR/prompt-count" 2>/dev/null || echo 0)
    printf '%d' "$((local_count + 1))" > "$SESSION_DIR/prompt-count"
    refresh_cost
    ;;
esac
