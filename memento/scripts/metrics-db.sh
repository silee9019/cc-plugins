#!/bin/sh
# metrics-db.sh — SQLite 메트릭 저장소 초기화 + 이벤트 emit 헬퍼
# Usage: . metrics-db.sh MEMENTO_HOME
# Provides: metrics_init, metrics_emit

METRICS_DB="${1:?Usage: . metrics-db.sh MEMENTO_HOME}/metrics/metrics.db"

metrics_init() {
  [ -f "$METRICS_DB" ] && return 0
  mkdir -p "$(dirname "$METRICS_DB")"
  sqlite3 "$METRICS_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS events (
  ts TEXT NOT NULL,
  layer TEXT NOT NULL,
  event TEXT NOT NULL,
  project TEXT,
  data TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
SQL
}

metrics_emit() {
  # $1=layer  $2=event  $3=project (or "")  $4=data (JSON)
  _ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  _data=$(printf '%s' "$4" | sed "s/'/''/g")
  sqlite3 "$METRICS_DB" \
    "INSERT INTO events(ts,layer,event,project,data) VALUES('$_ts','$1','$2','$3','$_data');"
}
