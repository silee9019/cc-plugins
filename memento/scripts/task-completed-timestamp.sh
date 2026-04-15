#!/bin/sh
# memento task-completed-timestamp — PostToolUse hook for TaskUpdate
#
# When a TaskUpdate call marks a task as `completed`, inject the current KST
# wall-clock time (HH:MM) into Claude's next-turn context. This lets the agent
# reflect "완료 HH:MM KST" in its user-visible summary without asking for the
# time separately.
#
# Activation:
#   - PostToolUse matcher: "TaskUpdate"
#   - Only fires when tool_input.status contains "completed"
#   - No-op otherwise (exit 0, no stdout)

set -eu

STDIN_DATA="$(cat)"

# Filter: only care about TaskUpdate with status=completed.
# We intentionally use grep rather than a JSON parser — sh compatibility and
# no extra runtime dependencies. The matcher in hooks.json already narrows to
# TaskUpdate, so this is a second safety check.
TOOL_NAME=$(printf '%s' "$STDIN_DATA" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$TOOL_NAME" != "TaskUpdate" ]; then
  exit 0
fi

# tool_input.status may appear anywhere in the tool_input object.
STATUS=$(printf '%s' "$STDIN_DATA" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$STATUS" != "completed" ]; then
  exit 0
fi

KST_TIME=$(TZ=Asia/Seoul date "+%H:%M KST")

# Emit PostToolUse hookSpecificOutput with additionalContext. Claude reads this
# on the next turn and should surface the timestamp in the completion summary.
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "현재 시각 $KST_TIME"
  }
}
EOF
