---
name: report-team-monthly
description: 팀 월간 보고 표를 자동 생성. 매월 Team Leader Monthly Check-in 미팅용 한 페이지 보고를 Jira·git·vault·memento·signals 다중 소스 병합으로 채워 마크다운으로 저장. 사용자가 "월간 팀 보고", "팀 월간 보고", "team monthly report", "월간 체크인 보고", "monthly check-in 표", "이번 달 팀 보고", "지난 달 팀 보고", "report team monthly"를 언급할 때 트리거.
user-invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다.

# 팀 월간 보고 (report-team-monthly)

매월 Team Leader Monthly Check-in 미팅에서 사용하는 한 페이지 표를 자동 생성한다. 사람이 손으로 12분 작성하던 표를 1분 안에 초안으로 받는 것이 목표.

## 표 구조 (사용자 미팅 양식)

```
[팀 핵심 요약 박스]                  진행한 일 핵심 요약 / 예정된 일 핵심 요약
[Project 행]                       Done / To do / Status / Issue
   - Hub
   - Connect
   - Landing Page
   - (필요 시) 공통/도구
```

규칙:
- 제품 버전 단위(Hub P002-002, Landing Page P010-002, Connect P004 등)로 묶는다. **Jira 티켓 번호는 표면화하지 않는다.**
- 셀 안 항목은 한 줄씩 들여쓰기 불릿(이미지 양식 그대로). 마크다운 표 셀에서는 `<br>` 줄바꿈.
- 영문 고유명사(FedEx, Azure, AWS S3, Core Web Vitals 등)는 그대로, 그 외는 한국어 명사구.
- Issue 칸은 자연어 한 줄(`파일 전송 관련 이슈`, `P010 배포 이후 성능 지표 하락하여 개선 중` 톤). 신호 없으면 `—`.

## 발화 분기 / 기간 해석

**필수 인자**: 대상 월. 발화에서 없으면 AskUserQuestion으로 확인.

| 발화 예시 | → 기간 (TARGET_MONTH) |
|---|---|
| "지난 달 팀 보고" / 인자 없음 (월말 ±2영업일 밖) | 지난 달 |
| "이번 달 팀 보고" / 월말 ±2영업일 이내 | 이번 달 (월말 마감 임박 케이스) |
| `last-month` / `this-month` 인자 | 명시값 |
| `2026-04` 같은 YYYY-MM 직접 지정 | 명시 월 |

기본 기간: TARGET_MONTH 1일 00:00 KST ~ 말일 23:59 KST. 인자 없을 때 오늘이 월말 ±2영업일 이내면 한 번 묻는다 (`이번 달` vs `지난 달`).

## 워크플로우

### Step 1: 시각/대상 기간 결정

```bash
TZ=Asia/Seoul LC_TIME=ko_KR.UTF-8 date "+%Y-%m-%d %H:%M %Z (%A)"
```

`TARGET_MONTH = YYYY-MM`, `FROM = TARGET_MONTH-01`, `TO = TARGET_MONTH-말일`. macOS 기준:
```bash
TZ=Asia/Seoul date -v1d -v"${TARGET_MONTH##*-}"m "+%Y-%m-%d"   # FROM
TZ=Asia/Seoul date -v1d -v+1m -v-1d "+%Y-%m-%d"               # TO (다음달 1일 -1일)
```

월말 ±2영업일 이내 호출 + 인자 없음 = AskUserQuestion 한 번 ("이번 달 vs 지난 달").

### Step 2: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md`를 Read 도구로 읽어 frontmatter에서 다음 키 추출:

- `vault_path`, `memento_root`, `daily_notes_path`, `daily_archive_path`
- (참고) `monthly_notes_path` 는 본 스킬이 사용하지 않음 — 보고서는 `30 Imagoworks/04 Monthly Check-in/` 고정.
- `repos_base_path` (회사 git 레포 루트)
- `atlassian_cloud_id`, `atlassian_site_url`
- `email`, `display_name_ko`
- `team_name_ko` (없으면 `display_name_ko` 첫 단어 + " 팀" 폴백 또는 `Connect 팀` 기본)
- `team_jira_project` (없으면 `CND` 기본)
- `team_products` — JSON 배열 (없으면 기본값):
  ```json
  [
    {"prefix": "H", "row_label": "Hub"},
    {"prefix": "C", "row_label": "Connect"},
    {"prefix": "L", "row_label": "Landing Page"}
  ]
  ```

설정 파일 없으면 `/memento:setup` 안내 후 중단.

`atlassian_cloud_id`가 없으면 `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources`로 1회 조회 후 config에 캐시(Edit). `atlassian_site_url`까지 없으면 Step 3-Jira는 스킵.

**임시 디렉토리**:
```bash
mktemp -d
```
이후 Bash 호출에서 직접 치환(셸 환경변수 영속 안 됨).

