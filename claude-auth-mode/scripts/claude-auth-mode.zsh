# claude-auth-mode: Claude Code 인증 모드 전환 (subscription ↔ Azure AI Foundry)
# 설치: source ~/.claude-auth/claude-auth-mode.zsh (setup.sh가 자동 연동)

claude-auth-mode() {
  local auth_dir="$HOME/.claude-auth"
  local mode="${1:-status}"

  case "$mode" in
    foundry|f)
      local decrypted
      decrypted="$(sops --decrypt --output-type dotenv "$auth_dir/foundry.sops.env" 2>&1)"
      if [[ $? -ne 0 ]]; then
        echo "error: sops 복호화 실패 — foundry.sops.env가 암호화되었는지 확인하세요" >&2
        echo "  $decrypted" >&2
        return 1
      fi
      eval "$(echo "$decrypted" | sed 's/^/export /')"
      export CLAUDE_CODE_USE_FOUNDRY=1
      echo "foundry" > "$auth_dir/active"
      echo "→ Foundry 모드 (claude 재시작 시 적용)"
      ;;
    sub|subscription|s)
      unset CLAUDE_CODE_USE_FOUNDRY ANTHROPIC_FOUNDRY_API_KEY \
            ANTHROPIC_FOUNDRY_RESOURCE ANTHROPIC_MODEL
      echo "subscription" > "$auth_dir/active"
      echo "→ Subscription 모드 (claude 재시작 시 적용)"
      ;;
    status|"")
      local active
      active=$(cat "$auth_dir/active" 2>/dev/null || echo "subscription")
      echo "모드: $active"
      if [[ -n "$CLAUDE_CODE_USE_FOUNDRY" ]]; then
        echo "  셸: foundry (ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-unset})"
      else
        echo "  셸: subscription"
      fi
      ;;
    toggle|t)
      local active
      active=$(cat "$auth_dir/active" 2>/dev/null || echo "subscription")
      if [[ "$active" == "foundry" ]]; then
        claude-auth-mode sub
      else
        claude-auth-mode foundry
      fi
      ;;
    *)
      echo "Usage: claude-auth-mode [toggle|foundry|sub|status]" >&2
      return 1
      ;;
  esac
}

alias camt='claude-auth-mode toggle'
alias cams='claude-auth-mode status'

# 셸 시작 시 저장된 모드 자동 로드
_claude_auth_mode_init() {
  local active
  active=$(cat "$HOME/.claude-auth/active" 2>/dev/null)
  [[ "$active" == "foundry" ]] && claude-auth-mode foundry >/dev/null 2>&1
}
_claude_auth_mode_init
