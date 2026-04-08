---
description: 작업 완료 처리. Daily Note 체크 + Issue Box 연동 + 남은 작업 리마인드 + 다음 작업 전환. 인자 있으면 fuzzy match로 빠른 완료.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: [완료한 작업 키워드]
---

# 작업 완료 (task-done)

오늘 Daily Note에서 완료한 작업을 체크하고, Issue Box 연동 처리 후, 남은 작업을 리마인드한다.
하루 마감 정리는 `/silee-planner:today-review`를 사용한다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path`, `in_progress_folder_path`, `resolved_folder_path` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

### Step 2: 오늘 Daily Note 읽기

1. 오늘 날짜로 Daily Note 경로를 생성한다:
   - `{daily_notes_path}/{daily_note_format}.md` 패턴에서 변수 치환
   - 예: `01 Daily Notes/2026/04/2026-04-08.md`

2. Obsidian vault 경로를 파악한다:
   ```bash
   obsidian vaults verbose
   ```
   vault 이름에 해당하는 경로를 추출.

3. 오늘 Daily Note 파일을 직접 읽는다 (Read 도구 사용).

**Daily Note가 없는 경우**: "오늘 Daily Note가 없습니다. `/silee-planner:daily-plan`을 먼저 실행해주세요." 안내 후 중단.

### Step 3: 미완료 항목 수집

Daily Note에서 `## Tasks` 섹션을 찾는다.

| 케이스 | 처리 |
|--------|------|
| Tasks 섹션 없음 | "Daily Note에 Tasks 섹션이 없습니다. `/silee-planner:daily-plan`으로 계획을 먼저 수립해주세요." 안내 후 중단 |
| Tasks 섹션 있고 `- [ ]` 0건 | "오늘 모든 작업을 완료했습니다!" 출력 후 종료 |
| Tasks 섹션 있고 `- [ ]` 1건 이상 | 섹션별로 분류 (Projects / Areas / Inbox), 각 항목의 텍스트와 소속 섹션을 기록 |

### Step 4: 완료 대상 선택

| 조건 | 처리 |
|------|------|
| 인자 있음 | 미완료 목록에서 fuzzy match. 1건 매칭 시 확인 후 Step 5. 복수 매칭 시 후보 목록 제시하여 선택. 0건이면 "일치하는 항목 없음" 후 전체 목록 표시 |
| 인자 없음 | 번호 매긴 목록 출력 후 AskUserQuestion으로 선택. 복수 선택 지원 (예: "1,3") |

**인자 없음 시 목록 형식**:

```
미완료 작업:
  1. [Projects] 프로젝트: 작업 A
  2. [Areas] 영역: 작업 B
  3. [Inbox] 기타 작업 C
```

### Step 5: Daily Note 체크

선택된 항목을 `- [x]`로 변경한다. Edit 도구로 해당 줄만 수정.

동일 텍스트 항목이 복수인 경우, 섹션 헤더(`#### Projects` 등)를 포함한 넓은 컨텍스트를 `old_string`에 사용한다.

복수 항목 선택 시 모든 항목을 한 번에 변경한다.

### Step 6: Issue Box 연동

`in_progress_folder_path` 설정이 있을 때만 실행한다.

1. in-progress 이슈 파일을 수집한다:
   ```bash
   obsidian vault="<vault>" files folder="<in_progress_folder_path>"
   ```

2. 이슈 파일이 0건이면 이 Step을 스킵한다.

3. 각 이슈 파일의 제목이 완료한 체크리스트 항목 텍스트에 포함되는지 확인하여 매칭한다. 복수 매칭 시 후보 목록을 제시하여 AskUserQuestion으로 선택한다.

4. 매칭된 이슈가 있으면 AskUserQuestion으로 확인한다:
   "Issue Box '{제목}' ({파일경로}, 생성일: {created})도 resolved 처리할까요?"

5. 확인 시 resolved 처리한다:
   ```bash
   obsidian vault="<vault>" property:set name="status" value="resolved" path="<file_path>"
   obsidian vault="<vault>" property:set name="resolved_at" value="{YYYY-MM-DD}" path="<file_path>"
   ```

   `resolved_folder_path` 설정이 있으면 파일을 이동한다:
   ```bash
   obsidian vault="<vault>" move path="<file_path>" to="<resolved_folder_path>/{YYYY-MM-DD}/"
   ```

   `resolved_folder_path` 미설정 시 이동 없이 status만 변경한다.

6. 매칭 없으면 넘어간다.

### Step 7: 남은 작업 리마인드

갱신된 Daily Note에서 남은 `- [ ]` 항목을 다시 수집하여 출력한다.

**남은 항목이 있는 경우**:

```
---
✓ 완료: {체크한 항목들}
{Issue Box resolved 처리 시: Issue Box: '{제목}' → resolved}

남은 작업 (N건):
  1. [ ] 프로젝트: 작업 A
  2. [ ] 영역: 작업 B

다음 추천: "{가장 위에 있는 미완료 항목}"
---
```

**남은 항목이 0건인 경우**:

```
---
✓ 완료: {체크한 항목들}
{Issue Box resolved 처리 시: Issue Box: '{제목}' → resolved}

오늘 모든 작업을 완료했습니다!
---
```

