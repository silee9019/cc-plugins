#!/bin/sh
set -eu
# metrics-report.sh — 메트릭 DB에서 집계하여 마크다운 테이블 출력
# Usage: metrics-report.sh MEMENTO_HOME

MEMENTO_HOME="${1:?Usage: metrics-report.sh MEMENTO_HOME}"
METRICS_DB="$MEMENTO_HOME/metrics/metrics.db"

if [ ! -f "$METRICS_DB" ]; then
  echo "No metrics database found."
  exit 0
fi

# --- 섹션 1: Decision Injection Metrics ---

sessions_total=$(sqlite3 "$METRICS_DB" \
  "SELECT COUNT(*) FROM events WHERE event='session_start';")
sessions_with_decisions=$(sqlite3 "$METRICS_DB" \
  "SELECT COUNT(*) FROM events WHERE event='session_start' AND json_extract(data,'\$.active_decisions') > 0;")

revoke_count=0
if [ -d "$MEMENTO_HOME/user/decisions" ]; then
  revoke_count=$(grep -rl 'revoked: true' "$MEMENTO_HOME/user/decisions/" 2>/dev/null | wc -l | tr -d ' ')
fi

tag_count=$(sqlite3 "$METRICS_DB" \
  "SELECT COUNT(*) FROM events WHERE event='tag_decision';")

proposed_total=$(sqlite3 "$METRICS_DB" \
  "SELECT COALESCE(SUM(json_extract(data,'\$.proposed')),0) FROM events WHERE event='decision_candidates';")
accepted_total=$(sqlite3 "$METRICS_DB" \
  "SELECT COALESCE(SUM(json_extract(data,'\$.accepted')),0) FROM events WHERE event='decision_candidates';")

# Exit Criteria 판정
status_a_sessions="❌"
[ "$sessions_with_decisions" -ge 3 ] 2>/dev/null && status_a_sessions="✅"
status_a_revoke="❌"
[ "$revoke_count" -ge 1 ] 2>/dev/null && status_a_revoke="✅"
status_b_tag="❌"
[ "$tag_count" -ge 5 ] 2>/dev/null && status_b_tag="✅"

acceptance_display="$accepted_total/$proposed_total"
status_b_accept="-"
if [ "$proposed_total" -gt 0 ] 2>/dev/null; then
  pct=$((accepted_total * 100 / proposed_total))
  acceptance_display="$accepted_total/$proposed_total (${pct}%)"
  if [ "$pct" -ge 80 ]; then
    status_b_accept="✅"
  else
    status_b_accept="❌"
  fi
fi

cat <<EOF
## Decision Injection Metrics

| Phase | Metric | Value | Target | Status |
|-------|--------|-------|--------|--------|
| A | 결정 주입 세션 | $sessions_with_decisions/$sessions_total | ≥3 | $status_a_sessions |
| A | 수동 revoke | $revoke_count | ≥1 | $status_a_revoke |
| B | tag-decision 횟수 | $tag_count | ≥5 | $status_b_tag |
| B | 후보 수락률 | $acceptance_display | ≥80% | $status_b_accept |
| B | 오탐 체감 | (주관) | ≥1건 | - |

EOF

# --- 섹션 2: Skill Usage (최근 30일) ---

skill_rows=$(sqlite3 -separator '|' "$METRICS_DB" \
  "SELECT json_extract(data,'\$.skill'), COUNT(*), substr(MAX(ts),1,10) FROM events WHERE event='skill_invocation' AND ts > datetime('now','-30 days') GROUP BY json_extract(data,'\$.skill') ORDER BY COUNT(*) DESC;")

cat <<'EOF'
## Skill Usage (30d)

| Skill | 호출 수 | 최근 사용 |
|-------|---------|----------|
EOF

if [ -n "$skill_rows" ]; then
  printf '%s\n' "$skill_rows" | while IFS='|' read -r skill count last_used; do
    printf '| %s | %s | %s |\n' "$skill" "$count" "$last_used"
  done
else
  echo "| (데이터 없음) | - | - |"
fi