### Step 3: 다중 소스 병렬 수집

5 갈래를 병렬로 굴린다(가능한 도구 호출은 한 메시지에 묶어 동시 실행).

#### (1) Jira CND fetch — 3 쿼리

`mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` 호출, `cloudId`는 config 값, `responseContentFormat: "markdown"`, `maxResults: 100`, fields: `["summary", "status", "issuetype", "resolutiondate", "duedate", "priority", "labels", "components", "parent", "assignee"]`.

쿼리 A — Done in window:
```
project = <PROJ> AND statusCategory = Done AND resolved >= "<FROM>" AND resolved <= "<TO>" ORDER BY resolved DESC
```

쿼리 B — In-progress 활동:
```
project = <PROJ> AND statusCategory = "In Progress" AND updated >= "<FROM>"
```

쿼리 C — 향후 마감 (다음 30일):
```
project = <PROJ> AND statusCategory != Done AND duedate >= "<TO>" AND duedate <= "<TO+30d>" ORDER BY duedate ASC
```

응답이 토큰 한도 초과로 파일에 떨어지면(80건 = 326KB 사례 있음), 출력된 임시 파일 경로에 대해 `jq -r` 로 압축 TSV 추출:
```bash
jq -r '.issues.nodes[] | [.key, (.fields.issuetype.name // ""), (.fields.status.name // ""), (.fields.resolutiondate // "")[0:10], (.fields.duedate // ""), ((.fields.priority.name) // ""), ((.fields.components // []) | map(.name) | join(",")), (.fields.parent.fields.summary // "")[0:80], (.fields.summary // "")[0:120]] | @tsv' "$JIRA_FILE" > "$TMPDIR/jira-done.tsv"
```

세 쿼리 결과 → `$TMPDIR/jira-done.tsv`, `jira-inprog.tsv`, `jira-due.tsv`.

#### (2) git 머지 + 일반 커밋 로그

`repos_base_path` 하위에서 회사 레포 자동 탐색:
```bash
find "$REPOS_BASE_PATH" -maxdepth 3 -type d -name '.git' 2>/dev/null \
  | xargs -I{} dirname {} \
  | grep -Ei '(connect|hub|landing|imagoworks|monorepo)' \
  > "$TMPDIR/repo-list.txt"
```

각 레포에서 머지 커밋 + 일반 커밋 동시 수집:
```bash
while read repo; do
  echo "=== REPO: $repo ===" >> "$TMPDIR/git-merges.tsv"
  git -C "$repo" log --since="$FROM" --until="$TO 23:59" --merges --first-parent \
    --pretty=$'%h\t%ci\t%s' >> "$TMPDIR/git-merges.tsv"
  git -C "$repo" log --since="$FROM" --until="$TO 23:59" --no-merges \
    --pretty=$'%h\t%ci\t%an\t%s' >> "$TMPDIR/git-commits.tsv"
done < "$TMPDIR/repo-list.txt"
```

PR 제목 패턴 (`feat:`/`fix:`/`chore:` prefix)에서 명사구 후보 추출 — `awk -F'\t' '$NF ~ /^(feat|fix|chore|refactor):/ {print $0}'` 활용.

#### (3) vault 회사 폴더 mtime 스캔

```bash
find "$VAULT_PATH/30 Imagoworks" -name '*.md' \
  -newermt "$FROM" ! -newermt "$(date -j -v+1d -f '%Y-%m-%d' "$TO" '+%Y-%m-%d')" \
  > "$TMPDIR/vault-files.txt"
```

후보 파일은 헤드 30줄만 chain read. 우선순위:
1. `30 Imagoworks/{30 Hub,31 Connect,32 Landing Page}/{YY.MM PXXX-X}/` 하위 — P-코드 클러스터에 직접 attach.
2. `30 Imagoworks/01 Meeting Notes/`, `02 Self 1on1/`, `03 Member 1on1/` — 사건/이슈 시그널.
3. `30 Imagoworks/20 Initiatives/` — 이니셔티브 단위 흐름.

#### (4) memento 메모리 + handoff

```bash
ls "$VAULT_PATH/$MEMENTO_ROOT/projects/"*"/memory/${TARGET_MONTH}-"*"-log.md" 2>/dev/null > "$TMPDIR/log-files.txt"
ls "$VAULT_PATH/$MEMENTO_ROOT/projects/"*"/memory/${TARGET_MONTH}-"*"-handoff-"*.md 2>/dev/null > "$TMPDIR/handoff-files.txt"
```

handoff 파일명은 키워드만 보면 충분(`hotfix`, `postmortem`, `사고`, `phase-N-완료` 등). log 파일은 7일 단위로 묶어 chain read.

