#!/bin/sh
set -eu
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
# Helpers
# ─────────────────────────────────────────────────────────────────

# nth <newline-string> <0-based-index>
nth() { printf '%s\n' "$1" | sed -n "$(($2 + 1))p"; }

# contains <newline-string> <needle> — returns 0 if found
contains() {
  case "$(printf '\n%s\n' "$1")" in
    *"$(printf '\n%s\n' "$2")"*) return 0 ;;
  esac
  return 1
}

# count_lines <newline-string>
count_lines() { printf '%s\n' "$1" | wc -l | tr -d ' '; }

# ─────────────────────────────────────────────────────────────────
# Color Mode
# ─────────────────────────────────────────────────────────────────
COLOR_MODE="plain"
while [ $# -gt 0 ]; do
  case "$1" in
    --ansi)  COLOR_MODE="ansi"; shift ;;
    --plain) COLOR_MODE="plain"; shift ;;
    --*)     shift ;;
    *)       break ;;
  esac
done

if [ "$COLOR_MODE" = "ansi" ]; then
  C_RESET=$(printf '\033[0m')
  C_DIM=$(printf '\033[2m')
  C_BLUE=$(printf '\033[34m')
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
  case "$full_path" in
    "$HOME"*) display_path="~${full_path#"$HOME"}"; is_home_path=true ;;
  esac

  # 2. Collect all git repo names (traverse up from current path)
  local git_repos="" check_path="$full_path"
  while [ "$check_path" != "/" ] && [ "$check_path" != "$HOME" ]; do
    if [ -d "$check_path/.git" ] || [ -f "$check_path/.git" ]; then
      local repo_name
      repo_name=$(basename "$check_path")
      if [ -z "$git_repos" ]; then
        git_repos="$repo_name"
      else
        git_repos="$git_repos
$repo_name"
      fi
    fi
    check_path=$(dirname "$check_path")
  done

  # 3. Split by / into newline-separated string
  local parts
  parts=$(printf '%s' "$display_path" | tr '/' '\n')
  local total
  total=$(count_lines "$parts")

  # 4. Short path: display as-is
  if [ "$total" -le 3 ]; then
    printf '%s%s%s\n' "$C_DIM" "$display_path" "$C_RESET"
    return
  fi

  # 5. Determine which indices to show (0-indexed)
  local show_indices=""
  if $is_home_path; then
    show_indices="0"
  else
    show_indices="0
1"
  fi
  # Last element (current folder)
  show_indices="$show_indices
$((total - 1))"

  # Indices matching git repo names
  local i=0
  while [ "$i" -lt "$total" ]; do
    local p
    p=$(nth "$parts" "$i")
    if [ -n "$git_repos" ] && [ -n "$p" ] && contains "$git_repos" "$p"; then
      show_indices="$show_indices
$i"
    fi
    i=$((i + 1))
  done

  # 6. Sort and deduplicate indices
  local sorted_indices
  sorted_indices=$(printf '%s\n' "$show_indices" | sort -nu)

  # 7. Assemble result
  local joined="" prev_shown=-1 first_seg=true
  local starts_with_slash=false
  local first_part
  first_part=$(nth "$parts" 0)
  if [ "$first_part" != "~" ] && [ -z "$first_part" ]; then
    starts_with_slash=true
  fi

  local idx_count
  idx_count=$(count_lines "$sorted_indices")
  local idx_i=0
  while [ "$idx_i" -lt "$idx_count" ]; do
    local idx
    idx=$(nth "$sorted_indices" "$idx_i")
    idx_i=$((idx_i + 1))
    [ -z "$idx" ] && continue
    local p
    p=$(nth "$parts" "$idx")

    # Skip empty string (first element of absolute paths)
    if [ -z "$p" ]; then
      prev_shown=$idx
      continue
    fi

    # Add separator
    if $first_seg; then
      first_seg=false
    else
      joined="${joined}${C_DIM}/${C_RESET}"
    fi

    # Add ↪N if there's a gap
    if [ $((idx - prev_shown)) -gt 1 ]; then
      local skipped=$((idx - prev_shown - 1))
      joined="${joined}${C_DIM}↪${skipped}${C_RESET}${C_DIM}/${C_RESET}"
    fi

    # Git repos and current folder: blue, rest: dim
    local is_repo=false
    if [ -n "$git_repos" ] && contains "$git_repos" "$p"; then
      is_repo=true
    fi

    if [ "$idx" -eq $((total - 1)) ] || $is_repo; then
      joined="${joined}${C_BLUE}${p}${C_RESET}"
    else
      joined="${joined}${C_DIM}${p}${C_RESET}"
    fi
    prev_shown=$idx
  done

  # Handle absolute paths (start with /)
  if $starts_with_slash; then
    printf '%s/%s%s\n' "$C_DIM" "$C_RESET" "$joined"
  else
    printf '%s\n' "$joined"
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
  local prefix="" ticket="" slug="" rest=""

  # Extract prefix
  case "$branch" in
    feature/*|hotfix/*|bugfix/*|release/*|change/*)
      prefix="${branch%%/*}/"
      rest="${branch#*/}"
      ;;
    *) rest="$branch" ;;
  esac

  # Extract ticket ID (e.g., PROJ-123-)
  ticket=$(expr "$rest" : '\([A-Z][A-Z]*-[0-9][0-9]*-\)' 2>/dev/null) || ticket=""
  if [ -n "$ticket" ]; then
    slug="${rest#"$ticket"}"
  else
    slug="$rest"
  fi

  # Split slug by - using positional parameters
  local old_ifs="${IFS}"
  IFS='-'
  # shellcheck disable=SC2086
  set -- $slug
  IFS="${old_ifs}"
  local word_count=$#

  if [ "$word_count" -eq "$max_words" ]; then
    local skipped=$((word_count - 2))
    eval "local last_w=\${$#}"
    slug="$1-↪${skipped}-${last_w}"
  elif [ "$word_count" -gt "$max_words" ]; then
    local skipped=$((word_count - 4))
    eval "local second_last=\${$(($# - 1))}"
    eval "local last_w=\${$#}"
    slug="$1-$2-↪${skipped}-${second_last}-${last_w}"
  fi

  printf '%s\n' "${prefix}${ticket}${slug}"
}

# ─────────────────────────────────────────────────────────────────
# Main: Dispatch subcommand
# ─────────────────────────────────────────────────────────────────
case "$1" in
  path)   shorten_path "$2" ;;
  branch) shorten_branch "$2" ;;
  *)      printf 'Usage: shorten.sh [--ansi|--plain] <path|branch> <value>\n' >&2; exit 1 ;;
esac
