---
description: 작업 완료 처리. Daily Note 체크 + Issue Box 연동 + 남은 작업 리마인드 + 다음 작업 전환. 인자 있으면 fuzzy match로 빠른 완료.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: [완료한 작업 키워드]
---

# 작업 완료 (finish-task)

오늘 Daily Note에서 완료한 작업을 체크하고, Issue Box 연동 처리 후, 남은 작업을 리마인드한다.
하루 마감 정리는 `/silee-planner:review-today`를 사용한다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path`, `in_progress_folder_path`, `resolved_folder_path` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

### Step 1.5: Active Reminders 주입

`~/.claude/plugins/data/silee-planner-cc-plugins/active-reminders.md` 존재 여부 확인.

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | 조용히 건너뛰기 |
| 파일 있음 + `expires_at` >= 오늘 | 리마인드 목록을 **메모리에 로드**. Step 5 이후 완료 처리 시 해당 작업이 특정 reminder와 연결된 것이면 완료 로그에 `(리마인드 실행: {슬로건})` 필드 추가 (선택, 근거 있을 때만) |
| 파일 있음 + `expires_at` < 오늘 | 건너뛰기 |

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

**Daily Note가 없는 경우**: "오늘 Daily Note가 없습니다. `/silee-planner:plan-today`를 먼저 실행해주세요." 안내 후 중단.

### Step 3: 미완료 항목 수집

Daily Note에서 `## Tasks` 섹션을 찾는다.

| 케이스 | 처리 |
|--------|------|
| Tasks 섹션 없음 | "Daily Note에 Tasks 섹션이 없습니다. `/silee-planner:plan-today`로 계획을 먼저 수립해주세요." 안내 후 중단 |
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

### Step 8: 작업 커밋

현재 작업 디렉토리의 git 변경사항을 확인하고, 세션에서 수행한 작업을 기반으로 논리적 단위별로 나눠 커밋한다.

#### Step 8-0: Git 환경 확인

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
```

| 케이스 | 처리 |
|--------|------|
| Git 저장소가 아님 | 이 Step을 스킵하고 Step 9로 |
| rebase/merge/cherry-pick 진행 중 | "Git 작업이 진행 중입니다. 커밋을 건너뜁니다." 출력 후 Step 9로 |
| 정상 Git 저장소 | Step 8-1로 |

진행 중 상태 확인:
```bash
test -d .git/rebase-merge -o -d .git/rebase-apply -o -f .git/MERGE_HEAD -o -f .git/CHERRY_PICK_HEAD
```

#### Step 8-1: 변경사항 확인 및 커밋 여부 확인

```bash
git status --short
```

| 케이스 | 처리 |
|--------|------|
| 변경사항 없음 (clean) | "변경사항 없음 — 이미 커밋되었거나 코드 변경이 없는 작업입니다." 출력 후 Step 9로 |
| 변경사항 있음 | AskUserQuestion으로 커밋 진행 여부 확인 |

```
작업 완료 후 커밋할 변경사항이 있습니다:
  {git status --short 요약, 최대 15줄. 초과 시 "외 N건"}

커밋을 진행할까요? (Y/N)
```

| 응답 | 처리 |
|------|------|
| "Y" 또는 "ㅇ", "네" | Step 8-2로 |
| "N" 또는 "아니", "스킵" | "커밋을 건너뜁니다." 출력 후 Step 9로 |

#### Step 8-2: 논리적 커밋 단위 분류

`git diff`와 세션 대화 맥락을 함께 분석하여 변경된 파일들을 논리적 작업 단위별로 그룹핑한다.

**분류 방법**:
1. `git diff --stat HEAD`와 `git status --short`로 전체 변경 파일 목록 확보 (modified, new, deleted, renamed 포함)
2. 세션 대화에서 수행한 작업 흐름을 시간순으로 추적하여 각 파일의 변경 목적 파악
3. 하나의 목적/의도를 공유하는 파일 변경을 하나의 커밋 단위로 묶음
4. 세션에서 추적 불가한 변경(수동 편집, 포맷터, 외부 도구 등)은 "기타 변경" 그룹으로 분류

**분류 제약**:
- 파일 단위 분류만 수행한다. 한 파일 내 부분 분리(hunk 단위)는 하지 않는다.
- 한 파일에 여러 목적의 변경이 섞여 있으면, 주된 목적의 그룹에 포함하고 커밋 메시지에 부가 변경을 명시한다.

**민감 파일 필터**: 아래 패턴에 해당하는 파일은 커밋 대상에서 자동 제외하고 경고를 출력한다.
- `.env`, `.env.*`, `credentials.*`, `*.pem`, `*.key`, `id_rsa*`, `*.secret`
- 제외된 파일이 있으면: `"⚠ 제외됨: {파일명} (민감 파일)"`

**커밋 메시지 생성**: `git log --oneline -5`로 기존 커밋 스타일을 확인하고 동일한 형식을 사용한다.

**분류 결과를 AskUserQuestion으로 제안**:

```
커밋 계획 ({N}건):

  1. {커밋 메시지 1}
     {+N/-M lines, K files}
     - path/to/file1.ts (modified)
     - path/to/file2.ts (new file)

  2. {커밋 메시지 2}
     {+N/-M lines, K files}
     - path/to/file3.ts (deleted)

  {민감 파일 제외 시: ⚠ 제외됨: .env (민감 파일)}

