---
description: 주간 회고. Daily Notes, Memento 세션, Jira/Confluence, 커밋을 포함한 한 주의 총체적 흐름을 순간·질문·배움 중심으로 회고.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources, mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql, mcp__plugin_atlassian_atlassian__searchConfluenceUsingCql
argument-hint: <기간>
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# 주간 회고 (weekly-report)

한 주의 총체적 흐름을 **순간·질문·배움** 중심으로 회고한다. 생산성 지표가 아니라 경험의 질이 중심.

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| 기간 | 시작~종료 날짜 (자연어 또는 YYYY-MM-DD) | O | - |

**사용 예시**:
```
/memento:review-week 이번 주
/memento:review-week 지난 주
/memento:review-week 2026-04-06~2026-04-12
```

**Breaking change**: 이전 버전의 `[레포 목록]`, `[작성자]` 인자는 제거됨. 레포는 `repos_base_path`에서 자동 탐지, 작성자는 config의 `author_email` 사용. 이전 구문 사용 시 경고 1줄 후 기본값으로 진행.

## 워크플로우

### Step 1: 설정 로드 및 인자 파싱

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 Read한다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `weekly_notes_path`, `weekly_note_format`, `author_email`, `inbox_folder_path`, `in_progress_folder_path`, `resolved_folder_path`, `dismissed_folder_path`, `repos_base_path`, `atlassian_site_url`, `atlassian_cloud_id` 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**기간 파싱**:
- 자연어("이번 주", "지난 주")는 월요일 기준으로 실제 날짜 변환. 주 시작 = 월요일, 종료 = 일요일
- `YYYY-MM-DD~YYYY-MM-DD` 형식 직접 지원
- 기간 계산은 `date` 명령 사용:
  ```bash
  # 이번 주 월요일
  date -j -v-Mon "+%Y-%m-%d"
  ```

**`repos_base_path` 결정**:
1. config에 값이 있으면 그대로 사용
2. 없으면 현재 `pwd`에서 `Repositories` 세그먼트를 찾아 그 디렉토리 사용
   ```bash
   pwd | sed -E 's|(.*/Repositories)/.*|\1|'
   ```
3. 위 실패 시 AskUserQuestion으로 경로 확인 + 선택값을 config에 캐시 (Edit 도구로 frontmatter 수정)

**Atlassian 설정 확인**:
- `atlassian_site_url`이 빈 문자열이면 Step 2B 전체 스킵
- `atlassian_site_url` 있고 `atlassian_cloud_id` 없으면 `getAccessibleAtlassianResources` 호출하여 URL 매칭 후 config에 `atlassian_cloud_id` 캐시

**vault 경로 파악**:
```bash
obsidian vaults verbose
```

**vault 이름 매칭 규칙**:
1. config의 `vault` 값과 출력의 vault 이름을 **정확 일치** 우선 비교
2. 정확 일치 실패 시 **대소문자 무시 substring** 매칭 (config 값이 출력 이름의 부분문자열이거나 그 반대)
3. 모두 실패 시 AskUserQuestion으로 사용자에게 목록 제시 + 선택값으로 config의 `vault` 필드 갱신 (Edit 도구)

매칭된 vault의 파일시스템 경로를 `$VAULT_PATH`로 사용.

**임시 디렉토리 생성**:
```bash
mktemp -d
```

출력된 경로(예: `/tmp/tmp.AbC123`)를 **문자열로 기억**하여 이후 Step의 Bash 명령에 직접 치환한다.

> **주의**: Bash 도구는 호출마다 새 셸을 띄우므로 `$TMPDIR` 같은 환경변수는 **영속되지 않는다**. 이후 Step의 명령에서는 `$TMPDIR` 참조 대신 Step 1에서 얻은 실제 경로 문자열을 인라인으로 치환해야 한다. 이 문서의 `$TMPDIR`은 편의 표기일 뿐이다.

### Step 2A: 로컬 수집 (Python 스크립트 병렬 실행)

4개의 Python 스크립트를 Bash `&`로 병렬 실행한다. `${CLAUDE_PLUGIN_ROOT}`를 사용하여 스크립트 경로를 참조한다.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/collect_daily_notes.py" \
  "$VAULT_PATH" "$DAILY_NOTES_PATH" "$DAILY_NOTE_FORMAT" "$START" "$END" \
  > "$TMPDIR/daily.json" 2>"$TMPDIR/daily.err" &

