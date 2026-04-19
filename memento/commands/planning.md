---
description: 업무 파악/정리/분류/발굴/선택. 수시 호출 가능. plan-today + pick-task의 역할을 흡수한 적극적 계획 행위.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: "[tomorrow] [--orchestrated]"
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# Planning

"오늘 계획 수립" 의례가 아니라 **지금과 다음 업무를 파악/정리/분류/발굴/선택**하는 활동. 하루 중 언제든 호출 가능하다. 단순 재배치(regroup)가 아니라 **새 일을 발굴**하는 적극적 계획 행위까지 포함한다.

아침 호출은 자연스럽게 "하루 시작 계획"처럼 동작하고, 오후 호출은 "진행 점검 + 재조정 + 새로 떠오른 것 발굴"이 된다. Daily Note Plan 섹션은 비어 있을 수도 있고 갱신될 수도 있다 — 강제하지 않는다.

## 인자

- **(없음)**: 기본 모드. 기준 날짜 = 오늘. 대화형 질문 활성.
- **`tomorrow`**: 기준 날짜 = 내일(오늘 +1일, 영업일 보정 없음). Daily Note 경로·"어제 Daily Note"·리마인더 만료 판정 등 모든 날짜 파생값이 내일 기준으로 이동. review-day가 하루 마감 의례에서 호출하는 주 경로.
- **`--orchestrated`**: 상위 커맨드(review-day 등)가 오케스트레이션 호출 시 전달. 각 Step의 `AskUserQuestion`을 최소화하고, 모호 항목은 기본값으로 처리. 최종 출력은 내부 컨텍스트에 요약 블록만 반환.

두 인자는 조합 가능 (`tomorrow --orchestrated`). 인자 순서는 상관없다.

## 다섯 단계

### Step -1: 현재 시각 + 기준 날짜 결정

가장 먼저 Bash로 KST 현재 시각을 확인한다.

```bash
TZ=Asia/Seoul LC_TIME=ko_KR.UTF-8 date "+%Y-%m-%d %H:%M %Z (%A)"
```

출력 예: `2026-04-13 09:15 KST (일요일)`

**기준 날짜(`TARGET_DATE`) 분기**:

| 인자 | TARGET_DATE | "이전 일자" = PREV_DATE | 시간대 해석 |
|------|-------------|------------------------|--------------|
| (없음) | 오늘 | 어제 | 실제 현재 시각 기준 아침/오후 모드 |
| `tomorrow` | 내일 (오늘 +1일) | 오늘 | "저녁에 내일 준비" 고정 모드 — 아침/오후 분기 비활성 |

내일 계산 (Bash):

```bash
TZ=Asia/Seoul date -v+1d "+%Y-%m-%d"   # macOS
# 또는 GNU: date -d "tomorrow" "+%Y-%m-%d"
```

이 결과에서:
- **TARGET_DATE**: 대상 Daily Note 경로 계산 (Plan 섹션 작성 대상)
- **PREV_DATE**: "이전 일자 미완료" 수집 대상 (오늘 모드면 어제, 내일 모드면 오늘)
- **요일**: 출력 문맥에 반영
- **시간대**: 오늘 모드에서만 아침/오후 판별 기준. `tomorrow` 모드는 항상 "내일 준비" 톤으로 고정.

### Step 0: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root`, `daily_notes_path`, `daily_note_format`, `daily_archive_path`, `daily_archive_format`, `inbox_folder_path`, `in_progress_folder_path`, `display_name_ko`, `display_name_en`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**:

식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 2-3줄 블록으로 고정:

```
사용자 식별:
- 표시 이름: "<DISPLAY_KO>" / "<DISPLAY_EN>" (이니셜: <INITIALS>, 닉네임: <NICKNAME>)
- 아이디: <USER_ID> (aliases: <ALIASES>)
- 이메일: <EMAIL>
- Jira accountId: <ATLASSIAN_AID>

Daily Note Tasks/Issue Box에서 "나"/"내가"/"본인" 표현은 이 사용자를 가리킨다.
```

