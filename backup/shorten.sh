#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Shared shortening utility for paths and branch names
# Usage: shorten.sh [--ansi|--plain] <path|branch> <value>
#
# Subcommands:
#   path   <dir-path>     Shorten a directory path
#   branch <branch-name>  Shorten a git branch name
#
# Options:
#   --ansi   ANSI escape color codes (for statusline)
#   --plain  No color codes (default, for zsh prompt)
# ═══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────
# Color Mode
# ─────────────────────────────────────────────────────────────────
COLOR_MODE="plain"
while [[ "$1" == --* ]]; do
  case "$1" in
    --ansi)  COLOR_MODE="ansi"; shift ;;
    --plain) COLOR_MODE="plain"; shift ;;
    *)       shift ;;
  esac
done

if [[ "$COLOR_MODE" == "ansi" ]]; then
  C_RESET=$'\033[0m'
  C_DIM=$'\033[2m'
  C_BLUE=$'\033[34m'
else
  C_RESET="" C_DIM="" C_BLUE=""
fi

# ─────────────────────────────────────────────────────────────────
# shorten_path: Shorten a directory path
# ─────────────────────────────────────────────────────────────────
# Rules:
#   1. Home directory → ~
#   2. Absolute path (outside home) → top 2 folders
#   3. All git repo names (including nested submodules)
#   4. Current folder
#   5. Gaps → ↪N (N = skipped count)
# Colors (ansi mode):
#   - Git repo names / current folder: blue
#   - Rest: dim
shorten_path() {
  local full_path="$1"
  local is_home_path=false
  local display_path="$full_path"

  # 1. Replace home directory with ~
  if [[ "$full_path" == "$HOME"* ]]; then
    display_path="~${full_path#$HOME}"
    is_home_path=true
  fi

  # 2. Collect all git repo names (traverse up from current path)
  local git_repo_names=()
  local check_path="$full_path"
  while [[ "$check_path" != "/" && "$check_path" != "$HOME" ]]; do
    if [[ -d "$check_path/.git" || -f "$check_path/.git" ]]; then
      git_repo_names+=("$(basename "$check_path")")
    fi
    check_path="$(dirname "$check_path")"
  done

  # 3. Split by /
  IFS='/' read -ra parts <<< "$display_path"
  local total=${#parts[@]}

  # 4. Short path: display as-is
  if (( total <= 3 )); then
    echo "${C_DIM}${display_path}${C_RESET}"
    return
  fi

  # 5. Determine which indices to show (0-indexed)
  local show_indices=()

  # First element (~) or top 2 for absolute paths
  if $is_home_path; then
    show_indices+=(0)  # ~
  else
    show_indices+=(0 1)  # top 2 (empty string, first folder)
  fi

  # Last element (current folder)
  show_indices+=($((total - 1)))

  # Indices matching git repo names
  for i in "${!parts[@]}"; do
    local p="${parts[$i]}"
    for repo in "${git_repo_names[@]}"; do
      if [[ "$p" == "$repo" ]]; then
        show_indices+=($i)
        break
      fi
    done
  done

  # 6. Assemble result
  local result=()
  local prev_shown=-1

  # Sort and deduplicate indices
  IFS=$'\n' sorted_indices=($(printf '%s\n' "${show_indices[@]}" | sort -nu))

  for idx in "${sorted_indices[@]}"; do
    local p="${parts[$idx]}"

    # Skip empty string (first element of absolute paths)
    [[ -z "$p" ]] && { prev_shown=$idx; continue; }

    # Add ↪N if there's a gap (N = skipped count)
    if (( idx - prev_shown > 1 )); then
      local skipped=$((idx - prev_shown - 1))
      result+=("${C_DIM}↪${skipped}${C_RESET}")
    fi

    local is_git_repo=false
    for repo in "${git_repo_names[@]}"; do
      if [[ "$p" == "$repo" ]]; then
        is_git_repo=true
        break
      fi
    done

    # Git repos and current folder: blue, rest: dim
    if [[ "$idx" == "$((total - 1))" ]] || $is_git_repo; then
      result+=("${C_BLUE}${p}${C_RESET}")
    else
      result+=("${C_DIM}${p}${C_RESET}")
    fi
    prev_shown=$idx
  done

  # 7. Output result
  local joined=""
  for i in "${!result[@]}"; do
    if (( i > 0 )); then
      joined+="${C_DIM}/${C_RESET}"
    fi
    joined+="${result[$i]}"
  done

  # Handle absolute paths (start with /)
  if [[ "${parts[0]}" != "~" && -z "${parts[0]}" ]]; then
    echo "${C_DIM}/${C_RESET}${joined}"
  else
    echo "$joined"
  fi
}

# ─────────────────────────────────────────────────────────────────
# shorten_branch: Shorten a git branch slug
# ─────────────────────────────────────────────────────────────────
# Pattern: {prefix/}{TICKET-ID-}{slug}
# Slug shortening (max_words=4):
#   == max_words → first 1 + ↪(skipped) + last 1
#   >  max_words → first 2 + ↪(skipped) + last 2
shorten_branch() {
  local branch="$1"
  local max_words=4

  local prefix="" ticket="" slug=""

  if [[ "$branch" =~ ^(feature|hotfix|bugfix|release|change)/ ]]; then
    prefix="${BASH_REMATCH[0]}"
    local rest="${branch#$prefix}"

    if [[ "$rest" =~ ^([A-Z]+-[0-9]+-)(.+)$ ]]; then
      ticket="${BASH_REMATCH[1]}"
      slug="${BASH_REMATCH[2]}"
    else
      slug="$rest"
    fi
  else
    slug="$branch"
  fi

  IFS='-' read -ra words <<< "$slug"
  local word_count=${#words[@]}

  if (( word_count == max_words )); then
    local skipped=$((word_count - 2))
    slug="${words[0]}-↪${skipped}-${words[$((word_count-1))]}"
  elif (( word_count > max_words )); then
    local skipped=$((word_count - 4))
    local first_part="${words[0]}-${words[1]}"
    local last_part="${words[$((word_count-2))]}-${words[$((word_count-1))]}"
    slug="${first_part}-↪${skipped}-${last_part}"
  fi

  echo "${prefix}${ticket}${slug}"
}

# ─────────────────────────────────────────────────────────────────
# Main: Dispatch subcommand
# ─────────────────────────────────────────────────────────────────
case "$1" in
  path)   shorten_path "$2" ;;
  branch) shorten_branch "$2" ;;
  *)      echo "Usage: shorten.sh [--ansi|--plain] <path|branch> <value>" >&2; exit 1 ;;
esac
