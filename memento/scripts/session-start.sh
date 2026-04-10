#!/bin/sh
# memento session-start — SessionStart hook (POSIX compatible)
# 1. Resolve project ID (git remote + CWD fallback, always lowercase)
# 2. Create project directory structure + templates (idempotent)
# 3. Output memory protocol to stdout for agent injection

set -eu

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEMENTO_HOME="$HOME/.claude/memento"

# ─── Helper: lowercase ───

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

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
    VAULT_ROOT=""
    _dir=$(pwd)
    while [ "$_dir" != "/" ]; do
      if [ -d "$_dir/.obsidian" ]; then
        VAULT_ROOT="$_dir"
        break
      fi
      _dir=$(dirname "$_dir")
    done
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
- Search: use memento:memento-search skill
- If this session ends NOW, the next session must be able to continue immediately
PROTOCOL

# ─── Check qmd ───

if ! command -v qmd >/dev/null 2>&1; then
  echo "[memento] qmd not found. Install: npm install -g qmd" >&2
fi
