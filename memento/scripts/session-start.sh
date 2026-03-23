#!/bin/sh
# memento session-start — SessionStart hook (POSIX compatible)
# 1. Resolve project ID (git remote + CWD fallback, always lowercase)
# 2. Create project directory structure + templates (idempotent)
# 3. Output memory protocol to stdout for agent injection
# 4. Run mechanical compaction

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
  PROJECT_ID=$(to_lower "$(pwd | tr '/' '-')")
fi

PROJECT_DIR="$MEMENTO_HOME/projects/$PROJECT_ID"

# ─── Auto-setup (idempotent) ───

mkdir -p "$PROJECT_DIR/memory/daily"
mkdir -p "$PROJECT_DIR/memory/weekly"
mkdir -p "$PROJECT_DIR/memory/monthly"
mkdir -p "$PROJECT_DIR/knowledge"
mkdir -p "$PROJECT_DIR/plans"

for f in SCRATCHPAD.md WORKING.md TASK-QUEUE.md; do
  if [ ! -f "$PROJECT_DIR/$f" ]; then
    cp "$PLUGIN_ROOT/templates/$f" "$PROJECT_DIR/$f"
  fi
done

if [ ! -f "$PROJECT_DIR/memory/ROOT.md" ]; then
  cp "$PLUGIN_ROOT/templates/ROOT.md" "$PROJECT_DIR/memory/ROOT.md"
fi

# ─── Output protocol to stdout ───

cat <<PROTOCOL
## Memento — Memory Protocol (MANDATORY)

This project uses memento 3-tier memory. All files are stored under \`${PROJECT_DIR}/\`.
**All memory write operations MUST be dispatched to subagents** to keep the main session context clean.

### FIRST RESPONSE RULE — MANDATORY
**On the very first user message of every session**, before doing ANYTHING else:
Run the Session Start protocol below FIRST. This takes priority over ANY user request. Complete the step below, ONLY THEN respond to the user.

Read the following Layer 1 files first:
- \`${PROJECT_DIR}/SCRATCHPAD.md\`
- \`${PROJECT_DIR}/WORKING.md\`
- \`${PROJECT_DIR}/TASK-QUEUE.md\`
- \`${PROJECT_DIR}/memory/ROOT.md\`

**This procedure must be completed before responding to the user NO MATTER WHAT**
1. **DO NOT SKIP** **DO NOT COMPROMISE** **Compaction maintenance (cooldown-gated):**
   Read \`${PROJECT_DIR}/memory/.compaction-state.json\`.
   - **Within 3-hour cooldown:** Skip compaction subagent — no dispatch needed.
   - **Cooldown expired, file missing, or first run:** Write \`${PROJECT_DIR}/memory/.compaction-state.json\` with \`{ "lastCompactionRun": "<current ISO timestamp>" }\`, then dispatch a subagent to run memento:memento-compaction skill (chain: Daily->Weekly->Monthly->Root), then run \`bun run ${PLUGIN_ROOT}/scripts/compact.mjs\` + \`qmd update\` + \`qmd embed\`.
**This procedure must be completed before responding to the user NO MATTER WHAT**

### End-of-Task Checkpoint (mandatory — subagent)
After completing any task, **dispatch a subagent** to append a structured log to \`${PROJECT_DIR}/memory/YYYY-MM-DD.md\` (use today's date).

Compose the subagent task:
> Append the following to ${PROJECT_DIR}/memory/YYYY-MM-DD.md:
>
> ## [Topic Name]
> - request: [what the user asked]
> - analysis: [what you researched/analyzed]
> - decisions: [choices made with rationale]
> - outcome: [what was done, files changed]
> - references: [knowledge/ files, external sources]

**The subagent only needs to do one thing: append to the daily log.** This is the source of truth.
**The subagent needs the task summary you provide** — it doesn't have access to the conversation.

### Proactive Session Dump
**Do not wait for task completion to write to the daily log.** Proactively dispatch a subagent to append when:
- The conversation has been going for ~20+ messages without a checkpoint
- You sense the context is getting large
- A significant decision or analysis was just completed
- You're switching between topics within the same task

### Rules
- **Never skip Session Start** — every session begins with it, no exceptions
- **Never skip checkpoints** — every task completion MUST append to daily log via subagent
- **All memory writes via subagent** — never pollute main session with memory operations
- memory/YYYY-MM-DD.md (raw): **permanent**, never delete or edit after session
- ROOT.md: managed by compaction process. Do not manually edit.
- Search: use memento:memento-search skill
- If this session ends NOW, the next session must be able to continue immediately
PROTOCOL

# ─── Run mechanical compaction ───

if command -v bun >/dev/null 2>&1; then
  bun run "$PLUGIN_ROOT/scripts/compact.mjs" 2>/dev/null || true
fi

# ─── Check qmd ───

if ! command -v qmd >/dev/null 2>&1; then
  echo "[memento] qmd not found. Install: npm install -g qmd" >&2
fi