python3 "${CLAUDE_PLUGIN_ROOT}/scripts/collect_memento_logs.py" \
  "$HOME/.claude/memento/projects" "$START" "$END" \
  > "$TMPDIR/memento.json" 2>"$TMPDIR/memento.err" &

python3 "${CLAUDE_PLUGIN_ROOT}/scripts/collect_commits.py" \
  "$REPOS_BASE_PATH" "$AUTHOR_EMAIL" "$START" "$END" \
  > "$TMPDIR/commits.json" 2>"$TMPDIR/commits.err" &

python3 "${CLAUDE_PLUGIN_ROOT}/scripts/collect_issues.py" \
  "$VAULT_PATH" "$INBOX_PATH" "$IN_PROGRESS_PATH" "$RESOLVED_PATH" "$DISMISSED_PATH" \
  "$START" "$END" \
  > "$TMPDIR/issues.json" 2>"$TMPDIR/issues.err" &

wait
```

- 각 스크립트 실패 시 stderr 파일에 기록, JSON은 비어있을 수 있음
- 실패한 소스는 다음 Step에서 빈 결과로 자연스럽게 처리됨

### Step 2B: Atlassian 수집 (MCP 호출, 선택)

`atlassian_cloud_id`가 있는 경우에만 실행한다. 없으면 이 Step 전체를 스킵하고 빈 파일로 초기화:

```bash
echo '{"issues": []}' > "$TMPDIR/jira.json"
echo '{"pages": []}' > "$TMPDIR/confluence.json"
```

**Atlassian 활성화 시**:

1. **Jira 이슈 수집**:
   - 호출: `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql`
   - 파라미터:
     - `cloudId`: config의 `atlassian_cloud_id`
     - `jql`: `(assignee = currentUser() OR worklogAuthor = currentUser()) AND updated >= "{START}" AND updated <= "{END}" ORDER BY updated DESC`
     - `fields`: `["summary", "status", "issuetype", "priority", "updated", "description"]`
     - `limit`: 50
   - 결과를 다음 형식으로 간소화하여 Write 도구로 `$TMPDIR/jira.json`에 저장:
     ```json
     {
       "issues": [
         {
           "key": "CND-1234",
           "summary": "...",
           "status": "Done",
           "type": "Task",
           "priority": "Medium",
           "updated": "2026-04-07",
           "description_excerpt": "첫 200자"
         }
       ]
     }
     ```
   - 실패 시 `{"issues": []}`로 저장하고 다음 진행

2. **Confluence 페이지 수집**:
   - 호출: `mcp__plugin_atlassian_atlassian__searchConfluenceUsingCql`
   - 파라미터:
     - `cloudId`: config의 `atlassian_cloud_id`
     - `cql`: `type = page AND contributor = currentUser() AND lastmodified >= "{START}" AND lastmodified <= "{END}" ORDER BY lastmodified DESC`
     - `limit`: 50
   - 결과 간소화하여 `$TMPDIR/confluence.json`에 저장:
     ```json
     {
       "pages": [
         {
           "id": "...",
           "title": "...",
           "space": "ENG",
           "lastmodified": "2026-04-07",
           "url": "https://...",
           "excerpt": "첫 200자"
         }
       ]
     }
     ```
   - 실패 시 `{"pages": []}`로 저장

**중단 조건**: Daily Notes + Memento + Jira + Confluence 모두 0건이면 "회고할 재료가 없습니다" 안내 후 임시 디렉토리 삭제하고 중단.

### Step 3: 타임라인 묶기

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/bundle_week.py" \
  "$TMPDIR/daily.json" "$TMPDIR/memento.json" \
  "$TMPDIR/commits.json" "$TMPDIR/issues.json" \
  "$TMPDIR/jira.json" "$TMPDIR/confluence.json" \
  > "$TMPDIR/timeline.json"
```

### Step 4: 회고 초안 작성

`$TMPDIR/daily.json`, `$TMPDIR/memento.json`, `$TMPDIR/commits.json`, `$TMPDIR/issues.json`, `$TMPDIR/jira.json`, `$TMPDIR/confluence.json`, `$TMPDIR/timeline.json`을 Read 도구로 모두 읽어 회고 초안을 작성한다.

