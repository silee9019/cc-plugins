---
name: planning
description: 업무 파악/정리/분류/발굴/선택. 수시 호출 가능. plan-today + pick-task의 역할을 흡수한 적극적 계획 행위. 사용자가 "계획", "planning", "오늘 뭐 할지", "업무 파악", "내일 준비"(+tomorrow), "뭐부터 할까"를 언급할 때 또는 review-day가 orchestrated 모드로 호출할 때 트리거.
user_invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# Planning

"오늘 계획 수립" 의례가 아니라 **지금과 다음 업무를 파악/정리/분류/발굴/선택**하는 활동. 하루 중 언제든 호출 가능하다. 단순 재배치(regroup)가 아니라 **새 일을 발굴**하는 적극적 계획 행위까지 포함한다.

아침 호출은 자연스럽게 "하루 시작 계획"처럼 동작하고, 오후 호출은 "진행 점검 + 재조정 + 새로 떠오른 것 발굴"이 된다. Daily Note Plan 섹션은 비어 있을 수도 있고 갱신될 수도 있다 — 강제하지 않는다.

## Step 0: 발화에서 모드 해석

| 발화 예시 | → 모드 |
|---|---|
| "오늘 뭐 할지 계획해줘" | 기본 (TARGET_DATE=오늘) |
| "내일 뭐 할지 정해볼까" | `tomorrow` (TARGET_DATE=내일) |
| "업무 파악해줘" (아침) | 기본 + 아침 모드 |
| "지금 상태 점검" (오후) | 기본 + 오후 모드 |
| review-day 내부 호출 | `tomorrow --orchestrated` |
| 다른 스킬이 호출 | `--orchestrated` |

두 모드는 조합 가능 (`tomorrow --orchestrated`).

## Tasks 포맷 (v2.8.0부터)

**todo 하나 = 파일 하나** 규칙. Daily Note Tasks는 인덱스, 상세는 개별 파일.

- todo 파일 경로: `<daily_notes_path>/{YYYY-MM-DD}/{slug}.md` (`01 Working/2026-04-21/cnd-1175-feature-split.md` 등)
- Daily Note Tasks 체크박스: `- [ ] [[<경로>/{slug}|표시 이름]]` wikilink 형태. 트랙별 `## [track:{id}] P: {제목}` 헤더 하위에 나열.
- todo 파일 frontmatter: `slug`, `track`, `category`, `priority`, `status`(open/in-progress/resolved/blocked/dismissed), `created`, `started_at`, `resolved_at`, `source`(이동 전 Inbox 경로), `jira`(선택), `plan`(선택).
- todo 파일 본문: 배경 / 실행 체크리스트(`- [ ]`) / 진행 로그(`- HH:MM ...`).
- 착수: `git mv <inbox>/{file.md} <daily_notes>/{YYYY-MM-DD}/{slug}.md` + `status: in-progress` + `started_at: {YYYY-MM-DD}`.
- 완료: `git mv <daily_notes>/{YYYY-MM-DD}/{slug}.md <daily_archive_path>/{YYYY}/{MM}/{YYYY-MM-DD}/{slug}.md` + `status: resolved` + `resolved_at: {YYYY-MM-DD}`.
- 이월: 미완료는 `git mv <daily_notes>/{YYYY-MM-DD}/{slug}.md <inbox_folder_path>/{TARGET_DATE}/{slug}.md` + `status: open` (started_at 로그 유지). 즉 이월 당일 Inbox 폴더에 떨어뜨린다 (Inbox는 기존 일별 폴더 관행 유지).

## 다섯 단계

### Step -1: 현재 시각 + 기준 날짜 결정

가장 먼저 Bash로 KST 현재 시각을 확인한다.

```bash
TZ=Asia/Seoul LC_TIME=ko_KR.UTF-8 date "+%Y-%m-%d %H:%M %Z (%A)"
```

출력 예: `2026-04-13 09:15 KST (일요일)`

**기준 날짜(`TARGET_DATE`) 분기**:

