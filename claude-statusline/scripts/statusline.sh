#!/bin/sh
set -eu

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# --- ANSI ---
DIM=$(printf '\033[2m')
GREEN=$(printf '\033[32m')
YELLOW=$(printf '\033[33m')
RED=$(printf '\033[31m')
MAGENTA=$(printf '\033[35m')
BLUE75=$(printf '\033[38;5;75m')
BLUE27=$(printf '\033[38;5;27m')
RST=$(printf '\033[0m')
SEP="${DIM} | ${RST}"

# --- 축약 스크립트 ---
SHORTEN_CMD="$PLUGIN_ROOT/scripts/shorten.sh"

# --- stdin JSON (한번에 파싱) ---
input=$(cat)
eval "$(printf '%s' "$input" | jq -r '
  @sh "cwd=\(.workspace.current_dir // "")",
  @sh "model_display=\(.model.display_name // "")",
  @sh "version=\(.version // "")",
  @sh "window_size=\(.context_window.context_window_size // 200000)",
  @sh "input_tokens=\(.context_window.current_usage.input_tokens // 0)",
  @sh "cache_create=\(.context_window.current_usage.cache_creation_input_tokens // 0)",
  @sh "cache_read=\(.context_window.current_usage.cache_read_input_tokens // 0)"
')"
term_width="${COLUMNS:-120}"

# --- 유틸리티 ---

plain_len() {
  printf '%s' "$1" | sed 's/\x1b\[[0-9;]*m//g' | wc -m | tr -d ' '
}

shorten_path() {
  if [ -x "$SHORTEN_CMD" ]; then
    "$SHORTEN_CMD" --ansi path "$1"
  else
    printf '%s not executable, using fallback\n' "$SHORTEN_CMD" >&2
    printf '%s%s%s' "$DIM" "$1" "$RST"
  fi
}

shorten_branch() {
  if [ -x "$SHORTEN_CMD" ]; then
    "$SHORTEN_CMD" --ansi branch "$1"
  else
    printf '%s not executable, using fallback\n' "$SHORTEN_CMD" >&2
    printf '%s' "$1"
  fi
}

format_model() {
  local d="$1" name="" ver=""
  ver=$(printf '%s' "$d" | sed -n 's/.*\([0-9][0-9]*\.[0-9][0-9]*\)[[:space:]]*\(Opus\|Sonnet\|Haiku\).*/\1/p')
  if [ -n "$ver" ]; then
    name=$(printf '%s' "$d" | sed -n 's/.*[0-9][0-9]*\.[0-9][0-9]*[[:space:]]*\(Opus\|Sonnet\|Haiku\).*/\1/p')
  else
    name=$(printf '%s' "$d" | sed -n 's/.*\(Opus\|Sonnet\|Haiku\)[[:space:]]*\([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
    ver=$(printf '%s' "$d" | sed -n 's/.*\(Opus\|Sonnet\|Haiku\)[[:space:]]*\([0-9][0-9]*\.[0-9][0-9]*\).*/\2/p')
  fi
  if [ -n "$name" ] && [ -n "$ver" ]; then
    printf '%s %s' "$name" "$ver"
  else
    printf '%s' "$d" | sed 's/Claude //; s/ *(.*//'
  fi
}

format_context_bar() {
  local current=$((input_tokens + cache_create + cache_read))
  local pct=$((current * 100 / window_size))
  local threshold="${CLAUDE_AUTOCOMPACT_THRESHOLD:-77}"
  local filled=$((pct / 10))
  local marker=$((threshold / 10))
  local bar="" i=0
  while [ "$i" -lt 10 ]; do
    if [ "$i" -lt "$filled" ]; then bar="${bar}█"
    elif [ "$threshold" -gt 0 ] && [ "$i" -eq "$marker" ]; then bar="${bar}▒"
    else bar="${bar}░"
    fi
    i=$((i + 1))
  done
  printf '%s %3d%%' "$bar" "$pct"
}

# --- 비용 데이터 ---
cost_cache="$PLUGIN_ROOT/data/cost-cache.json"
daily_models="\$--" weekly_cost="W\$--" monthly_cost="M\$--"
if [ -f "$cost_cache" ]; then
  cost_available=$(jq -r '.available // false' "$cost_cache" 2>/dev/null || echo false)
  if [ "$cost_available" = "true" ]; then
    eval "$(jq -r '
      @sh "opus=\(.dailyModels.opus // 0)",
      @sh "sonnet=\(.dailyModels.sonnet // 0)",
      @sh "haiku=\(.dailyModels.haiku // 0)",
      @sh "w_cost=\(.weeklyCost // 0 | round)",
      @sh "m_cost=\(.monthlyCost // 0 | round)"
    ' "$cost_cache" 2>/dev/null || echo 'opus=0 sonnet=0 haiku=0 w_cost=0 m_cost=0')"
    weekly_cost="W\$${w_cost}"
    monthly_cost="M\$${m_cost}"
    parts=""
    [ "$(printf '%s >= 1\n' "$opus" | bc 2>/dev/null || echo 0)" = "1" ] && parts="Opus \$$(printf '%.0f' "$opus")"
    [ "$(printf '%s >= 1\n' "$sonnet" | bc 2>/dev/null || echo 0)" = "1" ] && { [ -n "$parts" ] && parts="$parts "; parts="${parts}Sonnet \$$(printf '%.0f' "$sonnet")"; }
    [ "$(printf '%s >= 1\n' "$haiku" | bc 2>/dev/null || echo 0)" = "1" ] && { [ -n "$parts" ] && parts="$parts "; parts="${parts}Haiku \$$(printf '%.0f' "$haiku")"; }
    daily_models="${parts:-\$0}"
  fi
fi

# --- GitHub 계정 표시기 ---

format_gh() {
  local cache="${XDG_DATA_HOME:-$HOME/.local/share}/gh-prompt-user"
  [ -f "$cache" ] || return
  local user
  user=$(cat "$cache")
  case "$user" in
    silee9019)      printf '%sgh@me%s' "$BLUE75" "$RST" ;;
    silee_imagogit) printf '%sgh@imago%s' "$BLUE27" "$RST" ;;
    "")             printf '%sgh@---%s' "$DIM" "$RST" ;;
    *)              printf '%sgh@%s%s' "$BLUE75" "$user" "$RST" ;;
  esac
}