빈 값 필드는 괄호/줄 생략. 모든 식별 필드가 빈 값이면 블록 자체 생략.

### Step 0.5: Active Reminders 주입 (있을 때)

`<vault_path>/<memento_root>/user/active-reminders.md` 존재 여부 확인.

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | 조용히 건너뛰기 |
| 파일 있음 + `expires_at` >= 오늘 | 본문을 읽어 "이번 주 리마인드" 1-2줄 요약을 **컨텍스트 프리앰블**로 먼저 출력. 이후 분류/선택 시 참고 |
| 파일 있음 + `expires_at` < 오늘 | "⚠ Active reminders가 만료되었습니다. `/memento:review-week` 실행을 권장합니다." 1줄 경고 후 주입 생략 |

만료 판별: `date "+%Y-%m-%d"`과 frontmatter `expires_at` 문자열 비교.

### Step 1: 파악 (scan)

현재 진행 중·대기 중·예정된 일을 한 번에 수집한다. 아래 소스를 병렬로 읽는다.

1. **Issue Box in-progress** (`in_progress_folder_path`): 지금 착수되어 있는 이슈들. 각 파일의 제목·카테고리·우선순위·started_at 수집
2. **대상(TARGET_DATE) Daily Note Tasks**의 미완료 체크박스(`- [ ]`): 파일이 이미 있으면 섹션별(Projects/Areas/Inbox) 수집. 없으면 이 소스는 비움.
3. **Issue Box inbox** (`inbox_folder_path`): 백로그. open + blocked 구분하여 수집. 우선순위·카테고리·생성일 메타 포함
4. **이전(PREV_DATE) Daily Note 미완료**: 해당 날짜 경로를 생성해 읽기. `daily_notes_path` + `daily_note_format`로 1차 시도, 파일이 없으면 `daily_archive_path` + `daily_archive_format`가 설정된 경우 아카이브에서 2차 시도(이중 경로: 오늘은 Working, 지난은 Archives 구조). 단, **TARGET_DATE Daily Note에 이미 Tasks 섹션 내용이 있으면(소스 2번에서 미완료 항목이 수집되었거나, 완료 항목이라도 존재하면) 이 소스를 건너뛴다** — 이전 계획 세션에서 이월 결정이 완료된 것으로 간주. `tomorrow` 모드에서는 이 스킵 조건을 적용하지 않는다(항상 수집).
5. **예정된 미팅/마감**: 사용자가 명시적으로 언급한 게 있는지 세션 맥락 확인. 불확실하면 Step 1 끝에 **한 번만** "{TARGET_DATE}에 고정 일정이 있나요? (없으면 건너뛰기)" 질문. `--orchestrated` 모드에서는 이 질문을 생략하고 캘린더 스크립트 출력만 참고.

수집 결과를 그룹별 요약 표로 정리해둔다 (아직 출력하지 않음).

### Step 2: 정리 (tidy)

수집된 항목들을 1차 필터링한다.

- **중복 제거**: in-progress와 오늘 Tasks, 어제 미완료 사이의 동일 항목 병합. 어제 미완료가 스킵된 경우(Step 1-4번 조건) 이 단계도 해당 소스 없이 진행.
- **완료/취소 항목 솎기**: Tasks에서 이미 체크된 것, inbox에서 status가 resolved/dismissed인 것 제거
- **상태 동기화**: in-progress 파일인데 Daily Note Tasks에 없으면 노트 측 갱신 후보로 표시 (실제 갱신은 Step 4에서)
- **blocked 이슈 리뷰**: blocked 상태 이슈 목록 별도 제시. 한 건씩 "해제 가능한가요?" 질문 대신, 한 번에 목록만 보여주고 Step 3 분류 때 같이 처리

### Step 3: 분류 (classify)