WORKING.md도 함께 헤드 100줄 read — "미완료 작업" 절에서 다음 달 To do 후보 추출.

#### (5) signals + KR1 + weekly-review

- signals: `01 Working/{YYYY-MM-*}-signals/` (현재 진행 중) + `99 Archives/Daily/{YYYY}/{MM}/{YYYY-MM-*}-signals/` (아카이브) 양쪽에서 `teams.md`/`mail.md`/`jira.md` 글로빙. 단순 라인 카운트 + grep으로 반복 키워드 추출(예: `사고`, `장애`, `실패`, `delay`).
- KR1: `30 Imagoworks/10 Objectives/kr1-tracking.md` Read → 해당 월 섹션에서 프로세스 준수율, 일정 준수율, CP1~CP4 진행 라인 그대로 추출.
- weekly-review: `10 Reflection/01 Weekly/{YYYY}/{YYYY}-W{WW}-weekly-review.md` 중 mtime이 TARGET_MONTH 안에 있는 4-5건. 헤더 + 첫 100줄 chain read.

### Step 4: 분류 + 다중 소스 병합

1. Jira 이슈 prefix 추출 (자기 summary 1차 → parent.fields.summary 2차):
   ```
   m = re.match(r'^\[([A-Z]+\d+(?:-\d+)?)\]', summary)
   ```
2. `team_products`의 `prefix`로 행 매핑:
   - `H...` → Hub
   - `C...` → Connect
   - `L...` → Landing Page
   - `D...` → (config에 등록된 경우) Dentbird Console
3. 매칭 실패 + summary에 `[QTrace]`, `[SDVR Process]` 등 비-제품 prefix → "공통/도구" 풀.
4. parent 없고 summary에 prefix 없으면 → "공통/도구" 풀.
5. 각 P-코드 클러스터에 다른 소스 attach:
   - vault `26.MM PXXX-X/` 폴더 메모 (P-코드 일치)
   - git PR/머지 커밋 중 제목/브랜치명에 P-코드 또는 에픽 키워드 포함된 것
   - memento log/handoff에서 같은 P-코드/키워드 언급 라인
   - signals에서 관련 사고 알림
6. "공통/도구" 풀은 회사 인프라/툴(GitHub Pages, CI, QTrace, SDVR Process 등) 자체 기준 그룹핑.

### Step 5: 명사구 압축 (LLM 합성)

각 P-코드 클러스터에 대해 attach된 (Jira 이슈 리스트 + vault 메모 헤드 + git PR 제목 + memento log 라인)을 통합 입력으로 명사구 한 줄씩 합성.

**표현 우선순위**:
1. vault에 사용자가 적은 명사구 그대로
2. weekly-review에 정제된 표현
3. Jira summary 압축

**합성 규칙**:
- 4-7개 한국어 어절
- Jira 티켓 번호/한자/영문 약어 노출 금지(영문 고유명사 OK: FedEx, Azure, AWS S3, Core Web Vitals 등)
- 동사형 < 명사형 (`개선`, `추가`, `전환`, `정비`)
- 중복 어휘 통합

**예시 (4월 Connect 팀 사례)**:
- Hub P002-002 → "FedEx 송장 UX 개선" / "주문 가격 수정 / 변경 이력 기능 추가" / "파일 전송 안정성 및 속도 개선" / "Azure Storage → AWS S3 전환"
- Landing Page P010-002 → "페이지 성능 지표 개선 (Core Web Vitals)"
- Connect → "E2E 테스트 시나리오 보완"

### Step 6: Issue 칸 합성

**Status 칸은 비워둔다** (`—` 또는 빈 셀). 사용자 미팅 양식에서 Status는 진행한 일과 중복되는 경우가 많아 따로 채우지 않는다. 사용자가 미팅 직전에 손으로 한 줄 적는 영역으로 남겨두면 충분.

**Issue 칸 (자연어 한 줄, 우선순위 순)**:
1. memento log/handoff에서 사용자가 직접 적은 사건 표현 (`zip 업로드 17건 사고`, `D-N 연체`)
2. vault P-코드 폴더에 `postmortem`/`hotfix`/`사고`/`연체` 키워드 메모 → 해당 메모 헤드의 한 줄 추출
3. signals 한 달 누적에서 반복 출현한 알림 (사고/장애/실패)
4. Jira priority=Critical 진행 중 / 연체된 에픽 (`duedate < TODAY` 진행 중)
5. 직전 달 To do였는데 이번 달 Done에 안 잡힌 회수

신호 없으면 `—`.

### Step 7: 보고서 작성

파일 경로:
```
$VAULT_PATH/30 Imagoworks/04 Monthly Check-in/{미팅일}-{teamSlug}-team-monthly-check-in.md
```

