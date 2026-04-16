#!/bin/sh
set -eu
# skill-tracker.sh — PostToolUse hook: Skill 도구 호출을 메트릭 DB에 기록
# stdin: {"tool_name":"Skill","tool_input":{"skill":"memento:checkpoint","args":"..."},...}

INPUT=$(cat)
SKILL_NAME=$(printf '%s' "$INPUT" | sed -n 's/.*"skill":"\([^"]*\)".*/\1/p')
[ -z "$SKILL_NAME" ] && exit 0

. "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-home.sh"
[ -z "$MEMENTO_HOME" ] && exit 0

. "${CLAUDE_PLUGIN_ROOT}/scripts/metrics-db.sh" "$MEMENTO_HOME"
metrics_init
metrics_emit "hook" "skill_invocation" "" "{\"skill\":\"$SKILL_NAME\"}"
