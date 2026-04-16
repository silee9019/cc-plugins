#!/bin/sh
# memento session-start — SessionStart hook (POSIX compatible)
# 1. Resolve MEMENTO_HOME from config.md (fallback to legacy ~/.claude/memento/)
# 2. Resolve project ID (git remote + CWD fallback, always lowercase)
# 3. Create project directory structure + templates (idempotent)
# 4. Output memory protocol to stdout for agent injection

set -eu

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ─── Helper: lowercase ───

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# ─── Resolve MEMENTO_HOME from config.md ───

CONFIG_FILE="$HOME/.claude/plugins/data/memento-cc-plugins/config.md"
VAULT_PATH=""
if [ -f "$CONFIG_FILE" ]; then
  VAULT_PATH=$(sed -n 's/^vault_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
  MEMENTO_ROOT=$(sed -n 's/^memento_root: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
  if [ -n "$VAULT_PATH" ] && [ -n "$MEMENTO_ROOT" ] && [ -d "$VAULT_PATH" ]; then
    MEMENTO_HOME="$VAULT_PATH/$MEMENTO_ROOT"
  else
    MEMENTO_HOME="$HOME/.claude/memento"
    VAULT_PATH=""
    echo "[memento] config invalid, falling back to legacy path $MEMENTO_HOME" >&2
  fi
else
  MEMENTO_HOME="$HOME/.claude/memento"
  echo "[memento] DEPRECATED: legacy path ~/.claude/memento/ will be removed in 1.8.0." >&2
  echo "[memento] Run /memento:setup to migrate data into your Obsidian vault." >&2
fi

# ─── Resolve project cwd from hook stdin JSON ───

STDIN_DATA="$(cat)"
PROJECT_CWD="$(printf '%s' "$STDIN_DATA" | grep -o '"cwd":"[^"]*"' | head -1 | cut -d'"' -f4)"
if [ -n "$PROJECT_CWD" ] && [ -d "$PROJECT_CWD" ]; then
  cd "$PROJECT_CWD"
fi

# ─── Project ID resolution ───

PROJECT_ID=""

if REMOTE_URL=$(git remote get-url origin 2>/dev/null); then
  CLEANED=$(printf '%s' "$REMOTE_URL" | sed 's/\.git$//')
  REPO=$(printf '%s' "$CLEANED" | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/')
  PROJECT_ID=$(to_lower "$(printf '%s' "$REPO" | tr '/' '-')")
fi

if [ -z "$PROJECT_ID" ]; then
  GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$GIT_ROOT" ]; then
    PROJECT_ID=$(to_lower "$(printf '%s' "$GIT_ROOT" | tr '/' '-')")
  else
    # VAULT_PATH가 설정된 상태에서 cwd가 vault 하위면 .obsidian 폴백을 건너뛴다
    # (자기참조 경로 방지: <vault>/_memento/projects/<vault-name>/ 같은 경로가 생기는 것을 막는다)
    SKIP_OBSIDIAN_FALLBACK=0
    if [ -n "$VAULT_PATH" ]; then
      case "$(pwd)" in
        "$VAULT_PATH"|"$VAULT_PATH"/*) SKIP_OBSIDIAN_FALLBACK=1 ;;
      esac
    fi

    VAULT_ROOT=""
    if [ "$SKIP_OBSIDIAN_FALLBACK" = "0" ]; then
      _dir=$(pwd)
      while [ "$_dir" != "/" ]; do
        if [ -d "$_dir/.obsidian" ]; then
          VAULT_ROOT="$_dir"
          break
        fi
        _dir=$(dirname "$_dir")
      done
    fi

    if [ -n "$VAULT_ROOT" ]; then
      PROJECT_ID=$(to_lower "$(printf '%s' "$VAULT_ROOT" | tr '/' '-')")
    else
      PROJECT_ID=$(to_lower "$(pwd | tr '/' '-')")
    fi
  fi
fi

PROJECT_DIR="$MEMENTO_HOME/projects/$PROJECT_ID"

# ─── Auto-setup (idempotent) ───

mkdir -p "$PROJECT_DIR/memory/daily"
mkdir -p "$PROJECT_DIR/memory/weekly"
mkdir -p "$PROJECT_DIR/memory/monthly"
mkdir -p "$PROJECT_DIR/knowledge"
mkdir -p "$PROJECT_DIR/plans"

if [ ! -f "$PROJECT_DIR/WORKING.md" ]; then
  cp "$PLUGIN_ROOT/templates/WORKING.md" "$PROJECT_DIR/WORKING.md"
fi

if [ ! -f "$PROJECT_DIR/memory/ROOT.md" ]; then
  cp "$PLUGIN_ROOT/templates/ROOT.md" "$PROJECT_DIR/memory/ROOT.md"
fi

# ─── User Scope auto-setup (idempotent) ───
USER_DIR="$MEMENTO_HOME/user"
mkdir -p "$USER_DIR/knowledge"
mkdir -p "$USER_DIR/decisions"

if [ ! -f "$USER_DIR/ROOT.md" ]; then
  cp "$PLUGIN_ROOT/templates/USER-ROOT.md" "$USER_DIR/ROOT.md"
fi

# ─── Active Decisions injection (Format B) ───
# Scan user/decisions/*.md for active decisions (not expired, not revoked, project scope match)
# Output: numbered list, max 10, sorted by created DESC then filename ASC

DECISIONS_DIR="$USER_DIR/decisions"
DECISION_BLOCK=""
if [ -d "$DECISIONS_DIR" ]; then
  TODAY=$(date "+%Y-%m-%d")
  # Collect eligible decision files into a temp file: "created\tfilename\ttitle\tsummary_or_first_line\texpires"
  DECISION_TMP="${TMPDIR:-/tmp}/memento-decisions-$$"
  : > "$DECISION_TMP"

  for f in "$DECISIONS_DIR"/*.md; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")

    # Parse frontmatter fields (between first --- and second ---)
    _fm=$(sed -n '/^---$/,/^---$/p' "$f" | sed '1d;$d')

    # Skip revoked
    _revoked=$(printf '%s\n' "$_fm" | sed -n 's/^revoked: *//p' | head -1)
    case "$_revoked" in true|True|TRUE) continue ;; esac

    # Skip expired
    _expired_flag=$(printf '%s\n' "$_fm" | sed -n 's/^expired: *//p' | head -1)
    case "$_expired_flag" in true|True|TRUE) continue ;; esac

    # Check expires date
    _expires=$(printf '%s\n' "$_fm" | sed -n 's/^expires: *//p' | head -1)
    if [ -n "$_expires" ] && [ "$_expires" \< "$TODAY" ]; then
      continue
    fi

    # Check project scope
    _projects=$(printf '%s\n' "$_fm" | sed -n 's/^projects: *\[//p' | sed 's/\].*$//')
    _match=0
    case "$_projects" in
      *'"*"'*|*"'*'"*) _match=1 ;;
      *)
        # Check if PROJECT_ID is in the list
        if printf '%s' "$_projects" | grep -q "\"$PROJECT_ID\""; then
          _match=1
        fi
        ;;
    esac
    [ "$_match" = "1" ] || continue

    # Extract created, summary, title (H1)
    _created=$(printf '%s\n' "$_fm" | sed -n 's/^created: *//p' | head -1)
    _summary=$(printf '%s\n' "$_fm" | sed -n 's/^summary: *//p' | head -1)
    _title=$(sed -n '/^---$/,/^---$/d; s/^# *//p' "$f" | head -1)
    # First non-empty body line as fallback
    if [ -z "$_summary" ]; then
      _summary=$(sed -n '/^---$/,/^---$/d; /^$/d; /^#/d; p' "$f" | head -1)
    fi

    printf '%s\t%s\t%s\t%s\t%s\n' "${_created:-0000-00-00}" "$fname" "$_title" "$_summary" "$_expires" >> "$DECISION_TMP"
  done

  # Sort: created DESC (reverse), then filename ASC (stable sort trick: reverse created for sort -r)
  DECISION_COUNT=0
  DECISION_LINES=""
  if [ -s "$DECISION_TMP" ]; then
    # sort by created desc (field 1 reverse), then filename asc (field 2)
    SORTED=$(sort -t"$(printf '\t')" -k1,1r -k2,2 "$DECISION_TMP" | head -10)
    DECISION_COUNT=$(printf '%s\n' "$SORTED" | wc -l | tr -d ' ')
    _n=0
    IFS='
