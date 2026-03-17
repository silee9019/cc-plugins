#!/usr/bin/env bash
set -euo pipefail

# claude-auth setup — idempotent 셋업 스크립트
# 사용: bash <plugin-root>/scripts/setup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTH_DIR="$HOME/.claude-auth"

info()  { echo "  ✓ $*"; }
skip()  { echo "  - $* (skip)"; }
error() { echo "  ✗ $*" >&2; }

echo "=== claude-auth setup ==="
echo ""

# ── Step 1: 의존성 확인 ──
echo "[1/8] 의존성 확인"
for cmd in sops age; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd 미설치. brew install $cmd 으로 설치하세요."
    exit 1
  fi
done
info "sops $(sops --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
info "age $(age --version 2>&1)"

# ── Step 2: 디렉토리 생성 ──
echo "[2/8] 디렉토리 생성"
if [[ -d "$AUTH_DIR" ]]; then
  skip "$AUTH_DIR 이미 존재"
else
  mkdir -p "$AUTH_DIR"
  chmod 700 "$AUTH_DIR"
  info "$AUTH_DIR 생성 (chmod 700)"
fi

# ── Step 3: age 공개키 감지 + .sops.yaml 생성 ──
echo "[3/8] .sops.yaml 생성"
AGE_KEYS="$HOME/.config/sops/age/keys.txt"
if [[ ! -f "$AGE_KEYS" ]]; then
  error "age 키 없음: $AGE_KEYS"
  echo "    age-keygen -o $AGE_KEYS 으로 생성하세요."
  exit 1
fi
AGE_PUB=$(grep '^# public key:' "$AGE_KEYS" | head -1 | awk '{print $NF}')
if [[ -z "$AGE_PUB" ]]; then
  error "age 공개키를 파싱할 수 없습니다: $AGE_KEYS"
  exit 1
fi

if [[ -f "$AUTH_DIR/.sops.yaml" ]]; then
  skip ".sops.yaml 이미 존재"
else
  sed "s|__AGE_PUBLIC_KEY__|$AGE_PUB|g" "$PLUGIN_ROOT/templates/.sops.yaml" > "$AUTH_DIR/.sops.yaml"
  info ".sops.yaml 생성 (age: ${AGE_PUB:0:20}...)"
fi

# ── Step 4: foundry.sops.env 템플릿 복사 ──
echo "[4/8] foundry.sops.env 준비"
if [[ -f "$AUTH_DIR/foundry.sops.env" ]]; then
  skip "foundry.sops.env 이미 존재 (기존 값 보존)"
else
  cp "$PLUGIN_ROOT/templates/foundry.env.template" "$AUTH_DIR/foundry.sops.env"
  chmod 600 "$AUTH_DIR/foundry.sops.env"
  info "foundry.sops.env 생성 (편집 필요)"
fi

# ── Step 5: claude-auth-mode.zsh 복사 (항상 업데이트) ──
echo "[5/8] claude-auth-mode.zsh 설치"
cp "$PLUGIN_ROOT/scripts/claude-auth-mode.zsh" "$AUTH_DIR/claude-auth-mode.zsh"
info "claude-auth-mode.zsh 설치 완료"

# ── Step 6: .zshrc 연동 ──
echo "[6/8] .zshrc 연동"
# 심볼릭 링크 resolve (sed -i는 symlink에서 실패)
ZSHRC="$(readlink -f "$HOME/.zshrc" 2>/dev/null || echo "$HOME/.zshrc")"
SOURCE_LINE='[[ -f "$HOME/.claude-auth/claude-auth-mode.zsh" ]] && source "$HOME/.claude-auth/claude-auth-mode.zsh"'
if grep -qF 'claude-auth/claude-auth-mode.zsh' "$ZSHRC" 2>/dev/null; then
  skip ".zshrc에 이미 등록됨"
elif grep -qF 'claude-auth/claude-mode.zsh' "$ZSHRC" 2>/dev/null; then
  sed -i '' 's|claude-auth/claude-mode\.zsh|claude-auth/claude-auth-mode.zsh|g' "$ZSHRC"
  info ".zshrc 구 참조 → claude-auth-mode.zsh로 갱신"
else
  printf '\n# Claude Code auth mode switcher\n%s\n' "$SOURCE_LINE" >> "$ZSHRC"
  info ".zshrc에 source 추가"
fi

# ── Step 7: sops-env oh-my-zsh plugin 설치 ──
echo "[7/8] sops-env plugin 설치"
SOPS_ENV_DIR="$HOME/.oh-my-zsh/custom/plugins/sops-env"
if [[ -f "$SOPS_ENV_DIR/sops-env.plugin.zsh" ]]; then
  skip "sops-env plugin 이미 존재"
else
  mkdir -p "$SOPS_ENV_DIR"
  cat > "$SOPS_ENV_DIR/sops-env.plugin.zsh" << 'PLUGIN'
sops-env() {
  command sops --input-type dotenv --output-type dotenv "$@"
}
PLUGIN
  info "sops-env plugin 설치 완료"
fi

# ── Step 8: sops-env를 EXTRA_PLUGINS에 등록 ──
echo "[8/8] sops-env plugin 등록"
if grep -qE 'EXTRA_PLUGINS=.*sops-env' "$ZSHRC" 2>/dev/null; then
  skip "EXTRA_PLUGINS에 sops-env 이미 등록됨"
else
  if grep -qE '^EXTRA_PLUGINS=\(' "$ZSHRC" 2>/dev/null; then
    sed -i '' 's/\(EXTRA_PLUGINS=(\)/\1sops-env /' "$ZSHRC"
    info "EXTRA_PLUGINS에 sops-env 추가"
  else
    skip "EXTRA_PLUGINS 배열을 찾을 수 없음 — 수동으로 plugins에 sops-env를 추가하세요"
  fi
fi

# ── 완료 ──
echo ""
echo "=== 셋업 완료 ==="
echo ""

if grep -q 'CHANGE_ME' "$AUTH_DIR/foundry.sops.env" 2>/dev/null; then
  echo "다음 단계:"
  echo "  1. 환경변수 값 입력:"
  echo "     sops-env ~/.claude-auth/foundry.sops.env"
  echo ""
  echo "  2. 셸 재시작 후 모드 전환:"
  echo "     camf    # claude-auth-mode foundry"
  echo "     cams    # claude-auth-mode sub"
  echo "     camst   # claude-auth-mode status"
else
  echo "사용법:"
  echo "  camf    # claude-auth-mode foundry"
  echo "  cams    # claude-auth-mode sub"
  echo "  camst   # claude-auth-mode status"
fi