# --- AWS 세션 표시기 ---

format_aws() {
  command -v saml2aws >/dev/null 2>&1 || return
  local exp="${AWS_SESSION_EXPIRATION:-}"
  if [ -z "$exp" ]; then
    exp=$(sed -n 's/^x_security_token_expires *= *//p' \
      "${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}" 2>/dev/null | head -1)
  fi
  [ -z "$exp" ] && { printf '%saws:?%s' "$DIM" "$RST"; return; }

  local now exp_epoch remaining
  now=$(date +%s)
  local exp_norm
  exp_norm=$(printf '%s' "$exp" | sed 's/\([+-][0-9][0-9]\):\([0-9][0-9]\)$/\1\2/')
  exp_epoch=$(date -jf "%Y-%m-%dT%H:%M:%S%z" "$exp_norm" +%s 2>/dev/null || \
              date -d "$exp" +%s 2>/dev/null || echo 0)
  remaining=$(( (exp_epoch - now) / 60 ))

  if [ "$remaining" -gt 10 ]; then
    printf '%saws:✓%s' "$GREEN" "$RST"
  elif [ "$remaining" -gt 0 ]; then
    printf '%saws:⏳%sm%s' "$YELLOW" "$remaining" "$RST"
  else
    printf '%saws:✗%s' "$RED" "$RST"
  fi
}

# --- git branch ---
branch=""
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  [ "$branch" = "HEAD" ] && branch=""
fi

# --- 세그먼트 조립 ---
# Line 1: hh:mm path (branch) gh@user aws:status
# Line 2: ╰─» vX.Y.Z Model Bar costs

time_seg="${GREEN}$(date +%H:%M)${RST}"
path_seg=$(shorten_path "$cwd")
branch_part=""
[ -n "$branch" ] && branch_part=" ${MAGENTA}($(shorten_branch "$branch"))${RST}"

seg_gh=$(format_gh)
seg_aws=$(format_aws)

line1="${time_seg} ${path_seg}${branch_part}"
[ -n "$seg_gh" ] && line1="${line1} ${seg_gh}"
[ -n "$seg_aws" ] && line1="${line1} ${seg_aws}"

model_str=$(format_model "$model_display")
context_bar=$(format_context_bar)

seg_arrow="${GREEN}╰─»${RST}"
seg_version="${DIM}v${version}${RST}"
seg_model="${DIM}${model_str} ${context_bar}${RST}"
seg_daily="${DIM}${daily_models}${RST}"
seg_weekly="${DIM}${weekly_cost}${RST}"
seg_monthly="${DIM}${monthly_cost}${RST}"

# 반응형: 폭 초과 시 우선순위 낮은 것부터 제거
# 제거 순서: monthly(10) → weekly(20) → daily(40) → version(50)
# model+context(70) + arrow는 항상 유지

fits() { [ "$(plain_len "$1")" -le "$term_width" ]; }

line2="${seg_arrow} ${seg_version}${SEP}${seg_model}${SEP}${seg_daily}${SEP}${seg_weekly}${SEP}${seg_monthly}"
if ! fits "$line2"; then line2="${seg_arrow} ${seg_version}${SEP}${seg_model}${SEP}${seg_daily}${SEP}${seg_weekly}"; fi
if ! fits "$line2"; then line2="${seg_arrow} ${seg_version}${SEP}${seg_model}${SEP}${seg_daily}"; fi
if ! fits "$line2"; then line2="${seg_arrow} ${seg_version}${SEP}${seg_model}"; fi
if ! fits "$line2"; then line2="${seg_arrow} ${seg_model}"; fi

printf '%s\n%s' "$line1" "$line2"
