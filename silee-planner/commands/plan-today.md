---
description: 아침 계획 수립. 어제 미완료 항목 수집, 백로그 스캔, 오늘 계획 제안 및 Daily Note 생성/갱신.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# 오늘 계획 (plan-today)

어제 미완료 항목과 백로그를 종합하여 오늘의 할 일을 계획하고 Daily Note를 생성/갱신한다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

### Step 2: 오늘 Daily Note 사전 확인

1. 오늘 날짜로 Daily Note 경로를 생성한다 (Step 1에서 로드한 설정 사용).
2. Obsidian vault 경로를 파악한다:
   ```bash
   obsidian vaults verbose
   ```
   vault 이름에 해당하는 경로를 추출.
3. KR1 체크포인트 연체 확인 (best-effort):
   - 트래킹 파일 `{vault_path}/10 Projects/2026 Imagoworks/26 OKR/kr1-tracking.md`을 읽는다 (Read 도구).
   - 파일 없음 → 조용히 건너뛰기
   - 파일 있음 → 첫 5줄에서 `> 다음 업데이트:` 줄의 날짜를 파싱한다
     - 날짜 < 오늘 → 연체 플래그 ON (Step 6 계획 제안 시 상단에 경고 표시)
     - 날짜 >= 오늘 → 아무것도 하지 않음
4. 오늘 Daily Note 파일 존재 여부를 확인한다 (Read 도구 사용).

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | Step 3으로 진행 |
| 파일 있음 + Tasks 비어있음 | Step 3으로 진행 |
| 파일 있음 + Tasks 내용 있음 | 기존 Plan/Tasks를 보여주고 AskUserQuestion: "이미 오늘 계획이 있습니다. 기존 계획을 유지할까요, 새로 수립할까요?" |

**사용자 응답 분기**:
- "유지" → 기존 계획 요약 출력 후 **종료** (Step 9로 이동)
- "새로 수립" → Step 3으로 진행 (Step 8에서 기존 내용과 병합/덮어쓰기 처리)

### Step 3: 어제 Daily Note 읽기

1. 어제 날짜로 Daily Note 경로를 생성한다:
   - `{daily_notes_path}/{daily_note_format}.md` 패턴에서 변수 치환
   - 예: `01 Daily Notes/2026/04/2026-04-07.md`

2. Step 2에서 파악한 vault 경로를 사용하여 어제 Daily Note 파일을 직접 읽는다 (Read 도구 사용).

3. 미완료 항목(`- [ ]`)을 수집한다:
   - 섹션별로 분류 (Projects / Areas / Inbox)
   - 각 항목의 텍스트와 소속 섹션을 기록

**어제 Daily Note가 없는 경우**: "어제 Daily Note가 없습니다." 안내 후 Step 4로 진행.

### Step 4: 백로그 스캔 (Issue Box)

`inbox_folder_path` 하위의 이슈 파일을 스캔한다.

```bash
obsidian vault="<vault>" files folder="<inbox_folder_path>"
```

각 파일의 property를 읽어 요약 목록을 생성한다:
- open 이슈: 제목, 카테고리, 우선순위
- blocked 이슈: 제목, 대기 사유

**blocked 이슈 리뷰**: blocked 이슈가 있으면 목록을 보여주고 "해제 가능한 항목이 있나요?" 질문.
해제 가능하면 status를 open으로 변경.

### Step 5: 미팅/일정 확인

AskUserQuestion으로 묻는다: "오늘 미팅이나 고정 일정이 있나요? (없으면 건너뛰기)"

사용자가 입력한 일정은 Plan 섹션에 반영.

### Step 6: 오늘 계획 제안

수집된 정보를 종합하여 오늘의 할 일을 제안한다.

**연체 플래그가 ON인 경우** (Step 2-3에서 감지), 제안 상단에 경고를 표시한다:

```
> ⚠ KR1 체크포인트 업데이트가 {N}일 연체되었습니다 (기한: {date}).
> `/silee-planner:project-checkpoint` 실행을 권장합니다.
```

**제안 형식**:

```markdown
## Plan
> 오늘 집중할 것 (최대 3개)

1. {가장 중요한 작업}
2. {두 번째 작업}
3. {세 번째 작업}

## Tasks
#### Projects
- [ ] {프로젝트: 작업 내용}
- [ ] {프로젝트: 작업 내용}

#### Areas
- [ ] {영역: 작업 내용}

#### Inbox
- [ ] {기타 작업}
```

**우선순위 기준**:
1. 어제 미완료 중 이어서 해야 할 것
2. 백로그에서 high 우선순위 open 이슈
3. 사용자가 언급한 일정/미팅 관련 작업
4. 기타

### Step 7: 사용자 확인

AskUserQuestion으로 제안된 계획을 확인받는다:
- "이대로 진행" → Step 8
- 추가/삭제/순서 변경 → 반영 후 Step 8

**어제 미완료 항목 중 오늘 안 할 것**:
각 미완료 항목에 대해 "이월할까요, 백로그로 보관할까요?" 질문.
- 이월 → 오늘 Tasks에 포함
- 백로그 → capture-task 백로그 보관 모드로 Issue Box에 보관

### Step 8: Daily Note 생성/갱신

1. 오늘 날짜로 Daily Note 경로를 생성한다.
2. 파일 존재 여부 확인:

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | 새 Daily Note 생성 (아래 템플릿 사용) |
| 파일 있음 + Tasks 비어있음 | Tasks 섹션만 채우기 |
| 파일 있음 + Tasks 내용 있음 | "이미 계획이 있습니다. 병합할까요, 덮어쓸까요?" 질문 |

**Daily Note 템플릿**:

```markdown
---
tags:
  - daily
date: {YYYY-MM-DD}
---
## {YYYY-MM-DD} {요일}
## Plan
> 오늘 집중할 것 (최대 3개)

1. {Plan 1}
2. {Plan 2}
3. {Plan 3}

## Tasks
#### Projects
{프로젝트별 체크리스트}

#### Areas
{영역별 체크리스트}

#### Inbox
{기타 체크리스트}

## Log
> 작업 중 메모, 발견, 의사결정

-

## Review
> 하루 마감 시 작성

- 완료:
- 미완료 → 내일로:
- 배운 것:
```

3. obsidian CLI로 파일을 생성하거나 Edit 도구로 갱신한다.

### Step 9: 완료 출력

생성/갱신된 Daily Note 경로와 오늘 계획 요약을 출력한다.

## Do / Don't

| Do | Don't |
|----|-------|
| 어제 미완료 항목을 빠짐없이 수집 | 미완료 항목을 무시하고 새로 시작 |
| 백로그의 우선순위를 존중하여 제안 | 모든 백로그 항목을 오늘에 넣기 |
| Plan 섹션은 최대 3개로 제한 | 10개씩 나열하여 집중력 분산 |
| 사용자 확인 후 Daily Note 작성 | 확인 없이 자동 생성 |
| 기존 Daily Note가 있으면 병합 여부 질문 | 기존 내용을 묻지 않고 덮어쓰기 |
| blocked 이슈 해제 가능 여부 확인 | blocked 이슈를 무시 |
| 수집 전에 오늘 기존 계획 유무를 먼저 확인 | 기존 계획이 있는데 수집부터 시작 |