| 모드 | TARGET_DATE | "이전 일자" = PREV_DATE | 시간대 해석 |
|------|-------------|------------------------|--------------|
| (기본) | 오늘 | 어제 | 실제 현재 시각 기준 아침/오후 모드 |
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

1. **오늘 진행 중 todo 파일** (`<daily_notes_path>/{TARGET_DATE}/*.md`): 지금 착수되어 있는 todo들. frontmatter(`slug`/`track`/`priority`/`status`/`started_at`/`source`) 수집. `status: in-progress`만 대상.
2. **대상(TARGET_DATE) Daily Note Tasks**의 wikilink 체크박스: 파일이 이미 있으면 track 섹션별로 수집. wikilink 링크 + 체크 상태(`- [ ]` / `- [x]`) 파싱. 링크가 가리키는 todo 파일의 frontmatter와 교차 확인.
3. **Issue Box inbox** (`inbox_folder_path/{YYYY-MM-DD}/` 또는 legacy 월/날짜 폴더): 백로그. open + blocked 구분하여 수집. 우선순위·카테고리·생성일 메타 포함.
4. **이전(PREV_DATE) Daily Note 미완료**: 해당 날짜 경로를 생성해 읽기. `daily_notes_path` + `daily_note_format`로 1차 시도, 파일이 없으면 `daily_archive_path` + `daily_archive_format`가 설정된 경우 아카이브에서 2차 시도. Tasks 섹션의 wikilink 중 체크 안 된 것(`- [ ]`) 추출하여 대상 todo 파일 frontmatter의 `status`가 여전히 `in-progress`/`open`인 것만 이월 후보로. 단, **TARGET_DATE Daily Note에 이미 Tasks 섹션 내용이 있으면(소스 2번에서 수집 항목이 존재하면) 이 소스를 건너뛴다** — 이전 계획 세션에서 이월 결정이 완료된 것으로 간주. `tomorrow` 모드에서는 이 스킵 조건을 적용하지 않는다(항상 수집).
5. **예정된 미팅/마감**: 세션 시작 브리핑의 "향후 일정" 섹션 또는 사용자가 명시적으로 언급한 게 있는지 확인. 불확실하면 Step 1 끝에 **한 번만** "{TARGET_DATE}에 고정 일정이 있나요? (없으면 건너뛰기)" 질문. `--orchestrated` 모드에서는 이 질문을 생략하고 캘린더 스크립트 출력만 참고.
6. **MS Teams 인박스** (매 호출 자동): `teams-fetch` Skill을 호출하여 구독 채팅 + 등록 채널 신규 메시지를 세션 컨텍스트에 로드. 결과 파일에서 아래 항목을 추출:
   - 나에게 **@멘션**된 미응답 메시지
   - 1:1 DM의 미읽음 / 답변 대기
   - 내가 앞서 남긴 메시지에 대한 **답글 대기**(타인이 답변을 요구한 케이스)

   **제외 필터**:
   - `connect-chat` PR 봇 채널 (피드백 `feedback_skip-connect-chat.md`)
   - 본인이 이모지 반응을 남긴 메시지 — 묵시적 close 시그널 (피드백 `feedback_emoji-reaction-as-close.md`)
   - 이미 close 정렬된 것으로 표시된 과거 이슈 (피드백 `feedback_no-seohee-reminder.md`)
   - 단순 채널 알림/자동 발송 메시지

   `--orchestrated` 모드: 이 소스 스킵 (상위 review-day가 이미 수행).

수집 결과를 그룹별 요약 표로 정리해둔다 (아직 출력하지 않음).

### Step 2: 정리 (tidy)

수집된 항목들을 1차 필터링한다.

