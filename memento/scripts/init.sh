#!/usr/bin/env bash
# memento init — SessionStart hook
# 1. Determine project ID (git remote + CWD fallback, always lowercase)
# 2. Create project directory structure
# 3. Copy templates if missing
# 4. Output @import directives to stdout (injected into session context)
# 5. Check qmd availability

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEMENTO_HOME="$HOME/.claude/memento"

# ─── Step 1: Project ID ───

PROJECT_ID=""

# Try git remote first
if REMOTE_URL=$(git remote get-url origin 2>/dev/null); then
  # Extract org/repo from various URL formats:
  #   https://github.com/org/repo.git → org-repo
  #   git@github.com:org/repo.git    → org-repo
  PROJECT_ID=$(echo "$REMOTE_URL" \
    | sed -E 's#.*[:/]([^/]+)/([^/]+?)(\.git)?$#\1-\2#' \
    | tr '[:upper:]' '[:lower:]')
fi

# Fallback: CWD path with / → -
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(pwd | tr '/' '-' | tr '[:upper:]' '[:lower:]')
fi

PROJECT_DIR="$MEMENTO_HOME/projects/$PROJECT_ID"

# ─── Step 2: Directory structure ───

mkdir -p "$PROJECT_DIR"/{memory/{daily,weekly,monthly},knowledge,plans}

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

if ! command -v qmd &>/dev/null; then
  echo "[memento] qmd not found. Install: npm install -g qmd" >&2
fi