'
    for line in $SORTED; do
      _n=$((_n + 1))
      _title=$(printf '%s' "$line" | cut -f3)
      _summary=$(printf '%s' "$line" | cut -f4)
      _expires=$(printf '%s' "$line" | cut -f5)
      _exp_label=""
      if [ -n "$_expires" ]; then
        _exp_label=" (exp $_expires)"
      fi
      _display="${_summary}"
      if [ -z "$_display" ]; then
        _display="(no summary)"
      fi
      DECISION_LINES="${DECISION_LINES}${_n}. **${_title}** — ${_display}${_exp_label}
"
    done
    unset IFS
  fi
  rm -f "$DECISION_TMP"

  if [ "$DECISION_COUNT" -gt 0 ]; then
    DECISION_BLOCK="## Active Decisions (${DECISION_COUNT} active · \`/memento:refresh-decisions\` to reload)

${DECISION_LINES}
> 전문: \`cat ${DECISIONS_DIR}/<file>\` 또는 \`/memento:search-memory <keyword>\`"
  fi
fi

# ─── Mentor layer: active-reminders + daily note hint ───
# 통합된 memento(기억) + me+mento(멘토) 레이어. 파일이 있고 미만료일 때만 주입.

ACTIVE_REMINDERS_FILE="$USER_DIR/active-reminders.md"
REMINDER_BLOCK=""
if [ -f "$ACTIVE_REMINDERS_FILE" ]; then
  EXPIRES_AT=$(sed -n 's/^expires_at: *"\{0,1\}\([0-9-]*\)"\{0,1\}$/\1/p' "$ACTIVE_REMINDERS_FILE" | head -1)
  TODAY=$(date "+%Y-%m-%d")
  if [ -z "$EXPIRES_AT" ] || [ "$EXPIRES_AT" \> "$TODAY" ] || [ "$EXPIRES_AT" = "$TODAY" ]; then
    REMINDER_BLOCK=$(cat "$ACTIVE_REMINDERS_FILE")
  else
    echo "[memento] active-reminders expired ($EXPIRES_AT) — run /memento:review-week" >&2
  fi
fi

# 오늘 Daily Note 존재 힌트 (config의 daily_notes_path가 있을 때만)
DAILY_HINT=""
if [ -n "$VAULT_PATH" ]; then
  DAILY_NOTES_PATH=$(sed -n 's/^daily_notes_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
  DAILY_NOTE_FORMAT=$(sed -n 's/^daily_note_format: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
  if [ -n "$DAILY_NOTES_PATH" ] && [ -n "$DAILY_NOTE_FORMAT" ]; then
    TODAY_Y=$(date "+%Y")
    TODAY_M=$(date "+%m")
    TODAY_D=$(date "+%d")
    TODAY_PATH=$(printf '%s' "$DAILY_NOTE_FORMAT" | sed -e "s/{YYYY}/$TODAY_Y/g" -e "s/{MM}/$TODAY_M/g" -e "s/{DD}/$TODAY_D/g")
    FULL_DAILY="$VAULT_PATH/$DAILY_NOTES_PATH/$TODAY_PATH"
    if [ -f "$FULL_DAILY" ]; then
      DAILY_HINT="오늘 Daily Note 존재: $FULL_DAILY"
    else
      DAILY_HINT="오늘 Daily Note 없음 — /memento:planning 권장"
    fi
  fi
fi

# ─── KST + workday + calendar context (cooldown 무관, 세션당 1회) ───
KST_BLOCK=""
if command -v python3 >/dev/null 2>&1; then
  KST_BLOCK="$(python3 "$PLUGIN_ROOT/scripts/workday_context.py" --plugin-root "$PLUGIN_ROOT" 2>/dev/null || true)"
fi
if [ -z "${KST_BLOCK:-}" ]; then
  KST_BLOCK="Current time (KST): $(TZ=Asia/Seoul LC_TIME=ko_KR.UTF-8 date '+%Y-%m-%d %H:%M %Z (%A)')"
fi

CALENDAR_BLOCK=""
if command -v python3 >/dev/null 2>&1; then
  CALENDAR_BLOCK="$(python3 "$PLUGIN_ROOT/scripts/calendar_context.py" --plugin-root "$PLUGIN_ROOT" 2>/dev/null || true)"
fi

# ─── Output protocol to stdout ───

cat <<PROTOCOL
${KST_BLOCK}
${CALENDAR_BLOCK}
## Memento (MANDATORY — read before responding)

Project: \`${PROJECT_DIR}\`

**Layer 1 — read these now, before responding**:
- \`${PROJECT_DIR}/WORKING.md\`
- \`${PROJECT_DIR}/memory/ROOT.md\`
- \`${USER_DIR}/ROOT.md\` (cross-project knowledge index)

Follow the \`memento-core\` skill for checkpoint format, knowledge promotion, proactive dump, and compaction rules. After every task, append a checkpoint to \`${PROJECT_DIR}/memory/YYYY-MM-DD.md\` (single Write call). Never skip Session Start or checkpoints.

PROTOCOL

if [ -n "$DECISION_BLOCK" ]; then
  cat <<DECISIONS

${DECISION_BLOCK}

DECISIONS
fi

if [ -n "$REMINDER_BLOCK" ]; then
  cat <<REMINDERS

## Active Reminders (주간 회고)

${REMINDER_BLOCK}

REMINDERS
fi

if [ -n "$DAILY_HINT" ]; then
  cat <<HINT

## Mentor Hint
${DAILY_HINT}
HINT
fi



# ─── Check qmd ───

if ! command -v qmd >/dev/null 2>&1; then
  echo "[memento] qmd not found. Install: npm install -g qmd" >&2
fi