#### 작성 원칙

- **정보 전달형 문체**. 각 항목은 "무엇 + 왜 중요한가(함의) + 근거"가 드러나야 한다. 감상적 수사("에너지원이었다", "단단해져 있었다", "~한 감각" 등) 및 편지 톤 금지
- **중요도 신호**. 핵심 단어/결론은 **굵게** 처리하여 스캔 가능하게. 모든 문단은 한 줄 요약 가능해야 함
- **함의 한 줄 의무**. "순간들" 섹션의 각 항목은 마지막에 `**함의**: ...` 한 줄로 왜 기억할 만한지 명시
- **표/차트 본문 금지**. 본문은 bullet 또는 번호 리스트 중심. 표는 부록에만
- **숫자/비율/통계 언급 금지**. 부록의 `counts`도 본문에 인용하지 않는다
- **최상급 금지**. "가장 많이", "가장 커밋이 많은" 같은 양적 사고 금지
- **원문 인용은 근거로만**. Review "배운 것", Memento `decisions`/`analysis`, Jira summary 등 **사용자가 직접 쓴 문장**을 인용부호로 박되, 감상적 장식이 아닌 근거 제시 용도로 사용
- **placeholder 금지**. `_{직접 써주세요}_`, `_{YYYY-MM-DD}_` 같은 빈 자리 금지. AI가 근거를 찾지 못하면 해당 항목을 작성하지 않거나 "이번 주에는 뚜렷한 X가 없었다"로 짧게 닫을 것
- **범주화 금지**. "기술/비기준", "프로젝트/영역" 같은 분류 만들지 말 것
- **회고 재료가 빈약하면 솔직하게**: 해당 섹션을 "이번 주에는 뚜렷한 X가 없었다"로 한 줄로 닫기

#### 회고 템플릿

```markdown
---
created: {today}
period_start: {START}
period_end: {END}
tags:
  - weekly-review
---

# 주간 회고: {START} ~ {END} (Week {WW})

## 1. 이번 주의 순간들

{3-5개 순간을 각각 `### {YYYY-MM-DD} - {한 줄 요약}` 헤딩으로 작성.
각 순간의 본문은 1-2문단으로:
- 무엇이 일어났는가 (근거: Daily Review, Memento decisions/outcome, Jira summary 등 원문 짧게 인용 가능)
- **함의**: 한 줄로 "왜 기억할 만한가" 명시

감상적 서술(장면 묘사, 감각 표현) 금지. 날짜 앵커는 헤딩에만.}

## 2. 살아있게 한 것 / 힘들게 한 것

### 살아있게 한 것

{Memento/Review 원문에서 "몰입/돌파/발견"의 단서 2-3개를 bullet으로.
각 bullet: `- **{키워드}**: {한 문장 요약}. {함의 또는 맥락 한 줄}.`
감상적 수사 금지. 근거 문장 인용 시 인용부호로 감싸되 분량은 한 문장 이내.}

### 힘들게 한 것

{"블로커/반복/미완"의 단서 2-3개를 bullet으로. 동일 형식.}

## 3. 떠오른 질문

{Daily Notes Log/Review, Memento analysis에서 물음표나 미결정을 발견하여 bullet로 나열.
각 질문은 한 줄로 명확히, 뒤에 "왜 답이 비어있는지"를 한 줄 덧붙임.
재료가 없으면 "이번 주에는 뚜렷한 질문을 남기지 않았다" 한 줄로 닫기.}

## 4. 배움과 발견

{번호 리스트로 5-7개. 각 항목:
`N. **{핵심 주장}**: {한 문장 설명}. {근거 또는 적용 시점}.`
범주화 금지. 같은 주제로 묶인다면 해석 문단을 끝에 한 단락 추가 가능(선택).}

## 5. 남겨진 것들

{Daily Notes 미완료 + 열린 이슈 + Memento "결정 유보"에서 **인지적/의사결정상 실마리**를 추출.
bullet로 3개 이내. 각 항목:
`- **{제목}**: {무엇이 미결인가}. {왜 중요한가 또는 리스크}.`
"N건 이월" 같은 수치 금지.}

## 6. Next Week Reminders

> 다음 주 동안 계속 의식해야 할 5-7개 인사이트. `active-reminders.md`에도 자동 집계되어 /memento:planning, /memento:review-day/pick-task/finish-task 실행 시 컨텍스트로 주입됨.

