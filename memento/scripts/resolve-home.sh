#!/bin/sh
# resolve-home.sh — config.md에서 MEMENTO_HOME을 해석하는 공유 헬퍼
# Usage: . resolve-home.sh
# Sets: MEMENTO_HOME (빈 문자열이면 config 없음)

_MEMENTO_CONFIG="$HOME/.claude/plugins/data/memento-cc-plugins/config.md"
if [ -f "$_MEMENTO_CONFIG" ]; then
  VAULT_PATH=$(sed -n 's/^vault_path: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p' "$_MEMENTO_CONFIG" | head -1)
  MEMENTO_ROOT=$(sed -n 's/^memento_root: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p' "$_MEMENTO_CONFIG" | head -1)
  MEMENTO_ROOT="${MEMENTO_ROOT:-97 Memento}"
  MEMENTO_HOME="$VAULT_PATH/$MEMENTO_ROOT"
else
  MEMENTO_HOME=""
fi
