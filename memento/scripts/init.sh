#!/bin/sh
# memento init — SessionStart hook (POSIX compatible)
# 1. Determine project ID (git remote + CWD fallback, always lowercase)
# 2. Create project directory structure
# 3. Copy templates if missing
# 4. Output @import directives to stdout (injected into session context)
# 5. Check qmd availability

set -eu

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEMENTO_HOME="$HOME/.claude/memento"

# ─── Helper: lowercase ───

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# ─── Step 1: Project ID ───

PROJECT_ID=""

# Try git remote first
if REMOTE_URL=$(git remote get-url origin 2>/dev/null); then
  # Extract org/repo from URL:
  #   https://github.com/org/repo.git → org/repo
  #   git@github.com:org/repo.git    → org/repo
  # Remove trailing .git
  CLEANED=$(printf '%s' "$REMOTE_URL" | sed 's/\.git$//')
  # Extract last two path components
  REPO=$(printf '%s' "$CLEANED" | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/')
  # Replace / with -
  PROJECT_ID=$(to_lower "$(printf '%s' "$REPO" | tr '/' '-')")
fi

# Fallback: CWD path with / → -
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(to_lower "$(pwd | tr '/' '-')")
fi

PROJECT_DIR="$MEMENTO_HOME/projects/$PROJECT_ID"

# ─── Step 2: Directory structure ───

mkdir -p "$PROJECT_DIR/memory/daily"
mkdir -p "$PROJECT_DIR/memory/weekly"
mkdir -p "$PROJECT_DIR/memory/monthly"
mkdir -p "$PROJECT_DIR/knowledge"
mkdir -p "$PROJECT_DIR/plans"

# ─── Step 3: Copy templates (only if missing) ───

for f in SCRATCHPAD.md WORKING.md TASK-QUEUE.md; do
  if [ ! -f "$PROJECT_DIR/$f" ]; then
    cp "$PLUGIN_ROOT/templates/$f" "$PROJECT_DIR/$f"
  fi
done

if [ ! -f "$PROJECT_DIR/memory/ROOT.md" ]; then
  cp "$PLUGIN_ROOT/templates/ROOT.md" "$PROJECT_DIR/memory/ROOT.md"
fi

# ─── Step 4: Output @import directives (session context injection) ───

echo "@${PROJECT_DIR}/SCRATCHPAD.md"
echo "@${PROJECT_DIR}/WORKING.md"
echo "@${PROJECT_DIR}/TASK-QUEUE.md"
echo "@${PROJECT_DIR}/memory/ROOT.md"

# ─── Step 5: Check qmd ───

if ! command -v qmd >/dev/null 2>&1; then
  echo "[memento] qmd not found. Install: npm install -g qmd" >&2
fi