정리된 항목을 세 축으로 분류한다.

1. **PARA 분류**: Projects / Areas / Inbox
2. **시급도·중요도**: high / medium / low (기존 메타 우선, 없으면 맥락 기반 추정)
3. **오늘 해야 할 것 vs 나중에**: 마감·의존·사용자 집중 목표 기준

분류 결과를 아래 형식으로 **먼저 출력**한다. 사용자가 한눈에 파악할 수 있어야 한다.

```
## 지금 진행 중 (N건)
- [in-progress] {제목} — {카테고리}, started {YYYY-MM-DD}

## 오늘 Tasks (미완료 N건)
#### Projects
- [ ] ...
#### Areas
- [ ] ...
#### Inbox
- [ ] ...

## 어제 이월 후보 (N건)
(Step 1에서 스킵된 경우 이 섹션 생략)
- [ ] ...

## 백로그 (open N건, blocked M건)
상위 우선순위만 10건 표시
1. {제목} (category, priority, created)
...
```

### Step 4: 발굴 (discover)

**단순 재배치가 아닌 적극적 계획 행위의 핵심.** 백로그에 없던 새 일을 능동적으로 찾아낸다.

자극 소스:

- **세션 맥락**: 현재 대화 흐름에서 "이것도 해야 하지 않을까" 싶은 미해결 항목
- **외부 입력**: 사용자가 이미 언급한 슬랙/이메일/회의록 내용
- **사용자 목표와 현 활동의 빈틈**: Active Reminders나 `review-objectives` 결과가 시사하는 공백
- **의존성 체인**: in-progress 이슈가 성공하려면 선행되어야 할 전제 작업

발굴된 후보를 2-5개 정도로 제시한다. 억지로 채우지 말 것 — 없으면 "발굴 없음"도 정상이다.

```
## 발굴된 후보
- {제목} — {왜 필요한가 한 줄}
- ...
```

이 단계에서 사용자가 "2번은 캡처해둬" 라고 하면 즉시 `/memento:capture-task`를 호출해 inbox에 담는다 (Step 5 진입 전).

### Step 5: 선택 (pick)

지금 착수할 1-2개를 고른다. **선택하지 않는 호출도 허용** — 파악·정리·분류만 필요했다면 여기서 종료 가능.

**호출 모드 판별** (명시적 질문 없이 맥락 판단):

| 상황 | 기본 동작 |
|------|---------|
| `tomorrow` 인자 | "내일 준비" 고정 모드. TARGET_DATE Daily Note를 생성하거나 Plan 섹션을 채운다. 선택(in-progress 이동)은 수행하지 않음 — 내일 아침 재호출 시 실행 |
| 아침 첫 호출 + 오늘 Daily Note 없음/비어 있음 | 제안 후 Daily Note Plan + Tasks 생성 (기존 plan-today 역할) |
| 오후/저녁 재호출 + 오늘 Daily Note 있음 + 기존 계획 존재 | 선택은 선택사항. Plan 섹션도 갱신 가능 (아침과 동일). Tasks에 새 항목 append |
| in-progress가 이미 있는데 추가 선택 요청 | 현재 진행 중인 것을 먼저 상기시킨 후 확인 |

**후보가 2개 이상 비등할 때** (런타임 인터뷰): "지금 어느 것에 먼저 집중하시겠어요?" 한 질문 → 답 → in-progress 이동.

**in-progress 이동 처리** (pick-task에서 흡수):

1. 선택된 이슈 파일의 status를 in-progress로 변경, started_at 기록
2. 파일을 `in_progress_folder_path/{YYYY-MM-DD}/`로 이동 (설정 없으면 status만)
3. 작업 요약 출력 (제목/카테고리/우선순위/요약/제안 조치/관련 파일/컨텍스트)
4. 현재 작업 디렉토리와 source_project 비교 후 안내

**Daily Note 갱신** (아침 모드일 때):

