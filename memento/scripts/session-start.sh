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

if [ ! -f "$USER_DIR/ROOT.md" ]; then
  cp "$PLUGIN_ROOT/templates/USER-ROOT.md" "$USER_DIR/ROOT.md"
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

# ─── Output protocol to stdout ───

cat <<PROTOCOL
## Memento — Memory Protocol (MANDATORY)

This project uses memento 2-scope 3-layer memory. All files are stored under \`${PROJECT_DIR}/\`.
**All memory write operations MUST be dispatched to subagents** to keep the main session context clean.

### FIRST RESPONSE RULE — MANDATORY
**On the very first user message of every session**, before doing ANYTHING else:
Run the Session Start protocol below FIRST. This takes priority over ANY user request. Complete the step below, ONLY THEN respond to the user.

Read the following Layer 1 files first:
- \`${PROJECT_DIR}/WORKING.md\`
- \`${PROJECT_DIR}/memory/ROOT.md\`
- \`${USER_DIR}/ROOT.md\` (cross-project knowledge index)

**This procedure must be completed before responding to the user NO MATTER WHAT**

### End-of-Task Checkpoint (mandatory)
After completing any task, append a structured log to \`${PROJECT_DIR}/memory/YYYY-MM-DD.md\` (use today's date) using the Write tool (append) or Edit tool.

Log format:
> ## [Topic Name]
> - request: [what the user asked]
> - analysis: [what you researched/analyzed]
> - decisions: [choices made with rationale]
> - outcome: [what was done, files changed]
> - references: [knowledge/ files, external sources]

**This is a single Write call — minimal context impact.** This is the source of truth.

### Knowledge Promotion (in checkpoint)
If the outcome contains a **project-independent** lesson (debugging technique, tool recipe, environment pattern), also write to \`${USER_DIR}/knowledge/<slug>.md\`:
\`\`\`
---
title: <제목>
source-project: <project-id>
created: YYYY-MM-DD
tags: [tag1, tag2]
---
<교훈 내용 — 간결, 실행 가능, 키워드 밀도 높게>
\`\`\`
Only promote genuinely reusable knowledge. When in doubt, don't promote. Prefer updating existing files over creating duplicates.

### Proactive Session Dump
**Do not wait for task completion to write to the daily log.** Proactively append when:
- The conversation has been going for ~20+ messages without a checkpoint
- You sense the context is getting large
- A significant decision or analysis was just completed
- You're switching between topics within the same task

### Rules
- **Never skip Session Start** — every session begins with it, no exceptions
- **Never skip checkpoints** — every task completion MUST append to daily log
- **Checkpoint writes are direct** — one Write call is minimal context impact. Use subagents only for heavy operations (compaction, search).
- memory/YYYY-MM-DD.md (raw): **permanent**, never delete or edit after session
- ROOT.md: managed by compaction process. Do not manually edit.
- Search: use memento:search-memory skill
- If this session ends NOW, the next session must be able to continue immediately

PROTOCOL

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
