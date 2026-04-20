#!/bin/sh
# memento inject-timestamp — KST timestamp injection hook
#
# Emits the current KST wall-clock time so Claude always has a fresh clock
# reference in its next turn. Fires on two events:
#   - Stop: assistant 응답 완료 직후 "완료 HH:MM KST" 서술에 사용
#   - UserPromptSubmit: 사용자 프롬프트 입력 직후 현재 시각을 세션 맥락에 주입
#
# Output: plain stdout, no JSON.

set -eu

KST_TIME=$(TZ=Asia/Seoul date "+%H:%M KST")
printf '현재 시각 %s\n' "$KST_TIME"
