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
echo "[1/6] 의존성 확인"
for cmd in sops age; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd 미설치. brew install $cmd 으로 설치하세요."
    exit 1
  fi
done
info "sops $(sops --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
info "age $(age --version 2>&1)"

# ── Step 2: 디렉토리 생성 ──
echo "[2/6] 디렉토리 생성"
if [[ -d "$AUTH_DIR" ]]; then
  skip "$AUTH_DIR 이미 존재"
else
  mkdir -p "$AUTH_DIR"
  chmod 700 "$AUTH_DIR"
  info "$AUTH_DIR 생성 (chmod 700)"
fi

# ── Step 3: age 공개키 감지 + .sops.yaml 생성 ──
echo "[3/6] .sops.yaml 생성"
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
echo "[4/6] foundry.sops.env 준비"
if [[ -f "$AUTH_DIR/foundry.sops.env" ]]; then
  skip "foundry.sops.env 이미 존재 (기존 값 보존)"
else
  cp "$PLUGIN_ROOT/templates/foundry.env.template" "$AUTH_DIR/foundry.sops.env"
  chmod 600 "$AUTH_DIR/foundry.sops.env"
  info "foundry.sops.env 생성 (편집 필요)"
fi

# ── Step 5: claude-mode.zsh 복사 (항상 업데이트) ──
echo "[5/6] claude-mode.zsh 설치"
cp "$PLUGIN_ROOT/scripts/claude-mode.zsh" "$AUTH_DIR/claude-mode.zsh"
info "claude-mode.zsh 설치 완료"

# ── Step 6: .zshrc 연동 ──
echo "[6/6] .zshrc 연동"
ZSHRC="$HOME/.zshrc"
SOURCE_LINE='[[ -f "$HOME/.claude-auth/claude-mode.zsh" ]] && source "$HOME/.claude-auth/claude-mode.zsh"'
if grep -qF 'claude-auth/claude-mode.zsh' "$ZSHRC" 2>/dev/null; then
  skip ".zshrc에 이미 등록됨"
else
  printf '\n# Claude Code auth mode switcher\n%s\n' "$SOURCE_LINE" >> "$ZSHRC"
  info ".zshrc에 source 추가"
fi

# ── 완료 ──
echo ""
echo "=== 셋업 완료 ==="
echo ""

if grep -q 'CHANGE_ME' "$AUTH_DIR/foundry.sops.env" 2>/dev/null; then
  echo "다음 단계:"
  echo "  1. 환경변수 값 입력:"
  echo "     \$EDITOR ~/.claude-auth/foundry.sops.env"
  echo ""
  echo "  2. sops 암호화:"
  echo "     cd ~/.claude-auth && sops --encrypt --in-place foundry.sops.env"
  echo ""
  echo "  3. 셸 재시작 후 모드 전환:"
  echo "     claude-mode foundry   # Foundry 모드"
  echo "     claude-mode sub       # Subscription 모드"
  echo "     claude-mode status    # 현재 상태 확인"
else
  echo "사용법:"
  echo "  claude-mode foundry   # Foundry 모드"
  echo "  claude-mode sub       # Subscription 모드"
  echo "  claude-mode status    # 현재 상태 확인"
fi