### Step 8: 다음 작업 전환

남은 항목이 0건이면 이 Step을 스킵한다 (Step 7의 "모든 작업 완료" 메시지로 종료).

#### Step 8-1: 다음 작업 시작 여부 확인

AskUserQuestion으로 묻는다:

```
다음 작업을 시작할까요?
  {남은 항목 번호 목록 — Step 7에서 출력한 것과 동일}
  B. 백로그에서 선택 (/silee-planner:pick-task)
  N. 지금은 쉴게

번호, B, 또는 N:
```

| 응답 | 처리 |
|------|------|
| 번호 (예: "1", "2번") | Step 8-2로 진행 (해당 Daily Note 항목) |
| "B" 또는 "백로그" | "백로그에서 선택하려면 `/silee-planner:pick-task`를 실행해주세요." 안내 후 종료 |
| "N" 또는 "쉴게", "그만" | 즉시 종료 |

#### Step 8-2: 작업 인터뷰 (정보 수집)

선택된 Daily Note 항목에 대해 작업 시작 전 컨텍스트를 수집한다.

1. **Issue Box 매칭 확인**: 다음 작업 시작 시에는 아직 in-progress가 아닌 open 이슈도 연결 가능하므로 `in_progress_folder_path` + `inbox_folder_path` 두 경로를 탐색한다. 각 이슈 파일의 제목이 선택된 항목 텍스트에 포함되는지 확인한다.
   - 해당 설정값이 없으면 이 단계를 스킵
   - 매칭됨: 이슈 파일을 읽어 요약/제안 조치/관련 파일 정보를 수집
   - 매칭 없음: 스킵

2. **작업 인터뷰** — AskUserQuestion 1회로 아래 3가지를 함께 묻는다:

```
"{선택한 작업}" 작업을 시작합니다.

1. 이 작업의 목표/완료 기준은? (예: "API 응답 시간 200ms 이하로")
2. 필요한 정보나 참고할 자료가 있나요? (예: "Figma 링크", "PR #123", "없음")
3. 예상 소요 시간 또는 제약 사항은? (예: "30분", "점심 전까지", "없음")
```

사용자가 "없음", "패스", "스킵" 등으로 응답한 항목은 요약에서 생략한다.

3. **작업 시작 요약 출력**:

```
---
## 작업 시작: {항목 텍스트}

**목표**: {사용자 응답 1}
**참고 자료**: {사용자 응답 2 또는 "없음"}
**제약**: {사용자 응답 3 또는 "없음"}

{Issue Box 매칭 시:}
### Issue Box 컨텍스트
- **카테고리**: {category} | **우선순위**: {priority}
- **요약**: {이슈 요약 섹션}
- **해야 할 일**:
  - [ ] 조치 1
  - [ ] 조치 2
---
```

4. **Issue Box 상태 전환** (매칭된 이슈가 open 또는 blocked 상태인 경우):

```bash
obsidian vault="<vault>" property:set name="status" value="in-progress" path="<file_path>"
obsidian vault="<vault>" property:set name="started_at" value="{YYYY-MM-DD}" path="<file_path>"
```

`in_progress_folder_path` 설정이 있으면 파일을 이동한다:

```bash
obsidian vault="<vault>" move path="<file_path>" to="<in_progress_folder_path>/{YYYY-MM-DD}/"
```

`in_progress_folder_path` 미설정 시 이동하지 않고 status만 변경한다.
이미 in-progress 상태인 이슈는 상태 변경 없이 컨텍스트만 표시한다.

## Do / Don't

| Do | Don't |
|----|-------|
| 인자 있으면 확인 1회만 받고 즉시 처리 | 인자 있는데 전체 목록부터 출력 |
| Step 6 Issue Box 매칭은 in-progress 이슈만 대상 | Step 6에서 open/inbox 이슈까지 전수 탐색 |
| 리마인드는 목록 + 추천 1줄로 간결하게 | 남은 작업마다 상세 설명 출력 |
| Edit 도구로 해당 줄만 변경 | Daily Note 전체를 다시 작성 |
| 복수 항목 한 번에 완료 지원 | 항목마다 개별 확인 루프 |
| in_progress_folder_path 미설정 시 Step 6 스킵 | 설정 없는데 이슈 탐색 시도 |
| task-done은 resolved만 처리 (dismissed는 `/silee-planner:pick-task`에서) | task-done에서 폐기 처리 시도 |
| obsidian CLI 명령 실패 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
| 하루 마감 정리는 `/silee-planner:today-review` 사용 | task-done으로 하루 전체 마감 처리 |
| Edit 실패 시 파일을 다시 읽고 재시도 | Write로 전체 파일을 덮어쓰기 |
| 남은 항목 0건이면 Step 8 스킵 | 완료 메시지 후에도 강제로 다음 작업 질문 |
| 인터뷰 응답 "없음"/"패스" 시 해당 필드 생략 | 모든 필드를 반드시 입력하도록 강제 |
| Issue Box 매칭은 best-effort (없으면 스킵) | 매칭 실패 시 에러 처리 |
| 백로그 조회/선택 UI는 pick-task로 위임. 매칭된 이슈의 상태 전환은 task-done에서 직접 수행 | task-done 안에서 백로그 목록 조회/선택 UI를 중복 구현 |