- Plan 섹션: 선택된 1-3개를 상단에
- Tasks 섹션: Projects/Areas/Inbox 분류대로 체크리스트
- 파일 없으면 `/memento:setup`의 템플릿 구조로 새 Daily Note 생성
- 파일 있고 Tasks 비어 있으면 Tasks만 채우기
- 파일 있고 Tasks 내용 있으면: "이미 계획이 있습니다. 병합할까요, 덮어쓸까요?" 한 질문

**오후 모드일 때**: 아침 모드와 동일하게 Plan + Tasks 갱신 가능. 기존 Plan이 있으면 병합 우선. 필요시 Log 섹션에 "오후 재조정: ..." 한 줄 메모.

**`tomorrow` 모드일 때** (review-day에서 호출되는 주 경로):

- 대상: TARGET_DATE(내일) Daily Note
- 파일 없으면 `/memento:setup`의 템플릿 구조로 새로 생성
- Plan 섹션이 비어 있으면 Step 3 분류 결과에서 high priority 1-3건 + 오늘 미완료 이월 후보를 상단에 채운다
- Plan 섹션이 이미 충분히 채워져 있으면(3건 이상) **덮어쓰지 않고 건너뛰기** + Tasks에만 부족분 append
- in-progress 이동은 수행하지 않음 (내일 아침 재호출 시 사용자가 직접 pick)
- Log 섹션은 건드리지 않는다 (내일 타임라인이므로 비어 있어야 정상)

**`--orchestrated` 모드일 때**:

- 모호 결정은 "건너뛰기/기본값"으로 자동 처리 (사용자 질문 대신)
- "병합 vs 덮어쓰기" 질문은 자동 "병합"으로 처리 (안전 기본값)
- blocked 이슈 리뷰에서 한 건씩 확인하는 질문 생략
- 발굴(Step 4) 후보는 Plan에 추가하지 않고 보고에만 포함

**연체/리마인드 플래그**:

- KR1 체크포인트 연체 감지 시 (Step 1 스캔 중 `{vault_path}/30 Imagoworks/10 Objectives/kr1-tracking.md`의 "다음 업데이트" 날짜가 과거면): Plan 상단에 `> ⚠ KR1 체크포인트 업데이트가 {N}일 연체되었습니다. /memento:review-objectives 실행 권장.` 경고
- Active Reminders와 충돌/일치하는 항목에는 `(리마인드: {슬로건})` 마크

### Step 6: 완료 출력

생성/갱신된 Daily Note 경로와 지금 선택된 작업(있다면), 그리고 발굴된 후보 중 미처리로 남긴 것의 요약을 출력한다.

**`--orchestrated` 모드에서의 반환 포맷** (review-day 등 상위가 집계 가능하도록 축약):

```
[planning/orchestrated target={TARGET_DATE}]
  plan_section=<filled|skipped|merged>
  tasks_added=N carryover=M discoveries=K
  daily_note=<경로>
```

일반 사용자 출력(장문)은 생략하고 위 블록만 반환한다.

## Do / Don't

| Do | Don't |
|----|-------|
| 다섯 단계를 순서대로, 단 각 단계는 짧게 | 파악만 하고 정리·분류 생략 |
| 발굴 단계에서 억지로 채우지 않기 | "발굴 없음"이 부끄럽다고 억지 후보 만들기 |
| 선택 없이 종료하는 호출도 허용 | 항상 무언가를 in-progress로 이동시켜야 한다는 강박 |
| 오후 모드에서 기존 Plan 있으면 병합 우선 | 재호출마다 Plan을 새로 작성 |
| 후보가 비등할 때만 한 질문으로 선택 묻기 | 매 호출마다 여러 질문으로 흐름 끊기 |
| blocked 이슈는 분류 단계에서 별도 표시 | blocked를 open과 섞어 혼동 |
| KR1 연체 감지 시 1줄 경고만 | 연체 안내로 본 단계 장황화 |
