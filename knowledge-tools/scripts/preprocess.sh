#!/bin/sh
set -eu

# preprocess.sh — Obsidian→pandoc 호환성 전처리
# 리스트 항목 앞에 빈 줄이 없으면 삽입 (pandoc strict parsing 보정)
# 사용법: preprocess.sh <input.md>

if [ $# -lt 1 ]; then
  printf 'Usage: preprocess.sh <input.md>\n' >&2
  exit 1
fi

INPUT="$1"

if [ ! -f "$INPUT" ]; then
  printf 'Error: file not found: %s\n' "$INPUT" >&2
  exit 1
fi

awk '{
  is_list = match($0, /^[[:space:]]*([-*+]|[0-9]+\.) /)
  prev_is_text = (NR > 1 && prev != "" && !match(prev, /^[[:space:]]*([-*+]|[0-9]+\.) /))

  if (is_list && prev_is_text) print ""
  print
  prev = $0
}' "$INPUT"
