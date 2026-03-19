# run.sh.md

Phase 5 (Visual Audit) 오케스트레이터 스크립트 템플릿.

- **생성 경로**: `.github/workflows/weekly-visual-audit/run.sh`
- **목적**: pages.json의 URL 목록을 순회하며 Playwright 스크린샷을 캡처하고, Agent CLI Vision 분석으로 시각적 문제를 탐지하여 GitHub Issue를 생성한다.
- **치환 변수**: `{{owner}}`, `{{repo}}`, `{{agent_cmd}}`, `{{agent_model_flag}}`
- **의존성**: jq, npx (Playwright), gh CLI, `{{agent_cmd}}`

---

````sh
#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OWNER="{{owner}}"
REPO="{{repo}}"
SCREENSHOTS_DIR="$SCRIPT_DIR/screenshots"
AUDIT_DATE=$(date -u '+%Y-%m-%d')
RESULT_DIR=".agentic-workflow/visual-audit"

# ── 1. pages.json 존재 확인 ──────────────────────────────────
PAGES_FILE="$SCRIPT_DIR/pages.json"
if [ ! -f "$PAGES_FILE" ]; then
  echo "pages.json 파일이 없습니다."
  echo "  경로: $PAGES_FILE"
  echo "  검증 대상 페이지를 pages.json에 등록하세요."
  exit 0
fi

PAGE_COUNT=$(jq 'length' "$PAGES_FILE")
if [ "$PAGE_COUNT" -eq 0 ]; then
  echo "pages.json에 등록된 페이지가 없습니다. 종료."
  exit 0
fi
echo "==> 검증 대상: ${PAGE_COUNT}개 페이지"

# ── 2. 스크린샷 캡처 ─────────────────────────────────────────
mkdir -p "$SCREENSHOTS_DIR"
CAPTURED=0
idx=0
while [ "$idx" -lt "$PAGE_COUNT" ]; do
  NAME=$(jq -r ".[$idx].name" "$PAGES_FILE")
  URL=$(jq -r ".[$idx].url" "$PAGES_FILE")
  VIEWPORT=$(jq -r ".[$idx].viewport // \"1280x720\"" "$PAGES_FILE")

  WIDTH=$(printf '%s' "$VIEWPORT" | cut -d'x' -f1)
  HEIGHT=$(printf '%s' "$VIEWPORT" | cut -d'x' -f2)
  FILENAME="${NAME}.png"

  echo "==> [$(( idx + 1 ))/${PAGE_COUNT}] 캡처 중: ${NAME} (${URL})"
  if npx playwright screenshot \
    --viewport-size="${WIDTH},${HEIGHT}" \
    --wait-for-timeout=3000 \
    "$URL" "$SCREENSHOTS_DIR/$FILENAME" 2>/dev/null; then
    CAPTURED=$(( CAPTURED + 1 ))
  else
    echo "    경고: ${NAME} 캡처 실패 (${URL})"
  fi

  idx=$(( idx + 1 ))
done

if [ "$CAPTURED" -eq 0 ]; then
  echo "캡처된 스크린샷이 없습니다. 종료."
  exit 0
fi
echo "==> 캡처 완료: ${CAPTURED}/${PAGE_COUNT}개"

# ── 3. Agent Vision 분석 ─────────────────────────────────────
echo "==> Vision 분석 시작..."

# 스크린샷 파일 목록을 인자로 구성
IMG_ARGS=""
for img in "$SCREENSHOTS_DIR"/*.png; do
  [ -f "$img" ] || continue
  IMG_ARGS="$IMG_ARGS --file $img"
done

AUDIT_RESULT=$($AGENT_CMD $AGENT_MODEL_FLAG \
  --print \
  --prompt-file "$SCRIPT_DIR/audit-prompt.md" \
  $IMG_ARGS \
  2>&1) || true

# ── 4. 결과 저장 ─────────────────────────────────────────────
mkdir -p "$RESULT_DIR"
RESULT_FILE="$RESULT_DIR/audit-${AUDIT_DATE}.json"

# Agent 출력에서 JSON 블록 추출
printf '%s' "$AUDIT_RESULT" | sed -n '/^```json/,/^```/p' | sed '1d;$d' > "$RESULT_FILE" 2>/dev/null || true

# JSON 추출 실패 시 raw 결과 저장
if [ ! -s "$RESULT_FILE" ]; then
  printf '%s' "$AUDIT_RESULT" > "$RESULT_FILE"
fi

echo "==> 결과 저장: ${RESULT_FILE}"

# ── 5. 문제 발견 시 Issue 생성 ───────────────────────────────
HAS_ISSUES="false"
if [ -s "$RESULT_FILE" ]; then
  # JSON에서 severity가 high 또는 critical인 문제가 있는지 확인
  ISSUE_COUNT=$(jq '[.pages[]?.issues[]? | select(.severity == "high" or .severity == "critical")] | length' "$RESULT_FILE" 2>/dev/null) || ISSUE_COUNT=0

  if [ "$ISSUE_COUNT" -gt 0 ]; then
    HAS_ISSUES="true"
  fi
fi

if [ "$HAS_ISSUES" = "true" ]; then
  echo "==> 시각적 문제 ${ISSUE_COUNT}건 발견. Issue 생성 중..."

  ISSUE_BODY=$(printf '## Visual Audit Report (%s)\n\n%s건의 high/critical 시각적 문제가 발견되었습니다.\n\n### 상세 결과\n\n```json\n%s\n```\n\n---\n*자동 생성: weekly-visual-audit workflow*' \
    "$AUDIT_DATE" "$ISSUE_COUNT" "$(cat "$RESULT_FILE")")

  gh issue create --repo "$OWNER/$REPO" \
    --title "Visual Audit: ${ISSUE_COUNT}건의 시각적 문제 발견 (${AUDIT_DATE})" \
    --body "$ISSUE_BODY" \
    --label "visual-audit"
else
  echo "==> 심각한 시각적 문제 없음."
fi

echo "==> 완료: Visual Audit ${AUDIT_DATE}"
````
