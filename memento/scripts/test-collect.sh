#!/bin/sh
# test-collect.sh — review-week 수집 스크립트 5종 통합 smoke test
# Usage: bash test-collect.sh [START] [END]
#   기본: 2026-04-13 ~ 2026-04-17 (스크립트 작성 당시 검증 데이터셋)
#
# config.md에서 vault/repos 경로를 읽고 5종 스크립트 + bundle_week.py를
# 호출, jq로 counts와 한국어 round-trip을 검증한다.
# pytest 미설치 환경(현 cc-plugins 표준)을 가정해 순수 shell + jq로 작성.

set -eu

START="${1:-2026-04-13}"
END="${2:-2026-04-17}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$HOME/.claude/plugins/data/memento-cc-plugins/config.md"

if [ ! -f "$CONFIG" ]; then
  echo "FAIL: config not found at $CONFIG"
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "FAIL: jq not installed"
  exit 1
fi

read_field() {
  sed -n "s/^$1: *\"\\{0,1\\}\\([^\"]*\\)\"\\{0,1\\} *\$/\\1/p" "$CONFIG" | head -1
}

VAULT="$(read_field vault_path)"
DAILY_DIR="$(read_field daily_notes_path)"
DAILY_FMT="$(read_field daily_note_format)"
ARCHIVE_DIR="$(read_field daily_archive_path)"
ARCHIVE_FMT="$(read_field daily_archive_format)"
INBOX="$(read_field inbox_folder_path)"
IN_PROG="$(read_field in_progress_folder_path)"
RESOLVED="$(read_field resolved_folder_path)"
DISMISSED="$(read_field dismissed_folder_path)"
REPOS="$(read_field repos_base_path)"
EMAIL="$(read_field email)"
MEMENTO_ROOT="$(read_field memento_root)"
MEMENTO_HOME="$VAULT/${MEMENTO_ROOT:-97 Memento}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PASS=0
FAIL=0

check() {
  desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "== test-collect.sh =="
echo "period: $START ~ $END"
echo "vault:  $VAULT"
echo

echo "[1/6] collect_daily_notes.py"
python3 "$SCRIPT_DIR/collect_daily_notes.py" "$VAULT" "$DAILY_DIR" "$DAILY_FMT" \
  "$ARCHIVE_DIR" "$ARCHIVE_FMT" "$START" "$END" > "$TMPDIR/daily.json"
check "exit 0 + valid JSON" jq empty "$TMPDIR/daily.json"
check "counts.daily_notes >= 1" jq -e '.counts.daily_notes >= 1' "$TMPDIR/daily.json"
check "한국어 round-trip" sh -c "grep -q '한' '$TMPDIR/daily.json' || jq -r '.notes[].log[]?' '$TMPDIR/daily.json' | grep -q '[가-힣]'"

echo "[2/6] collect_memento_logs.py (skeleton)"
python3 "$SCRIPT_DIR/collect_memento_logs.py" "$MEMENTO_HOME/projects" "$START" "$END" > "$TMPDIR/memento.json"
check "exit 0 + valid JSON" jq empty "$TMPDIR/memento.json"
check "schema_version == tbd" jq -e '.schema_version == "tbd"' "$TMPDIR/memento.json"
check "sessions == []" jq -e '.sessions == []' "$TMPDIR/memento.json"

echo "[3/6] collect_commits.py"
python3 "$SCRIPT_DIR/collect_commits.py" "$REPOS" "$EMAIL" "$START" "$END" > "$TMPDIR/commits.json"
check "exit 0 + valid JSON" jq empty "$TMPDIR/commits.json"
check "counts.commits >= 0" jq -e '.counts.commits >= 0' "$TMPDIR/commits.json"

echo "[4/6] collect_issues.py"
python3 "$SCRIPT_DIR/collect_issues.py" "$VAULT" "$INBOX" "$IN_PROG" "$RESOLVED" "$DISMISSED" "$START" "$END" > "$TMPDIR/issues.json"
check "exit 0 + valid JSON" jq empty "$TMPDIR/issues.json"
check "counts.issues >= 0" jq -e '.counts.issues >= 0' "$TMPDIR/issues.json"

echo "[5/6] jira/confluence stubs"
echo '{"issues": []}' > "$TMPDIR/jira.json"
echo '{"pages": []}' > "$TMPDIR/confluence.json"

echo "[6/6] bundle_week.py"
python3 "$SCRIPT_DIR/bundle_week.py" "$TMPDIR/daily.json" "$TMPDIR/memento.json" \
  "$TMPDIR/commits.json" "$TMPDIR/issues.json" "$TMPDIR/jira.json" "$TMPDIR/confluence.json" \
  > "$TMPDIR/timeline.json"
check "exit 0 + valid JSON" jq empty "$TMPDIR/timeline.json"
check "timeline non-empty" jq -e '.timeline | length > 0' "$TMPDIR/timeline.json"
check "counts has all 7 keys" jq -e '.counts | (.daily_notes != null and .memento_sessions != null and .commits != null and .active_repos != null and .issues != null and .jira_issues != null and .confluence_pages != null)' "$TMPDIR/timeline.json"
check "timeline sorted by date" sh -c "jq -r '.timeline[].date' '$TMPDIR/timeline.json' | sort -c"

echo
echo "== summary =="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