- **중복 제거**: 오늘 진행 중 todo와 Daily Note Tasks wikilink는 같은 파일을 가리키므로 파일 경로 기준 병합. 이전 Daily 미완료 후보도 동일 slug면 병합.
- **완료/취소 항목 솎기**: frontmatter `status`가 `resolved`/`dismissed`인 todo/inbox 제거. Tasks의 `- [x]` 체크이지만 파일 status가 아직 `in-progress`면 상태 불일치로 표시 (체크포인트 누락 후보).
- **상태 동기화 후보**: 오늘 폴더에 todo 파일은 있는데 Daily Note Tasks에 wikilink가 없으면 노트 측 갱신 후보로 표시 (실제 갱신은 Step 5에서).
- **blocked 이슈 리뷰**: `status: blocked`인 todo/inbox 목록을 별도 묶음으로. 사용자에게 개별 해제 질문 대신 목록만 제시, Step 3 분류에 같이 녹인다.
- **Teams 필터링 확정**: Step 1-6에서 추출한 멘션/DM/답글 대기 중 제외 필터 적용 결과만 남긴다.

### Step 3: 분류 (classify)

정리된 항목을 세 축으로 분류한다.

1. **PARA 분류**: Projects / Areas / Inbox
2. **시급도·중요도**: high / medium / low (기존 메타 우선, 없으면 맥락 기반 추정)
3. **오늘 해야 할 것 vs 나중에**: 마감·의존·사용자 집중 목표 기준

분류 결과를 아래 형식으로 **먼저 출력**한다. 사용자가 한눈에 파악할 수 있어야 한다.

```
## 지금 진행 중 (N건)
- {제목} — track:{id}, started {YYYY-MM-DD}, [[<path>/{slug}]]

## 오늘 Tasks (미완료 N건)
#### Projects
- [ ] [[...]] ...
#### Areas
- [ ] [[...]] ...
#### Inbox
- [ ] [[...]] ...

## 어제 이월 후보 (N건)
(Step 1에서 스킵된 경우 이 섹션 생략)
- [ ] [[...]] ...

## 백로그 (open N건, blocked M건)
상위 우선순위만 10건 표시
1. {제목} (category, priority, created)

## Teams 미확인 (N건)
(Step 1-6 결과. --orchestrated 모드는 생략)
- @멘션 {chat/channel} — {발신자}, {한 줄 요약}
- DM {발신자} — {한 줄 요약}
- 답글 대기 {chat/channel} — {원 메시지 요약}
```

### Step 4: 발굴 (discover)

**단순 재배치가 아닌 적극적 계획 행위의 핵심.** 백로그에 없던 새 일을 능동적으로 찾아낸다.

자극 소스:

- **세션 맥락**: 현재 대화 흐름에서 "이것도 해야 하지 않을까" 싶은 미해결 항목
- **Teams 미확인 그룹**: Step 3 마지막 블록에서 나온 멘션/DM/답글 대기 중 todo로 승격할 만한 건 (즉답 1분 이내로 끝나는 건 발굴 후보 아님)
- **사용자 목표와 현 활동의 빈틈**: Active Reminders나 `review-objectives` 결과가 시사하는 공백
- **의존성 체인**: in-progress todo가 성공하려면 선행되어야 할 전제 작업

발굴된 후보를 2-5개 정도로 제시한다. 억지로 채우지 않는다 — 없으면 "발굴 없음"도 정상이다.

```
## 발굴된 후보
- {제목} — {왜 필요한가 한 줄}
- ...
```

이 단계에서 사용자가 "2번은 캡처해둬" 라고 하면 즉시 `capture-task` skill을 호출해 inbox에 담는다 (Step 5 진입 전).

### Step 5: 선택 (pick)

지금 착수할 1-2개를 고른다. **선택하지 않는 호출도 허용** — 파악·정리·분류만 필요했다면 여기서 종료 가능.

**호출 모드 판별** (명시적 질문 없이 맥락 판단):

| 상황 | 기본 동작 |
|------|---------|
| `tomorrow` 인자 | "내일 준비" 고정 모드. TARGET_DATE Daily Note를 생성하거나 Plan/Tasks를 채운다. 선택(착수 이동)은 수행하지 않음 — 내일 아침 재호출 시 실행 |
| 아침 첫 호출 + 오늘 Daily Note 없음/비어 있음 | 제안 후 Daily Note Plan + Tasks 생성 |
| 오후/저녁 재호출 + 오늘 Daily Note 있음 + 기존 계획 존재 | 선택은 선택사항. Plan 섹션도 갱신 가능. Tasks에 새 wikilink append |
| 진행 중 todo 파일이 이미 있는데 추가 선택 요청 | 현재 진행 중인 것을 먼저 상기시킨 후 확인 |

