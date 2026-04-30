#!/bin/sh
set -eu

# build-html.sh — 마크다운을 공유용 standalone HTML로 변환
# Steps: preprocess → pandoc(--toc) → 사이드바 미니맵 JS 주입 → 브라우저 열기
# 사용법: build-html.sh <input.md> [--no-open] [--depth N]
#   --depth N   네비 TOC에 노출할 헤더 레벨 (기본 2, h1~hN까지)
#   --no-open   변환만 수행, 브라우저 열지 않음

INPUT=""
NO_OPEN=0
TOC_DEPTH=4

while [ $# -gt 0 ]; do
  case "$1" in
    --no-open) NO_OPEN=1; shift ;;
    --depth) TOC_DEPTH="$2"; shift 2 ;;
    --depth=*) TOC_DEPTH="${1#--depth=}"; shift ;;
    -h|--help)
      printf 'Usage: build-html.sh <input.md> [--no-open] [--depth N]\n'
      exit 0 ;;
    *)
      if [ -z "$INPUT" ]; then INPUT="$1"; else
        printf 'Error: unexpected arg: %s\n' "$1" >&2; exit 1
      fi
      shift ;;
  esac
done

if [ -z "$INPUT" ]; then
  printf 'Usage: build-html.sh <input.md> [--no-open] [--depth N]\n' >&2
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  printf 'Error: file not found: %s\n' "$INPUT" >&2
  exit 1
fi

if ! command -v pandoc >/dev/null 2>&1; then
  printf 'Error: pandoc is required. Install: brew install pandoc\n' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$PLUGIN_ROOT/skills/share-document"
STYLE_CSS="$SKILL_DIR/style.css"
NAV_JS="$SKILL_DIR/sidebar-nav.js"

OUTPUT="${INPUT%.md}.html"

TMP_MD="$(mktemp /tmp/share-doc-XXXXXX.md)"
TMP_AFTER="$(mktemp /tmp/share-doc-after-XXXXXX.html)"
trap 'rm -f "$TMP_MD" "$TMP_AFTER"' EXIT INT TERM

sh "$SCRIPT_DIR/preprocess.sh" "$INPUT" > "$TMP_MD"

{
  printf '<script>\n'
  cat "$NAV_JS"
  printf '\n</script>\n'
} > "$TMP_AFTER"

pandoc "$TMP_MD" \
  -t html5 \
  --standalone \
  --toc \
  --toc-depth="$TOC_DEPTH" \
  --section-divs \
  --css="$STYLE_CSS" \
  --embed-resources \
  --include-after-body="$TMP_AFTER" \
  -V lang=ko \
  -o "$OUTPUT"

printf '%s\n' "$OUTPUT"

if [ "$NO_OPEN" -eq 0 ]; then
  case "$(uname -s)" in
    Darwin) open "$OUTPUT" ;;
    Linux)  xdg-open "$OUTPUT" >/dev/null 2>&1 || true ;;
    MINGW*|MSYS*|CYGWIN*) start "$OUTPUT" ;;
  esac
fi