{1-5 섹션의 내용을 종합하여 5-7개의 실행 가능한 리마인드 인사이트 추출.
각 리마인드 형식:
`N. **{짧은 슬로건 또는 핵심 원칙}** - {2-3줄 맥락: 왜 중요한가 + 언제 적용하는가}. (근거: {원천 날짜/문서})`

리마인드 선별 기준:
- 이번 주에 새로 체화된 원칙·프레임워크
- 다음 주에 반복 마주칠 의사결정 상황
- 약속·마감·대외 관계 이행 리스크
- 미완 작업의 접근법 변경 지시

"편지" 톤 금지. 구체적 task 리스트가 아닌 원칙·시점·기준.}

---

## 부록

<details><summary>원시 타임라인 (시간순)</summary>

{timeline.json의 항목을 날짜별로 그룹화. 각 항목은 `- [{source}] {ref} — {preview}` 형식}

</details>

<details><summary>숫자로 본 한 주</summary>

| 지표 | 값 |
|------|-----|
| Daily Notes | {counts.daily_notes}일 |
| Memento 세션 | {counts.memento_sessions}건 |
| Commits | {counts.commits}건 |
| 활동 레포 | {counts.active_repos}개 |
| Issue Box | {counts.issues}건 |
| Jira 이슈 | {counts.jira_issues}건 |
| Confluence 페이지 | {counts.confluence_pages}건 |

</details>

<details><summary>커밋 로그</summary>

{commits.json의 repos별 그룹핑. 각 레포 아래 커밋 리스트 `- {date} {hash:0-7} {message}`}

</details>

<details><summary>Issue Box 목록</summary>

{issues.json의 issues 테이블 — 비어 있으면 이 섹션 생략}

| 상태 | 카테고리 | 제목 | 생성 | 해결 |
|------|----------|------|------|------|

</details>

<details><summary>Jira 이슈 목록</summary>

{jira.json의 issues 테이블 — 비어 있으면 이 섹션 생략}

| Key | 상태 | 유형 | 제목 | 업데이트 |
|-----|------|------|------|----------|

</details>

<details><summary>Confluence 페이지 목록</summary>

{confluence.json의 pages 테이블 — 비어 있으면 이 섹션 생략}

| 제목 | 스페이스 | 최종 수정 |
|------|----------|-----------|

</details>
```

### Step 5: 사용자 확인

AskUserQuestion으로 회고 **전문(full text)**을 보여주고 확인받는다:
- "이대로" → Step 6으로
- 수정 내용 입력 → 반영 후 다시 전문 확인 (최대 2회 수정 루프)

### Step 6: 파일 저장

config의 `weekly_notes_path` + `weekly_note_format`을 사용하여 저장 경로 생성.

**경로 변수 치환**:
| 변수 | 값 | 계산 |
|------|-----|------|
| `{YYYY}` | 4자리 연도 | `date "+%Y"` |
| `{MM}` | 2자리 월 | `date "+%m"` |
| `{WW}` | ISO 8601 주 번호 | `date -j -f "%Y-%m-%d" "$START" "+%V"` |

**최종 경로**: `{vault_path}/{weekly_notes_path}/{weekly_note_format}.md`
- 예: `02 Weekly Notes/2026/2026 Week-15.md`

**기존 파일 처리**:
- 이미 존재하면 `{filename}.bak`으로 백업 후 새 파일 작성 (사용자가 placeholder에 채워넣은 내용 보존)
- `.bak` 파일이 이미 있으면 덮어씀 (한 세대만 유지)

Write 도구로 새 회고 파일 작성.

### Step 6.5: Active Reminders 파일 갱신

Section 6 "Next Week Reminders"의 항목들을 `<vault_path>/<memento_root>/user/active-reminders.md`에 작성.

**작성 형식**:

```markdown
---
updated: {today}
source: weekly-report {weekly_note_format}
period: {START} ~ {END}
expires_at: {END + 7일}
---

# Active Reminders

> 이번 주 동안 /memento:planning, /memento:review-day/pick-task/finish-task 실행 시 자동으로 컨텍스트에 주입되는 인사이트. weekly-report가 매주 갱신.