- `미팅일`: `YYYY-MM-DD`. **Team Leader Monthly Check-in 미팅 날짜**(보통 월말 마지막 영업일 또는 그 직후 첫 영업일). 호출 시점이 TARGET_MONTH 안이고 평일이면 호출일을 그대로 사용. TARGET_MONTH 마지막 영업일을 지났으면 그 마지막 영업일. 해당 월에 미팅이 없거나 모호하면 한 번 묻는다.
- `teamSlug`: `team_name_ko`에서 한국어/공백 제거 + 소문자 (`Connect 팀` → `connect`).
- 폴더가 없으면 `mkdir -p`.

본문 템플릿:

```markdown
---
tags:
  - team-monthly-report
team: {team_name_ko}
period: {FROM} ~ {TO}
generated_at: {NOW_KST}
---

# {team_name_ko} 월간 보고 — {YYYY}-{MM}

## 핵심 요약

| 진행한 일 핵심 요약 | 예정된 일 핵심 요약 |
|---|---|
| - {Done 명사구 1}<br>- {Done 명사구 2}<br>- {Done 명사구 3} | - {To do 명사구 1}<br>- {To do 명사구 2} |

## Project별

| Project | Done (진행한 일) | To do (예정된 일) | Status (현 상황) | Issue (특이 사항) |
|---|---|---|---|---|
| **Hub** | {P-코드 단계 + 명사구 들여쓰기 불릿, `<br>`로 구분} | {다음 마일스톤 한 줄} |  | {Issue or —} |
| **Connect** | … | … |  | … |
| **Landing Page** | … | … |  | … |
```

세부 규칙:
- Project 행의 Done 셀은 "P002-002 개발 중<br>- FedEx 송장 UX 개선<br>- …" 형태(이미지 양식과 동일). 사용자 미팅 표 톤이 SSOT.
- To do 셀은 "P002-002 5/19 배포 예정" 한 줄이 기본. 다음 마일스톤이 여러 개면 `<br>`로 추가.
- **Status 셀은 비워둔다** (사용자가 미팅 직전 한 줄 추가). 진행한 일과 톤이 겹치는 자동 합성을 만들지 않는다.
- 보고서는 한 페이지에 핵심 요약 박스 + Project 표 두 블록만 둔다. "공통/도구" 풀, "미팅 강조 포인트 후보", "이전 회차 diff", 데이터 소스 footer 같은 추가 섹션은 생성하지 않는다 — 미팅 표는 한 표가 전부.

### Step 8: 저장

- `Write` 도구로 위 파일 저장 (필요 시 `mkdir -p '30 Imagoworks/04 Monthly Check-in'` 선행).
- 같은 경로에 이미 파일이 있으면(같은 달 재생성) 기존 내용을 덮어쓰지 말고 한 번 묻는다 (AskUserQuestion: 덮어쓰기 / 새 파일 `-rev2` 추가 / 중단).

### Step 9: 완료 출력

- 저장된 파일 경로
- 채워진 행 개수 / 빈 셀 개수
- 다음 행동 제안: "Status 칸은 미팅 직전 한 줄로 손수 채우세요. 명사구를 손보면 다음 호출 시 그 표현을 우선 reuse합니다."

## 원칙

- **사용자 미팅 표가 톤 SSOT**. 짧은 명사구, 한 페이지 한 표, 추가 섹션 없음. 보고서를 회의 자료처럼 부풀리지 않는다.
- 마일스톤 골격은 **Jira가 SSOT**. 다른 소스가 Jira와 충돌하면 Jira를 따른다.
- 명사구 톤은 **vault > Jira summary**. 사용자가 정제한 표현을 우선.
- **Status 칸은 자동 합성하지 않는다.** 진행한 일과 중복되기 쉬워 사용자가 미팅 직전 한 줄로 손수 채우는 영역으로 둔다.
- Issue 칸은 **memento log/handoff > vault 메모 > signals > Jira priority**. 사용자가 본인 입으로 적은 자연어가 가장 신뢰도 높음.
- Jira 응답이 큰 경우 항상 청크 파싱 fallback (오늘 사례에서 326KB 발생, 80건 기준).
- 출력은 사람이 슬라이드 표에 바로 옮길 수 있어야 한다 — 셀 안 항목은 한 줄씩 들여쓰기 불릿.
- 영문 고유명사는 그대로, 그 외는 한국어 명사형.
- "공통/도구" 풀은 표 하단 별도 섹션. 사용자가 보고 행 추가 결정.
- 사용자가 명사구를 직접 손보면 다음 호출 때 vault 최신 파일을 참고해 같은 표현을 우선 reuse(consistency).
- 한 호출 내 첫 출현 약어는 풀어쓰기 또는 괄호 병기 (`Key Result 1(KR1)`). 산업 표준(API/HTTP/JSON/CI/CD)과 Jira 티켓 번호는 면제.
