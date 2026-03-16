#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Claude Code Statusline
# Format: hh:mm {path} {git badge} | model context [progress bar] | costs
# ═══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────
SHORTEN="$HOME/.config/scripts/shorten.sh"

# ─────────────────────────────────────────────────────────────────
# ANSI Colors (using $'...' syntax for escape sequences)
# ─────────────────────────────────────────────────────────────────
C_RESET=$'\033[0m'
C_DIM=$'\033[2m'
C_MAGENTA=$'\033[35m'
SEP="${C_DIM}|${C_RESET}"

# ─────────────────────────────────────────────────────────────────
# Input Parsing
# ─────────────────────────────────────────────────────────────────
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir')
model=$(echo "$input" | jq -r '.model.display_name')

# ─────────────────────────────────────────────────────────────────
# Git Functions
# ─────────────────────────────────────────────────────────────────

# Get git repo root path
get_git_root() {
  git -C "$1" --no-optional-locks rev-parse --show-toplevel 2>/dev/null
}

# Get git branch badge: " on 【branch】"
get_git_badge() {
  local branch
  branch=$(git -C "$cwd" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
  [[ -z "$branch" ]] && return

  local short_branch=$("$SHORTEN" branch "$branch")
  echo "${C_DIM} on ${C_MAGENTA}【${short_branch}】${C_RESET}"
}

# ─────────────────────────────────────────────────────────────────
# Status Functions
# ─────────────────────────────────────────────────────────────────

# Get context window usage with progress bar
get_context_bar() {
  local usage
  usage=$(echo "$input" | jq '.context_window.current_usage')

  if [[ "$usage" != "null" ]]; then
    local current=$(echo "$usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
    local size=$(echo "$input" | jq '.context_window.context_window_size')
    local pct=$((current * 100 / size))

    local threshold_pct=${CLAUDE_AUTOCOMPACT_THRESHOLD:-77}
    local filled=$((pct / 10))
    local marker_pos=$((threshold_pct / 10))
    local bar=""

    for ((i=0; i<10; i++)); do
      if ((threshold_pct > 0 && i == marker_pos)); then
        bar+="▒"
      elif ((i < filled)); then
        bar+="█"
      else
        bar+="░"
      fi
    done

    printf '%s %3d%% context' "$bar" "$pct"
  else
    printf '░░░░░░░░░░   0%% context'
  fi
}

# Get short model name
get_model_short() {
  echo "$model" | sed -E 's/Claude ([0-9.]+) (Opus|Sonnet|Haiku)/\2 \1/; s/Claude (Opus|Sonnet|Haiku) ([0-9.]+)/\1 \2/'
}

# Get Claude Code version
get_version() {
  echo "$input" | jq -r '.version // ""'
}

# Get usage costs from ccusage
get_usage_costs() {
  local MONTH=$(date +%Y-%m)
  local WEEK_START=$(date -v-sun +%Y-%m-%d 2>/dev/null || date -d 'last sunday' +%Y-%m-%d 2>/dev/null)

  local json=$(bunx ccusage --json 2>/dev/null)
  [[ -z "$json" ]] && return

  local today_data=$(echo "$json" | jq '.daily[-1]')

  local opus_cost=$(echo "$today_data" | jq -r '[.modelBreakdowns[]? | select(.modelName | contains("opus")) | .cost] | add // 0' | xargs printf "%.0f")
  local haiku_cost=$(echo "$today_data" | jq -r '[.modelBreakdowns[]? | select(.modelName | contains("haiku")) | .cost] | add // 0' | xargs printf "%.0f")
  local sonnet_cost=$(echo "$today_data" | jq -r '[.modelBreakdowns[]? | select(.modelName | contains("sonnet")) | .cost] | add // 0' | xargs printf "%.0f")

  local weekly_cost=$(echo "$json" | jq -r --arg week "$WEEK_START" '[.daily[] | select(.date >= $week) | .totalCost] | add // 0' | xargs printf "%.0f")
  local monthly_cost=$(echo "$json" | jq -r --arg month "$MONTH" '[.daily[] | select(.date | startswith($month)) | .totalCost] | add // 0' | xargs printf "%.0f")

  local models=""
  [[ "$opus_cost" != "0" ]] && models+="Opus \$$opus_cost "
  [[ "$haiku_cost" != "0" ]] && models+="Haiku \$$haiku_cost "
  [[ "$sonnet_cost" != "0" ]] && models+="Sonnet \$$sonnet_cost "

  if [[ -n "$models" ]]; then
    printf '%s| Weekly $%s | Monthly $%s' "$models" "$weekly_cost" "$monthly_cost"
  else
    printf 'Weekly $%s | Monthly $%s' "$weekly_cost" "$monthly_cost"
  fi
}

# ─────────────────────────────────────────────────────────────────
# Main: Build and output statusline
# ─────────────────────────────────────────────────────────────────

# Each component includes its own colors
time_part="${C_DIM}$(date +%H:%M)${C_RESET}"
path_part=$("$SHORTEN" --ansi path "$cwd")
git_part=$(get_git_badge)
version_part="${C_DIM}v$(get_version)${C_RESET}"
model_part="${C_DIM}$(get_model_short)${C_RESET}"
context_part="${C_DIM}$(get_context_bar)${C_RESET}"
cost_part="${C_DIM}$(get_usage_costs)${C_RESET}"

# Assemble and output (using %b to interpret escape sequences)
printf '%b' "${time_part} ${path_part}${git_part} ${SEP} ${version_part} ${SEP} ${model_part} ${context_part} ${SEP} ${cost_part}"
