# run.sh.md

Phase 3 (Issue Pipeline) 5단계 오케스트레이터 스크립트 템플릿.

- **생성 경로**: `.github/workflows/issue-pipeline/run.sh`
- **목적**: 큐에서 이슈를 꺼내 계획 → 승인 확인 → 구현 → 검증 → PR 생성까지 전 과정을 순차 실행한다.
- **치환 변수**: `{{owner}}`, `{{repo}}`, `{{default_branch}}`, `{{agent_cmd}}`, `{{agent_model_flag}}`
- **의존성**: gh CLI, git, `{{agent_cmd}}`

---

````sh
#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OWNER="{{owner}}"
REPO="{{repo}}"
DEFAULT_BRANCH="{{default_branch}}"

# ── 1. 큐에서 이슈 획득 ──────────────────────────────────────
ISSUE_NUM=$("$SCRIPT_DIR/queue.sh")
if [ -z "$ISSUE_NUM" ]; then
  echo "처리할 이슈 없음. 종료."
  exit 0
fi
echo "==> 처리 대상 이슈: #${ISSUE_NUM}"

ISSUE_TITLE=$(gh issue view "$ISSUE_NUM" --repo "$OWNER/$REPO" --json title --jq '.title')
SLUG=$(printf '%s' "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | head -c 40)
BRANCH="feature/auto/${ISSUE_NUM}-${SLUG}"

# ── 2. 계획 세션 ─────────────────────────────────────────────
echo "==> [2/5] 계획 수립 중..."
ISSUE_BODY=$(gh issue view "$ISSUE_NUM" --repo "$OWNER/$REPO" --json body --jq '.body')
ISSUE_COMMENTS=$(gh issue view "$ISSUE_NUM" --repo "$OWNER/$REPO" --json comments --jq '[.comments[].body] | join("\n---\n")')

PLAN_INPUT=$(printf '# Issue #%s: %s\n\n## 본문\n%s\n\n## 코멘트\n%s' \
  "$ISSUE_NUM" "$ISSUE_TITLE" "$ISSUE_BODY" "$ISSUE_COMMENTS")

printf '%s' "$PLAN_INPUT" | $AGENT_CMD $AGENT_MODEL_FLAG \
  --print \
  --prompt-file "$SCRIPT_DIR/plan-prompt.md" \
  > plan.md

gh issue comment "$ISSUE_NUM" --repo "$OWNER/$REPO" \
  --body "$(printf '## 자동 구현 계획\n\n%s\n\n---\n승인하려면 `@%s approve`를 코멘트하세요.' "$(cat plan.md)" "$BOT_ACCOUNT")"

gh issue edit "$ISSUE_NUM" --repo "$OWNER/$REPO" \
  --remove-label "auto-implement" --add-label "auto-plan-ready"

# ── 3. 승인 확인 ─────────────────────────────────────────────
echo "==> [3/5] 승인 확인 중..."
APPROVED=$(gh issue view "$ISSUE_NUM" --repo "$OWNER/$REPO" --json comments \
  --jq "[.comments[].body | select(contains(\"@${BOT_ACCOUNT} approve\"))] | length")

if [ "$APPROVED" -eq 0 ]; then
  echo "승인 대기 중. 다음 cron에서 재시도."
  exit 0
fi

# ── 4. 구현 세션 ─────────────────────────────────────────────
echo "==> [4/5] 구현 중..."
git checkout -b "$BRANCH" "origin/$DEFAULT_BRANCH"

$AGENT_CMD $AGENT_MODEL_FLAG \
  --print \
  --prompt-file "$SCRIPT_DIR/implement-prompt.md" \
  --input-file plan.md

git add -A
git commit -m "feat: auto-implement #${ISSUE_NUM} — ${ISSUE_TITLE}"
git push -u origin "$BRANCH"

gh issue edit "$ISSUE_NUM" --repo "$OWNER/$REPO" \
  --remove-label "auto-plan-ready" --add-label "auto-in-progress"

# ── 5. 검증 세션 ─────────────────────────────────────────────
echo "==> [5/5] 검증 중..."
VERIFY_RESULT=$($AGENT_CMD $AGENT_MODEL_FLAG \
  --print \
  --prompt-file "$SCRIPT_DIR/verify-prompt.md" \
  2>&1) || true

VERIFY_EXIT=$(printf '%s' "$VERIFY_RESULT" | tail -1)

if [ "$VERIFY_EXIT" = "PASS" ]; then
  echo "검증 성공. PR 생성 중..."
  gh pr create --repo "$OWNER/$REPO" \
    --base "$DEFAULT_BRANCH" --head "$BRANCH" \
    --title "feat: auto-implement #${ISSUE_NUM} — ${ISSUE_TITLE}" \
    --body "$(printf 'Closes #%s\n\n## 계획\n%s\n\n## 검증 결과\n%s' \
      "$ISSUE_NUM" "$(cat plan.md)" "$VERIFY_RESULT")"

  gh issue edit "$ISSUE_NUM" --repo "$OWNER/$REPO" \
    --remove-label "auto-in-progress"
else
  echo "검증 실패. 롤백 중..."
  gh issue comment "$ISSUE_NUM" --repo "$OWNER/$REPO" \
    --body "$(printf '## 자동 구현 실패\n\n검증에 실패했습니다.\n\n```\n%s\n```\n\n라벨을 다시 `auto-implement`로 변경하면 재시도합니다.' "$VERIFY_RESULT")"

  git checkout "$DEFAULT_BRANCH"
  git push origin --delete "$BRANCH" 2>/dev/null || true

  gh issue edit "$ISSUE_NUM" --repo "$OWNER/$REPO" \
    --remove-label "auto-in-progress" --remove-label "auto-plan-ready"
fi

# ── PROGRESS.md 업데이트 ──────────────────────────────────────
if [ -f PROGRESS.md ]; then
  echo "==> PROGRESS.md 업데이트 중..."
  TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')
  if [ "$VERIFY_EXIT" = "PASS" ]; then
    STATUS="PR 생성"
  else
    STATUS="실패"
  fi
  # 활성 작업 행 제거 (완료 시)
  sed -i.bak "/| #${ISSUE_NUM} /d" PROGRESS.md && rm -f PROGRESS.md.bak
  git add PROGRESS.md
  git commit -m "chore: update PROGRESS.md for #${ISSUE_NUM}" || true
  git push origin HEAD 2>/dev/null || true
fi

echo "==> 완료: 이슈 #${ISSUE_NUM} — ${STATUS:-완료}"
````