Y: 이대로 커밋 / 수정 지시 입력 / N: 스킵
```

| 응답 | 처리 |
|------|------|
| "Y" 또는 "ㅇ", "네" | Step 8-3으로 |
| 수정 지시 (예: "1번 2번 합쳐줘", "메시지 수정: ...") | 지시에 따라 계획 수정 후 다시 제안. 수정 루프는 최대 2회, 이후 "수동 커밋을 권장합니다." 안내 후 Step 9로 |
| "N" 또는 "스킵", "아니" | "커밋을 건너뜁니다." 출력 후 Step 9로 |

#### Step 8-3: 커밋 실행

승인된 커밋 계획을 순서대로 실행한다:

```bash
# 커밋 단위 1
git add path/to/file1.ts path/to/file2.ts
git commit -m "{커밋 메시지 1}"

# 커밋 단위 2
git add path/to/file3.ts
git commit -m "{커밋 메시지 2}"
```

**실패 처리**:

| 실패 유형 | 처리 |
|-----------|------|
| pre-commit hook 실패 | 에러 내용 출력, 해당 커밋 및 남은 커밋 모두 중단. "hook 실패로 커밋이 중단되었습니다. 수동으로 해결 후 커밋해주세요." 안내 후 Step 9로 |
| 빈 커밋 (nothing to commit) | 해당 커밋 스킵, 다음 커밋으로 진행 |
| 기타 git 에러 | 에러 내용 출력, 전체 중단. "커밋 중 에러가 발생했습니다." 안내 후 Step 9로 |

모든 커밋 완료 후 결과를 간결하게 출력:

```
✓ 커밋 완료 ({N}건):
  {short hash 1} {메시지 1}
  {short hash 2} {메시지 2}
```

### Step 9: 다음 작업 전환

남은 항목이 0건이면 이 Step을 스킵한다 (Step 7의 "모든 작업 완료" 메시지로 종료).

#### Step 9-1: 다음 작업 시작 여부 확인

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
| 번호 (예: "1", "2번") | Step 9-2로 진행 (해당 Daily Note 항목) |
| "B" 또는 "백로그" | "백로그에서 선택하려면 `/silee-planner:pick-task`를 실행해주세요." 안내 후 종료 |
| "N" 또는 "쉴게", "그만" | 즉시 종료 |

#### Step 9-2: 작업 인터뷰 (정보 수집)

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
| finish-task는 resolved만 처리 (dismissed는 `/silee-planner:pick-task`에서) | finish-task에서 폐기 처리 시도 |
| obsidian CLI 명령 실패 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
| 하루 마감 정리는 `/silee-planner:review-today` 사용 | finish-task로 하루 전체 마감 처리 |
| Edit 실패 시 파일을 다시 읽고 재시도 | Write로 전체 파일을 덮어쓰기 |
| 남은 항목 0건이면 Step 9 스킵 | 완료 메시지 후에도 강제로 다음 작업 질문 |
| 인터뷰 응답 "없음"/"패스" 시 해당 필드 생략 | 모든 필드를 반드시 입력하도록 강제 |
| Issue Box 매칭은 best-effort (없으면 스킵) | 매칭 실패 시 에러 처리 |
| 백로그 조회/선택 UI는 pick-task로 위임. 매칭된 이슈의 상태 전환은 finish-task에서 직접 수행 | finish-task 안에서 백로그 목록 조회/선택 UI를 중복 구현 |
| Git 저장소가 아니거나 비정상 상태(rebase 등)면 커밋 Step 즉시 스킵 | non-git 환경에서 에러 발생시키기 |
| 커밋 진행 전 AskUserQuestion으로 선확인 | 자동으로 커밋 플로우 진입 |
| diff + 세션 대화를 함께 분석하여 논리적 단위 분류 | 대화 없이 파일명만으로 추측 |
| 파일 단위 분류만 수행 (한 파일 내 hunk 분리 안 함) | hunk 단위 분리 시도 |
| 민감 파일(.env, 키 파일 등) 자동 제외 + 경고 | 민감 파일 포함 커밋 |
| 커밋 계획에 변경 요약(+N/-M lines) 포함 | 파일명만 나열 |
| 기존 커밋 스타일(`git log`) 참조하여 메시지 생성 | 일관성 없는 메시지 |
| hook 실패 시 전체 중단 + 수동 해결 안내 | hook 실패 무시하고 계속 |
| 수정 루프는 최대 2회, 이후 수동 커밋 안내 | 무한 수정 루프 |
| `git status` clean이면 즉시 스킵 | 변경사항 없는데 빈 커밋 생성 |
| 추적 불가 변경은 "기타 변경" 그룹으로 분류 | 세션에 없는 변경 무시 |
