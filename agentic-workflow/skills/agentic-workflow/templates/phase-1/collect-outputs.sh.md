# collect-outputs.sh.md

Phase 1 (Daily Self-Critique) bot 출력물 수집 스크립트 템플릿.

- **생성 경로**: `.github/workflows/daily-critique/collect-outputs.sh`
- **목적**: 전일 bot이 생성/참여한 PR 목록을 수집하고, 각 PR의 본문/커밋/리뷰/변경 파일을 JSON으로 저장한다.
- **치환 변수**: `{{owner}}`, `{{repo}}`, `{{bot_account}}`

---

````sh
#!/bin/sh
set -eu

RESULT_DIR="${1:?Usage: collect-outputs.sh <result-dir>}"
OWNER="{{owner}}"
REPO="{{repo}}"
BOT_ACCOUNT="${BOT_ACCOUNT:-{{bot_account}}}"

# ── 날짜 계산 (macOS/Linux 호환) ────────────────────────
if date -v-1d +%Y-%m-%d >/dev/null 2>&1; then
  YESTERDAY="$(date -v-1d +%Y-%m-%d)"
else
  YESTERDAY="$(date -d yesterday +%Y-%m-%d)"
fi

OUTPUT_FILE="${RESULT_DIR}/collected-outputs.json"

# ── PR 목록 수집 ────────────────────────────────────────
echo "[collect-outputs] Fetching PRs since ${YESTERDAY}..."

if [ -n "${BOT_ACCOUNT}" ]; then
  PR_NUMBERS="$(gh pr list \
    --repo "${OWNER}/${REPO}" \
    --author "${BOT_ACCOUNT}" \
    --state all \
    --search "created:>=${YESTERDAY}" \
    --json number \
    --jq '.[].number' 2>/dev/null || true)"
else
  # fallback: agentic-workflow 라벨이 붙은 PR (Phase 3 pipeline 대응)
  PR_NUMBERS="$(gh pr list \
    --repo "${OWNER}/${REPO}" \
    --label "agentic-workflow" \
    --state all \
    --search "created:>=${YESTERDAY}" \
    --json number \
    --jq '.[].number' 2>/dev/null || true)"
fi

if [ -z "${PR_NUMBERS}" ]; then
  echo "[collect-outputs] No PRs found."
  printf '[]' > "${OUTPUT_FILE}"
  exit 0
fi

# ── 각 PR 상세 수집 ─────────────────────────────────────
echo "[collect-outputs] Collecting details for each PR..."

FIRST=true
printf '[' > "${OUTPUT_FILE}"

echo "${PR_NUMBERS}" | while read -r pr_num; do
  [ -z "${pr_num}" ] && continue

  if [ "${FIRST}" = true ]; then
    FIRST=false
  else
    printf ',' >> "${OUTPUT_FILE}"
  fi

  # PR 메타데이터 (본문, 상태, 라벨)
  PR_JSON="$(gh pr view "${pr_num}" \
    --repo "${OWNER}/${REPO}" \
    --json number,title,body,state,labels,reviewDecision,changedFiles \
    2>/dev/null || echo '{}')"

  # 커밋 메시지 목록
  COMMITS="$(gh pr view "${pr_num}" \
    --repo "${OWNER}/${REPO}" \
    --json commits \
    --jq '[.commits[].messageHeadline]' \
    2>/dev/null || echo '[]')"

  # 리뷰 코멘트
  REVIEWS="$(gh api "repos/${OWNER}/${REPO}/pulls/${pr_num}/reviews" \
    --jq '[.[] | {user: .user.login, state: .state, body: .body}]' \
    2>/dev/null || echo '[]')"

  # 변경 파일 목록
  FILES="$(gh pr diff "${pr_num}" \
    --repo "${OWNER}/${REPO}" \
    --name-only 2>/dev/null || echo '')"
  FILES_JSON="$(printf '%s' "${FILES}" | python3 -c "
import sys, json
lines = [l.strip() for l in sys.stdin if l.strip()]
print(json.dumps(lines))
" 2>/dev/null || echo '[]')"

  # PR 단위 JSON 조합
  python3 -c "
import sys, json

pr = json.loads('''${PR_JSON}''') if '''${PR_JSON}'''.strip() else {}
commits = json.loads('''${COMMITS}''') if '''${COMMITS}'''.strip() else []
reviews = json.loads('''${REVIEWS}''') if '''${REVIEWS}'''.strip() else []
files = json.loads('''${FILES_JSON}''') if '''${FILES_JSON}'''.strip() else []

entry = {
    'number': pr.get('number', ${pr_num}),
    'title': pr.get('title', ''),
    'body': pr.get('body', ''),
    'state': pr.get('state', ''),
    'review_decision': pr.get('reviewDecision', ''),
    'labels': [l.get('name','') for l in pr.get('labels', [])],
    'commits': commits,
    'reviews': reviews,
    'changed_files': files
}

sys.stdout.write(json.dumps(entry, ensure_ascii=False))
" >> "${OUTPUT_FILE}"

  echo "[collect-outputs] Collected PR #${pr_num}"
done

printf ']' >> "${OUTPUT_FILE}"

PR_COUNT="$(echo "${PR_NUMBERS}" | grep -c . || true)"
echo "[collect-outputs] Done. ${PR_COUNT} PR(s) collected to ${OUTPUT_FILE}"
````