**후보가 2개 이상 비등할 때** (런타임 인터뷰): "지금 어느 것에 먼저 집중하시겠어요?" 한 질문 → 답 → 착수 이동.

**착수 이동 처리** (v2.8.0, todo 파일 단위):

1. 선택된 Inbox 이슈 파일 경로 확인 (예: `00 Inbox/2026-04-18/2026-04-18-task-foo-bar.md`)
2. slug 결정: 파일명에서 날짜/카테고리 접두어 제거 + kebab-case 정규화 (예: `foo-bar`)
3. `git mv "<원본경로>" "<daily_notes_path>/{TARGET_DATE}/{slug}.md"` 실행. 디렉토리 없으면 `mkdir -p` 선행.
4. 이동된 파일 frontmatter 갱신:
   - `status: in-progress`
   - `started_at: {TARGET_DATE}`
   - `source: <원본경로>` (참조용 보존)
   - 없으면 `slug` / `track` 추가
5. Daily Note Tasks에 wikilink 체크박스 append. 트랙 헤더(`## [track:{id}] P: {제목}`)가 없으면 새로 생성. 체크박스 형식:
   ```
   - [ ] [[<daily_notes_path>/{TARGET_DATE}/{slug}|{표시 이름}]]
   ```
6. 작업 요약 출력: 제목 / 트랙 / 카테고리 / 우선순위 / 관련 파일 / 이동 경로.
7. 현재 작업 디렉토리와 frontmatter `repo` 또는 `source_project` 비교 후 안내.

**Inbox 외 신규 발굴 건을 바로 착수**하는 경우:
- 먼저 `capture-task`로 Inbox에 파일을 생성한 뒤 위 절차로 이동, 또는
- 사용자 확인 후 `<daily_notes_path>/{TARGET_DATE}/{slug}.md`에 곧바로 신규 파일 작성 (frontmatter `source: (direct)`).

**Daily Note 갱신** (아침 모드일 때):

- Plan 섹션: 선택된 1-3개를 상단에 (wikilink 아니어도 무방 — 문장 톤)
- Tasks 섹션: 착수된 todo 파일의 wikilink를 트랙 헤더 아래 체크박스로
- 파일 없으면 `setup`의 템플릿 구조로 새 Daily Note 생성
- 파일 있고 Tasks 비어 있으면 Tasks만 채우기
- 파일 있고 Tasks 내용 있으면: "이미 계획이 있습니다. 병합할까요, 덮어쓸까요?" 한 질문 (`--orchestrated`는 자동 병합)

**오후 모드일 때**: 아침 모드와 동일하게 Plan + Tasks 갱신 가능. 기존 Plan이 있으면 병합 우선. 필요시 Log 섹션에 "오후 재조정: ..." 한 줄 메모.

**이월 처리** (`tomorrow` 모드 또는 오늘 모드에서 PREV_DATE 미완료를 포함하는 경우):

- Step 1-4에서 수집한 미완료 wikilink 목록을 사용자에게 제시 (`--orchestrated`는 자동 전부 이월)
- 이월 결정된 todo 파일: `git mv <daily_notes_path>/{PREV_DATE}/{slug}.md <inbox_folder_path>/{TARGET_DATE}/{slug}.md`
- frontmatter 갱신: `status: open`, `started_at`은 유지 (재개 시점 구분용), `resolved_at`은 설정하지 않음
- TARGET_DATE Daily Note Tasks에 wikilink 다시 추가 (새 Inbox 경로로)
- 이전 Daily의 해당 wikilink는 그대로 둠 (깨진 링크가 되지만 히스토리 상 참조 가능)

**`tomorrow` 모드일 때** (review-day에서 호출되는 주 경로):

