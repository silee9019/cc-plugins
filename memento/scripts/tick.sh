#!/bin/sh
# memento tick — turn-boundary hook (KST 시각 주입 + 완료 효과음)
#
# Fires on two events:
#   - Stop: assistant 응답 완료 직후. KST 시각 주입 + 완료 효과음 재생.
#   - UserPromptSubmit: 사용자 프롬프트 직후. KST 시각만 주입 (효과음 없음).
#
# 효과음은 hook_event_name=="Stop" 일 때만 재생하며, 사운드 파일이 존재할 때만
# 실행 (비-macOS 등에서 silent 통과). afplay 는 백그라운드 실행으로 훅 반환을
# 지연시키지 않음.
#
# Output: plain stdout, no JSON.

set -eu

INPUT=$(cat 2>/dev/null || true)
EVENT=$(printf '%s' "$INPUT" | sed -n 's/.*"hook_event_name":"\([^"]*\)".*/\1/p')

KST_TIME=$(TZ=Asia/Seoul date "+%H:%M KST")
printf '현재 시각 %s\n' "$KST_TIME"

if [ "$EVENT" = "Stop" ]; then
  SOUND=/System/Library/Sounds/Funk.aiff
  [ -f "$SOUND" ] && afplay "$SOUND" 2>/dev/null &
fi
