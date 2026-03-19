# queue.sh.md

Phase 3 (Issue Pipeline) 라벨 기반 큐 관리 스크립트 템플릿.

- **생성 경로**: `.github/workflows/issue-pipeline/queue.sh`
- **목적**: `auto-implement` 라벨이 붙은 이슈 중 처리 대상을 선정한다. 이미 진행 중인 이슈가 있거나 일일 한도에 도달하면 처리를 건너뛴다.
- **치환 변수**: `{{owner}}`, `{{repo}}`, `{{daily_limit}}`, `{{bot_account}}`
- **의존성**: gh CLI, jq

---

````sh
#!/bin/sh
set -eu

OWNER="{{owner}}"
REPO="{{repo}}"
DAILY_LIMIT="${DAILY_LIMIT:-{{daily_limit}}}"
BOT_ACCOUNT="${BOT_ACCOUNT:-{{bot_account}}}"

# ── 진행 중 이슈 확인 ────────────────────────────────────────
IN_PROGRESS=$(gh issue list --repo "$OWNER/$REPO" \
  --label "auto-in-progress" --state open --json number --jq 'length')

if [ "$IN_PROGRESS" -gt 0 ]; then
  echo "이미 처리 중인 이슈 존재. 건너뜀." >&2
  exit 0
fi

# ── 일일 한도 확인 ────────────────────────────────────────────
TODAY=$(date -u '+%Y-%m-%d')
DONE_TODAY=$(gh issue list --repo "$OWNER/$REPO" \
  --label "auto-in-progress" --state all --json closedAt,labels \
  --jq "[.[] | select(.closedAt != null and (.closedAt | startswith(\"$TODAY\")))] | length" \
  2>/dev/null || echo "0")

if [ "$DONE_TODAY" -ge "$DAILY_LIMIT" ]; then
  echo "일일 한도 도달 (${DONE_TODAY}/${DAILY_LIMIT}). 건너뜀." >&2
  exit 0
fi

# ── 대기 중 이슈 조회 (가장 오래된 것 우선) ──────────────────
ISSUE_NUM=$(gh issue list --repo "$OWNER/$REPO" \
  --label "auto-implement" --state open \
  --json number,createdAt \
  --jq 'sort_by(.createdAt) | .[0].number // empty')

if [ -z "${ISSUE_NUM:-}" ]; then
  # 승인 대기 이슈 확인 (plan-ready 상태에서 approve 코멘트가 있는 것)
  PLAN_READY=$(gh issue list --repo "$OWNER/$REPO" \
    --label "auto-plan-ready" --state open \
    --json number,createdAt \
    --jq 'sort_by(.createdAt) | .[0].number // empty')

  if [ -n "${PLAN_READY:-}" ]; then
    # approve 코멘트 존재 확인
    APPROVED=$(gh issue view "$PLAN_READY" --repo "$OWNER/$REPO" --json comments \
      --jq "[.comments[].body | select(contains(\"@${BOT_ACCOUNT} approve\"))] | length")
    if [ "$APPROVED" -gt 0 ]; then
      printf '%s' "$PLAN_READY"
      exit 0
    fi
  fi

  # 처리할 이슈 없음
  exit 0
fi

printf '%s' "$ISSUE_NUM"
````