- 대상: TARGET_DATE(내일) Daily Note
- 파일 없으면 `setup`의 템플릿 구조로 새로 생성
- Plan 섹션이 비어 있으면 Step 3 분류 결과에서 high priority 1-3건 + 오늘 미완료 이월 후보를 상단에 채운다
- Plan 섹션이 이미 충분히 채워져 있으면(3건 이상) **덮어쓰지 않고 건너뛰기** + Tasks에만 부족분 append
- 착수 이동은 수행하지 않음 (내일 아침 재호출 시 사용자가 직접 pick). 단, **PREV_DATE 미완료 이월**은 수행 (Inbox로 되돌리기 + 내일 Daily Tasks wikilink)
- Log 섹션은 건드리지 않는다 (내일 타임라인이므로 비어 있어야 정상)

**`--orchestrated` 모드일 때**:

- 모호 결정은 "건너뛰기/기본값"으로 자동 처리 (사용자 질문 대신)
- "병합 vs 덮어쓰기" 질문은 자동 "병합"으로 처리 (안전 기본값)
- blocked 이슈 리뷰에서 한 건씩 확인하는 질문 생략
- 발굴(Step 4) 후보는 Plan에 추가하지 않고 보고에만 포함
- Step 1-6 Teams 소스 스킵

**연체/리마인드 플래그**:

- Key Result 1(KR1, 프로세스 준수율) 체크포인트 연체 감지 시 (Step 1 스캔 중 `{vault_path}/30 Imagoworks/10 Objectives/kr1-tracking.md`의 "다음 업데이트" 날짜가 과거면): Plan 상단에 `> ⚠ KR1 체크포인트 업데이트가 {N}일 연체되었습니다. /memento:review-objectives 실행 권장.` 경고
- Active Reminders와 충돌/일치하는 항목에는 `(리마인드: {슬로건})` 마크

### Step 6: 완료 출력

생성/갱신된 Daily Note 경로, 생성/이동된 todo 파일 경로, 지금 선택된 작업(있다면), 그리고 발굴된 후보 중 미처리로 남긴 것의 요약을 출력한다.

**`--orchestrated` 모드에서의 반환 포맷** (review-day 등 상위가 집계 가능하도록 축약):

```
[planning/orchestrated target={TARGET_DATE}]
  plan_section=<filled|skipped|merged>
  tasks_added=N carryover=M discoveries=K teams_items=T
  daily_note=<경로>
  todo_files=[<경로1>, <경로2>, ...]
```

일반 사용자 출력(장문)은 생략하고 위 블록만 반환한다.

## 원칙

- 다섯 단계를 순서대로 실행한다. 각 단계는 짧게.
- 발굴 단계에서 후보가 없으면 "발굴 없음"으로 정상 종료
- 선택 없이 종료하는 호출도 허용 — 파악·정리·분류만 필요할 때
- 오후 재호출은 기존 Plan 병합 우선
- 후보가 비등할 때만 한 질문으로 선택
- blocked 이슈는 분류 단계에서 별도 표시
- KR1 연체 감지 시 1줄 경고 (첫 출현은 `Key Result 1(KR1)`로 풀어쓰기)
- todo 파일은 파일 하나 = 일 하나 (Daily Note Tasks는 인덱스만)
- Teams 미확인은 제외 필터 통과한 것만 Step 3에 노출
- **내부 Task ID 축약 단독 사용 금지**: 사용자 대면 출력(대화, Plan 본문, 보고서)에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9`, 에픽 내부 순번 같은 내부 레이블을 **한 문서(또는 한 대화 응답) 내 첫 출현 시** 단독으로 쓰지 않는다. 풀어쓰거나 괄호 병기: `Task 2(실제 docx 변환)`, `Checkpoint 1(CP1)`, `Key Result 1(KR1)`. 이후 같은 문서 내 반복은 단독 허용. Jira 티켓 번호(`CND-1173`, `PR #1482`)와 산업 표준 약어(API/HTTP/JSON/TDD/CI/CD 등)는 면제. Daily Log의 본인 축약 메모는 예외이나 같은 맥락을 사용자에게 꺼낼 땐 풀어서 말한다. 상세: 저장소 CLAUDE.md "사용자 대면 출력 규칙".