1. **{슬로건}** - {맥락 2-3줄}. ({근거})
2. ...
```

**갱신 규칙**:
- 기존 `active-reminders.md`가 있으면 **덮어씀** (한 세대만 유지, 백업 없음 — 주간 회고 자체가 이전 리마인드를 보존)
- `expires_at`은 `END + 7일`로 계산: `date -j -f "%Y-%m-%d" -v+7d "$END" "+%Y-%m-%d"`
- 파일 Write 후 "Active reminders 갱신: {파일 경로} ({N}개 항목)" 출력

### Step 7: 임시 파일 정리

```bash
rm -rf "$TMPDIR"
```

정리 완료 후 "주간 회고 작성 완료: {파일 경로}" 출력.

## Do / Don't

| Do | Don't |
|----|-------|
| 본문은 bullet/번호 리스트 중심의 **정보 전달형** | 감상적 수사("에너지원이었다", "단단해져 있었다"), 편지 톤 |
| 각 항목에 `**함의**: ...` 한 줄로 중요도 신호 | 해석 없이 나열만, 또는 나열 없이 해석만 |
| 핵심 결론/원칙은 **굵게** 처리 | 스캔 불가한 긴 문단 |
| 원문 인용은 **근거**로만 사용 (한 문장 이내) | 원문을 감상적 장식 문장으로 박제 |
| 순간(moments)은 `### YYYY-MM-DD - 요약` 헤딩 | 날짜 앵커 `_{YYYY-MM-DD}_` 같은 placeholder |
| Memento `decisions`/`analysis`/`outcome`을 재료로 | Memento를 "AI와의 대화"로 오해하여 제외 |
| 배움은 번호 리스트 + 핵심 주장 굵게 | "기술/비기술" 범주화 |
| "남겨진 것"은 **인지적/의사결정상 실마리** | "미완료 N건" 식 수치 |
| Section 6은 **Next Week Reminders** (5-7개, 2-3줄 맥락, 근거 명시) | "다음 주의 나에게 편지", Continue/Change/Try 버킷 |
| 숫자는 `<details>` 부록에만 격리 | 본문에 수치 인용 |
| placeholder 전면 금지 (재료 부족 시 섹션을 한 줄로 닫기) | `_{직접 써주세요}_`, `_{진짜 하고 싶은 말을}` 등 |
| Active Reminders 파일을 매주 덮어쓰기로 갱신 | 누적 append (맥락 부풀림) |
| Repositories 하위 활성 레포 자동 탐지 | 레포를 사용자에게 일일이 묻기 |
| 수집은 폭넓게, 서술은 선별적으로 | 모든 수집 데이터를 본문에 풀기 |
| 회고 재료 0건이면 솔직하게 중단 | 빈약한 재료로 억지 서술 |
| 기존 파일은 `.bak`으로 백업 후 덮어쓰기 | 덮어쓰기로 placeholder 손실 |
| Python 스크립트로 결정론적 수집 | LLM에 파싱/집계 위임 |
| Jira/Confluence는 고정 JQL/CQL로 재현성 확보 | 쿼리를 LLM이 즉석에서 생성 |
| Jira 이슈의 summary/description을 원문 인용 재료로 | 이슈 상태 전환(In Progress→Done)을 본문 반영 |
| Atlassian 미설정 시 조용히 스킵 | "Jira 미설정" 경고로 노이즈 |
| 이전 인자 구문 사용 시 경고 1줄 후 기본값 진행 | 이전 구문을 그대로 해석 시도 |

## 보고서 품질 기준

- **총체성**: Daily Notes + Memento + Jira + Confluence + Commits + Issue Box를 모두 수집. 회고에 드러나는 것은 선별적
- **정보 밀도**: 감상 제거 + 중요도 신호(굵게) + 함의 한 줄. 스캔으로 핵심 파악 가능해야 함
- **근거 우선**: 모든 주장은 원문 인용 또는 날짜/파일 레퍼런스로 뒷받침. "느낌"만 남은 문단 금지
- **리마인드 가능성**: Section 6은 다음 주 실제 의사결정에서 재사용 가능한 원칙·시점·기준이어야 함
- **생산성 용어 제거**: 임팩트/효율/기여도/최상급 없음
- **placeholder 전면 금지**: AI가 재료를 찾지 못하면 해당 항목을 짧게 닫음. 사용자가 채워야 할 자리를 남기지 않음
