#!/bin/sh
set -eu

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# --- ANSI ---
DIM=$(printf '\033[2m')
BLUE=$(printf '\033[34m')
MAGENTA=$(printf '\033[35m')
RST=$(printf '\033[0m')
SEP="${DIM} | ${RST}"
SEP_WIDTH=3

# --- stdin JSON (한번에 파싱) ---
input=$(cat)
eval "$(printf '%s' "$input" | jq -r '
  @sh "session_id=\(.session_id // "")",
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
  local p="$1" home="${HOME:-}"
  case "$p" in "$home"*) p="~${p#"$home"}" ;; esac
  local count
  count=$(printf '%s\n' "$p" | tr '/' '\n' | grep -c . || true)
  if [ "$count" -le 3 ]; then
    printf '%s%s%s' "$DIM" "$p" "$RST"
    return
  fi
  local first second_last last_part
  case "$p" in
    "~"*) first="~" ;;
    *)    first="/$(printf '%s' "$p" | cut -d'/' -f2)" ;;
  esac
  second_last=$(basename "$(dirname "$p")")
  last_part=$(basename "$p")
  printf '%s%s%s/%s…%s/%s%s%s/%s%s%s' \
    "$DIM" "$first" "$RST" "$DIM" "$RST" \
    "$BLUE" "$second_last" "$RST" \
    "$BLUE" "$last_part" "$RST"
}

shorten_branch() {
  local b="$1" prefix=""
  case "$b" in
    feature/*|hotfix/*|bugfix/*|release/*|change/*)
      prefix="${b%%/*}/"
      b="${b#*/}"
      ;;
  esac
  local wc
  wc=$(printf '%s\n' "$b" | tr '-' '\n' | grep -c . || true)
  if [ "$wc" -gt 4 ]; then
    local first second last2 last1 skipped
    first=$(printf '%s' "$b" | cut -d'-' -f1)
    second=$(printf '%s' "$b" | cut -d'-' -f2)
    last1=$(printf '%s' "$b" | rev | cut -d'-' -f1 | rev)
    last2=$(printf '%s' "$b" | rev | cut -d'-' -f2 | rev)
    skipped=$((wc - 4))
    b="${first}-${second}-↪${skipped}-${last2}-${last1}"
  fi
  printf '%s%s' "$prefix" "$b"
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

# --- 세션 데이터 ---
prompt_count=0
if [ -n "$session_id" ] && [ -f "$PLUGIN_ROOT/data/sessions/$session_id/prompt-count" ]; then
  prompt_count=$(cat "$PLUGIN_ROOT/data/sessions/$session_id/prompt-count" 2>/dev/null || echo 0)
fi

# --- git branch ---
branch=""
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  [ "$branch" = "HEAD" ] && branch=""
fi

# --- 세그먼트 조립 ---
# Line 1: #턴수 hh:mm | 경로 브랜치
# Line 2: CLI버전 | 모델+컨텍스트 | 비용

seg_turns="${DIM}#${prompt_count}${RST}"
time_seg="${DIM}$(date +%H:%M)${RST}"
path_seg=$(shorten_path "$cwd")
branch_part=""
[ -n "$branch" ] && branch_part=" ${MAGENTA}【$(shorten_branch "$branch")】${RST}"

line1="${seg_turns}${SEP}${time_seg}${SEP}${path_seg}${branch_part}"

model_str=$(format_model "$model_display")
context_bar=$(format_context_bar)

seg_version="${DIM}v${version}${RST}"
seg_model="${DIM}${model_str} ${context_bar}${RST}"
seg_daily="${DIM}${daily_models}${RST}"
seg_weekly="${DIM}${weekly_cost}${RST}"
seg_monthly="${DIM}${monthly_cost}${RST}"

# 반응형: 폭 초과 시 우선순위 낮은 것부터 제거
# 제거 순서: monthly(10) → weekly(20) → daily(40) → version(50)
# model+context(70)는 항상 유지

fits() { [ "$(plain_len "$1")" -le "$term_width" ]; }

line2="${seg_version}${SEP}${seg_model}${SEP}${seg_daily}${SEP}${seg_weekly}${SEP}${seg_monthly}"
if ! fits "$line2"; then line2="${seg_version}${SEP}${seg_model}${SEP}${seg_daily}${SEP}${seg_weekly}"; fi
if ! fits "$line2"; then line2="${seg_version}${SEP}${seg_model}${SEP}${seg_daily}"; fi
if ! fits "$line2"; then line2="${seg_version}${SEP}${seg_model}"; fi
if ! fits "$line2"; then line2="${seg_model}"; fi

printf '%s\n%s' "$line1" "$line2"
