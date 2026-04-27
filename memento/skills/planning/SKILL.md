---
name: planning
description: 업무 파악/정리/분류/발굴/선택. 수시 호출 가능. plan-today + pick-task의 역할을 흡수한 적극적 계획 행위.
when_to_use: 사용자가 "계획", "planning", "오늘 뭐 할지", "업무 파악", "내일 준비"(+tomorrow), "뭐부터 할까"를 언급할 때 또는 review-day가 orchestrated 모드로 호출할 때 트리거.
user-invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# Planning

"오늘 계획 수립" 의례가 아니라 **지금과 다음 업무를 파악/정리/분류/발굴/선택**하는 활동. 하루 중 언제든 호출 가능하다. 단순 재배치(regroup)가 아니라 **새 일을 발굴**하는 적극적 계획 행위까지 포함한다.

**두 페이즈** (시간대와 무관):
- **첫 호출 (first-of-day)**: 해당 날짜(TARGET_DATE) Focus Today 파일에 `# 오늘 꼭(Focus)` 섹션이 비어 있거나 파일이 없음 → "하루 시작 계획"처럼 동작. 이월/신규를 단일 섹션에 채운다.
- **반복 호출 (subsequent)**: `# 오늘 꼭(Focus)`에 이미 내용 있음 → "진행 점검 + 재조정 + 새로 떠오른 것 발굴". 기존 내용 병합 우선, 항목 순서 재배치 허용.

Focus Today는 비어 있을 수도 있고 갱신될 수도 있다 — 강제하지 않는다.

## Focus Today 구조 (v2.16.2+)

**파일명**: `{daily_notes_path}/{YYYY-MM-DD}-focus.md` (config `daily_note_format` 기본값 `{YYYY}-{MM}-{DD}-focus.md`).

**섹션 하나만 사용한다**: `# 오늘 꼭(Focus)`

- 마감/연체/고정일정/중요 todo + 오늘 집중할 todo를 한 블록에 우선순위 순서로 나열.
- 8건 cap. 넘치면 Inbox/`WORKING.md`로 돌려보낸다.
- **모든 라인은 체크박스(`- [ ]` 또는 `- [x]`)** — 정보성 라인도 예외 없음. 이미 처리/확정된 사실은 `- [x]`.
- 아이콘은 체크박스 뒤 prefix로 우선순위 시각화:
  - `- [ ] ⚠` 연체/마감/플래그 (최상단)
  - `- [ ] ⏰` 고정일정
  - `- [ ] 🌙` 저녁 한정
  - `- [ ] 🏠` 퇴근 후 집에서
  - `- [ ] [[wikilink|...]]` 또는 `- [ ] {일반 텍스트}` 일반 todo (wikilink 권장)

**이전 버전 호환 (자연 마이그레이션)**: 기존 파일에 `# 오늘 꼭` + `# 오늘 집중` 두 섹션만 있으면, 메모리상 합쳐 처리하고 갱신 시 단일 섹션 `# 오늘 꼭(Focus)`으로 재작성한다. `Tasks` / `Log` / `Review` 3섹션 구조(v2.14.0 이하)도 동일.

용도별 분산은 그대로:
- 시간순 작업 로그 → `memory/{YYYY-MM-DD}-log.md` (memento-core)
- 하루 마감 회고 → `review-day` 스킬이 별도 파일로 저장
- 컨텍스트 재인식 → handoff 메모

Focus Today는 "컨텍스트 전환 직전 1초에 보는 랜딩 페이지" 용도에 집중한다.

## 발화 분기 / 모드 해석

| 발화 예시 | → 모드 |
|---|---|
| "오늘 뭐 할지 계획해줘" | 기본 (TARGET_DATE=오늘) |
| "내일 뭐 할지 정해볼까" | `tomorrow` (TARGET_DATE=내일) |
| "업무 파악해줘" / "지금 상태 점검" | 기본 (페이즈는 Focus Today 상태로 자동 판별) |
| review-day 내부 호출 | `tomorrow --orchestrated` |
| 다른 스킬이 호출 | `--orchestrated` |

두 모드는 조합 가능 (`tomorrow --orchestrated`). 페이즈(첫 호출 / 반복 호출)는 시간대가 아닌 **해당 날짜 Focus Today `# 오늘 꼭(Focus)` 섹션 상태**로 판별한다.

## Todo 파일 규칙

**todo 하나 = 파일 하나** 원칙 유지. Focus Today는 인덱스, 상세는 개별 파일.

- todo 파일 경로: `<daily_notes_path>/{YYYY-MM-DD}/{slug}.md`
- Focus Today 체크박스: `- [ ] [[<경로>/{slug}|표시 이름]]` wikilink 형태. `# 오늘 꼭(Focus)` 단일 섹션 하위에 우선순위 순서로 나열 (⚠/⏰/🌙/🏠 플래그 라인과 혼합).
- todo 파일 frontmatter: `slug`, `category`, `priority`, `status`(open/in-progress/resolved/blocked/dismissed), `created`, `started_at`, `resolved_at`, `source`(이동 전 Inbox 경로), `jira`(선택), `plan`(선택).
- todo 파일 본문: 배경 / 실행 체크리스트(`- [ ]`) / 진행 로그(`- HH:MM ...`).
- 착수: `git mv <inbox>/{file.md} <daily_notes>/{YYYY-MM-DD}/{slug}.md` + `status: in-progress` + `started_at: {YYYY-MM-DD}`.
- 완료: `git mv <daily_notes>/{YYYY-MM-DD}/{slug}.md <daily_archive_path>/{YYYY}/{MM}/{YYYY-MM-DD}/{slug}.md` + `status: resolved` + `resolved_at: {YYYY-MM-DD}`.
- 이월: 미완료는 `git mv <daily_notes>/{YYYY-MM-DD}/{slug}.md <inbox_folder_path>/{TARGET_DATE}/{slug}.md` + `status: open` (started_at 로그 유지). 이월 당일 Inbox 폴더에 떨어뜨린다.

## 워크플로우

### Step 1: 현재 시각 + 기준 날짜 결정

가장 먼저 Bash로 KST 현재 시각을 확인한다.

```bash
TZ=Asia/Seoul LC_TIME=ko_KR.UTF-8 date "+%Y-%m-%d %H:%M %Z (%A)"
```

**기준 날짜(`TARGET_DATE`) 분기**:

| 모드 | TARGET_DATE | PREV_DATE | 페이즈 판별 |
|------|-------------|-----------|--------------|
| (기본) | 오늘 | 어제 | TARGET_DATE Focus Today `# 오늘 꼭(Focus)` 내용 유무로 첫/반복 판별 (legacy: `# 오늘 꼭` + `# 오늘 집중` 합산) |
| `tomorrow` | 내일 | 오늘 | 항상 "내일 준비" 고정 — 페이즈 분기 비활성 |

내일 계산: `TZ=Asia/Seoul date -v+1d "+%Y-%m-%d"` (macOS) / `date -d "tomorrow" "+%Y-%m-%d"` (GNU).

- **TARGET_DATE**: 대상 Focus Today 경로 계산
- **PREV_DATE**: "이전 일자 미완료" 수집 대상
- **페이즈**: TARGET_DATE Focus Today `# 오늘 꼭(Focus)` 섹션에 항목(체크박스 또는 플래그 라인)이 존재하면 "반복 호출", 그렇지 않으면 "첫 호출". legacy 두 섹션(`# 오늘 꼭` + `# 오늘 집중`)도 합산하여 판단. `tomorrow` 모드는 페이즈 분기 비활성.

### Step 2: 설정 로드

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

Focus Today에서 "나"/"내가"/"본인" 표현은 이 사용자를 가리킨다.
```

빈 값 필드는 괄호/줄 생략. 모든 식별 필드가 빈 값이면 블록 자체 생략.

### Step 3: Active Reminders 주입 (있을 때)

`<vault_path>/<memento_root>/user/active-reminders.md` 존재 여부 확인.

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | 조용히 건너뛰기 |
| 파일 있음 + `expires_at` >= 오늘 | 본문을 읽어 "이번 주 리마인드" 1-2줄 요약을 컨텍스트 프리앰블로 먼저 출력 |
| 파일 있음 + `expires_at` < 오늘 | "⚠ Active reminders가 만료되었습니다. `/memento:review-week` 실행을 권장합니다." 1줄 경고 후 주입 생략 |

### Step 4: 파악 (scan)

현재 진행 중·대기 중·예정된 일을 한 번에 수집한다. 아래 소스를 병렬로 읽는다.

1. **오늘 진행 중 todo 파일** (`<daily_notes_path>/{TARGET_DATE}/*.md`): `status: in-progress`만 대상.
2. **대상(TARGET_DATE) Focus Today `# 오늘 꼭(Focus)` 섹션**: 파일이 있으면 체크박스 순서대로 수집. 모든 라인은 체크박스(`- [ ]` / `- [x]`); 체크박스 뒤 아이콘 prefix(`⚠`/`⏰`/`🌙`/`🏠`)와 wikilink/일반 텍스트를 파싱. wikilink가 있으면 가리키는 todo 파일 frontmatter와 교차 확인, 없으면 정보성 라인으로 분류. legacy 평면 불릿(`- ⚠ ...`) 또는 legacy 두 섹션(`# 오늘 꼭` + `# 오늘 집중`)도 받아들이되 갱신 시 모두 체크박스로 재작성.
3. **Issue Box inbox** (`inbox_folder_path/{YYYY-MM-DD}/` 또는 legacy 월/날짜 폴더): 백로그. open + blocked 구분 수집.
4. **이전(PREV_DATE) Focus Today 미완료**: `daily_notes_path` + `daily_note_format`로 1차 시도, 파일이 없으면 `daily_archive_path` + `daily_archive_format`로 2차 시도. `# 오늘 꼭(Focus)` 섹션의 체크 안 된 wikilink(`- [ ]`)를 추출하여 대상 todo 파일 `status`가 `in-progress`/`open`인 것만 이월 후보로. **TARGET_DATE Focus Today `# 오늘 꼭(Focus)` 섹션에 이미 내용이 있으면 이 소스를 건너뛴다** — 이전 계획 세션에서 이월 결정이 완료된 것으로 간주. `tomorrow` 모드에서는 이 스킵 조건을 적용하지 않는다.
5. **예정된 미팅/마감**: 세션 시작 브리핑 "향후 일정" 섹션 또는 사용자가 명시적으로 언급한 게 있는지 확인. 불확실하면 Step 4 끝에 한 번만 "{TARGET_DATE}에 고정 일정이 있나요? (없으면 건너뛰기)" 질문. `--orchestrated` 모드에서는 이 질문을 생략.
6. **외부 인박스 (Teams + Outlook mail + Jira)** — **당일 자동 스캔 성공 marker가 없을 때**.

   **Marker 경로**: `~/.claude/plugins/data/memento-cc-plugins/state/external-inbox-{TARGET_DATE}.flag` (없으면 디렉토리째 미존재).

   **트리거 조건** (AND):
   - `tomorrow` 모드가 아님
   - `--orchestrated` 모드가 아님
   - 다음 중 **하나라도** 참:
     - TARGET_DATE Focus Today `# 오늘 꼭(Focus)` 섹션이 비어 있음 (당일 최초 호출)
     - 위 marker 파일이 존재하지 않음 (당일 자동 스캔 성공 기록 없음)

   조건 불충족이어도 사용자가 명시적으로 재확인을 요청("팀즈 다시 확인해줘", "메일 다시 봐줘", "지라 새로 가져와" 등)하면 해당 소스만 재실행한다(marker는 갱신하지 않음).

   세 소스를 병렬 수집:

   **Teams** — `m365-fetch:teams-fetch` Skill 호출. 추출: @멘션 미응답, 1:1 DM 미읽음/답변 대기, 타인이 답변 요구한 답글 대기. 제외 필터:
   - `connect-chat` PR 봇 채널
   - 본인이 이모지 반응을 남긴 메시지 (묵시적 close 시그널)
   - 이미 close 정렬된 것으로 표시된 과거 이슈
   - 단순 채널 알림/자동 발송

   **Mail** — `m365-fetch:mail-inbox` Skill 호출(`--since 1d`). 추출: 액션 요청 / 마감 알림 / 본인 이름 멘션. 제외 필터:
   - Jira/Confluence digest 발신자(`jira@imagoworks.atlassian.net`, `confluence@imagoworks.atlassian.net`)
   - 프로모션/브로드캐스트
   - 단, 제목에 "기한이 다가오는"/"due" 플래그 있는 Jira 알림은 **마감 플래그로 남김** (`# 오늘 꼭(Focus)` 후보)

   **Jira** — MCP 툴 `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` 두 번 호출:
   - 내 미완료: `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC` (`maxResults: 30`, `responseContentFormat: "markdown"`)
   - 최근 활동: `(reporter = currentUser() OR assignee = currentUser() OR watcher = currentUser()) AND updated >= -1d ORDER BY updated DESC` (`maxResults: 30`)

   `cloudId`는 세션 캐시 또는 `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` 1회 호출로 확보. 응답이 토큰 한도를 초과하면 임시 파일을 `jq -r`로 파싱해 `key/status/summary/updated/assignee` 요약 라인만 추출한다.

   Jira 항목 분류:
   - `duedate <= TARGET_DATE` & 미완료 & 내 assignee → **`# 오늘 꼭(Focus)` 후보 (⚠ 마감 플래그)**
   - 최근 24h 내 나에게 할당됨 또는 상태 변경 → 알림
   - 그 외 내 미완료 → "열린 이슈" 요약 (상위 5개 + "N건 추가")

   **성공 marker 기록**: 세 소스(Teams/Mail/Jira) 호출이 모두 예외 없이 응답을 반환하면 즉시 marker를 touch:

   ```bash
   mkdir -p ~/.claude/plugins/data/memento-cc-plugins/state
   touch ~/.claude/plugins/data/memento-cc-plugins/state/external-inbox-{TARGET_DATE}.flag
   ```

   하나라도 예외 발생 시(예: m365-fetch CLI `ERR_MODULE_NOT_FOUND`, Jira MCP 401) marker를 남기지 않는다 → 다음 planning 호출에서 자동 재시도.

   수집 결과는 Step 6 "외부 인박스" 블록으로 전달. 트리거 조건 불충족이면 이 소스 전체를 건너뛴다.

수집 결과를 그룹별 요약으로 정리해둔다 (아직 출력하지 않음).

### Step 5: 정리 (tidy)

수집된 항목들을 1차 필터링한다.

- **중복 제거**: 오늘 진행 중 todo와 Focus Today wikilink는 같은 파일이므로 병합.
- **완료/취소 항목 솎기**: frontmatter `status`가 `resolved`/`dismissed`인 todo/inbox 제거. `- [x]`이지만 파일 status가 `in-progress`면 상태 불일치 표시 (체크포인트 누락 후보).
- **상태 동기화 후보**: 오늘 폴더에 todo 파일은 있는데 Focus Today `# 오늘 꼭(Focus)`에 wikilink가 없으면 갱신 후보로 표시.
- **blocked 이슈 리뷰**: `status: blocked` 목록을 별도 묶음으로.
- **외부 인박스 필터링 확정**: Step 4 외부 인박스 결과에 각 소스별 제외 필터 적용. 소스 스킵되었으면 no-op.

### Step 6: 분류 (classify)

정리된 항목을 세 축으로 분류한다 (내부 분류 — 출력은 Focus + 외부 인박스 두 블록만):

1. **Focus 후보 vs 백로그**: 마감·고정일정·연체 플래그가 있거나 오늘 착수할 todo는 Focus 후보로. 나머지는 백로그 유지(출력 X).
2. **시급도·중요도**: high / medium / low (기존 메타 우선, 없으면 맥락 기반 추정). Focus 내부 우선순위 결정에 사용.
3. **PARA 분류**: Projects / Areas / Inbox (백로그 내부 정렬용 — 사용자 요청 시에만 노출).

분류 결과를 아래 형식으로 **먼저 출력**한다 (Focus + 외부 인박스 두 블록만):

```
## 오늘 꼭(Focus) (N건)
- [ ] ⚠ {연체/마감 플래그}
- [ ] ⏰ {고정일정}
- [ ] 🌙 {저녁 한정}
- [ ] 🏠 {퇴근 후}
- [ ] [[...]] {wikilink todo}

## 외부 인박스 (자동 스캔 시에만)
(트리거 조건 불충족이면 섹션 전체 생략)

### Teams
- @멘션 {chat/channel} — {발신자}, {한 줄 요약}
- DM {발신자} — {한 줄 요약}

### Mail
- ⏰ {제목} — {발신자} (마감/액션 플래그)

### Jira
- ⚠ {KEY} [{상태}] {요약} — 오늘/내일 마감
- {KEY} [{상태}] {요약} — 최근 24h 업데이트
```

**출력에서 생략하는 블록** (내부 분류는 유지):
- 어제 이월 후보 — Focus에 합산만, 별도 노출 X
- 백로그 — 사용자 명시 요청("백로그 보여줘", `/memento:inbox-sweep`) 시에만
- 발굴 후보 — Step 7에서 Focus로 직접 제안하거나 사용자 후속 질문 시 답변

### Step 7: 발굴 (discover)

백로그에 없던 새 일을 능동적으로 찾아낸다. 자극 소스:

- **세션 맥락**: 현재 대화 흐름에서 "이것도 해야 하지 않을까" 싶은 미해결 항목
- **외부 인박스**: Step 6 결과에서 todo로 승격할 만한 건. 특히 Jira 오늘 마감 플래그는 무조건 Focus 최상단 후보로 올린다.
- **사용자 목표와 현 활동의 빈틈**: Active Reminders나 `review-objectives` 결과가 시사하는 공백
- **의존성 체인**: in-progress todo가 성공하려면 선행되어야 할 전제 작업

**출력 정책**: 발굴 후보가 명백히 오늘 Focus에 들어갈 만하면 Step 6 Focus 블록에 직접 제안 항목으로 추가(`(발굴)` 마크). 그 외 후보는 내부 메모만 — 별도 "발굴 후보" 출력 블록은 없다. 사용자가 "발굴 후보 더 있어?" 등 명시 요청 시에만 추가 노출.

사용자가 "2번은 캡처해둬" 라고 하면 즉시 `capture-task` skill을 호출해 inbox에 담는다 (Step 8 진입 전).

### Step 8: 선택 (pick)

지금 착수할 1-2개를 고른다. 선택하지 않는 호출도 허용.

**호출 모드 판별**:

| 상황 | 기본 동작 |
|------|---------|
| `tomorrow` 인자 | "내일 준비" 고정. TARGET_DATE Focus Today 생성 또는 단일 섹션 채우기. 착수 이동은 수행하지 않음 |
| **첫 호출** (오늘 Focus Today `# 오늘 꼭(Focus)` 비어 있음) | 제안 후 단일 섹션 생성 |
| **반복 호출** | 기존 섹션 병합 우선, 항목 순서 재배치 허용 |
| 진행 중 todo 파일이 이미 있는데 추가 선택 요청 | 현재 진행 중인 것을 먼저 상기시킨 후 확인 |

**후보가 2개 이상 비등할 때**: "지금 어느 것에 먼저 집중하시겠어요?" 한 질문 → 답 → 착수 이동.

**착수 이동 처리** (todo 파일 단위):

1. 선택된 Inbox 이슈 파일 경로 확인
2. slug 결정: 파일명에서 날짜/카테고리 접두어 제거 + kebab-case 정규화
3. `git mv "<원본>" "<daily_notes_path>/{TARGET_DATE}/{slug}.md"`. 디렉토리 없으면 `mkdir -p` 선행.
4. 이동된 파일 frontmatter 갱신: `status: in-progress`, `started_at: {TARGET_DATE}`, `source: <원본>`
5. Focus Today `# 오늘 꼭(Focus)` 섹션에 우선순위 위치 고려해 wikilink 체크박스 append (긴급/마감 항목은 ⚠ 라인 다음, 일반 todo는 섹션 말미):
   ```
   - [ ] [[<daily_notes_path>/{TARGET_DATE}/{slug}|{표시 이름}]]
   ```
6. 작업 요약 출력: 제목 / 카테고리 / 우선순위 / 관련 파일 / 이동 경로

**Inbox 외 신규 발굴 건을 바로 착수**: `capture-task`로 Inbox에 먼저 생성 후 이동, 또는 사용자 확인 후 `{daily_notes_path}/{TARGET_DATE}/{slug}.md`에 곧바로 작성 (frontmatter `source: (direct)`).

**Focus Today 갱신** (첫 호출일 때):

파일 템플릿:

```markdown
---
tags:
  - focus
date: {TARGET_DATE}
---
# 오늘 꼭(Focus)
> 오늘 놓치면 안 되는 것 + 집중할 todo. 우선순위 순서. 8건 cap.

- [ ] ⚠ {연체/마감 플래그}
- [ ] ⏰ {고정일정 요약}
- [ ] 🌙 {저녁 한정 항목}
- [ ] 🏠 {퇴근 후 집에서}
- [ ] [[<경로>/{slug}|{표시 이름}]]
- [ ] {반드시 오늘 해야 하는 todo}
```

- 파일 없으면 위 템플릿으로 새로 생성
- 단일 섹션이 비어 있으면 채우기
- 단일 섹션에 이미 내용 있으면: "이미 내용이 있습니다. 병합할까요, 덮어쓸까요?" 한 질문 (`--orchestrated`는 자동 병합)
- legacy 두 섹션(`# 오늘 꼭` + `# 오늘 집중`) 파일을 갱신할 때는 두 섹션을 합쳐 단일 `# 오늘 꼭(Focus)`으로 재작성 (자연 마이그레이션)

**반복 호출일 때**: 첫 호출과 동일 원칙으로 갱신. 기존 섹션 병합 우선 + 항목 순서 재배치 허용.

**이월 처리** (`tomorrow` 모드 또는 오늘 모드에서 PREV_DATE 미완료를 포함하는 경우):

- Step 4–7에서 수집한 미완료 wikilink 목록을 사용자에게 제시 (`--orchestrated`는 자동 전부 이월)
- 이월 결정된 todo 파일: `git mv <daily_notes_path>/{PREV_DATE}/{slug}.md <inbox_folder_path>/{TARGET_DATE}/{slug}.md`
- frontmatter 갱신: `status: open`, `started_at`은 유지, `resolved_at`은 설정하지 않음
- TARGET_DATE Focus Today `# 오늘 꼭(Focus)`에 wikilink 다시 추가 (새 Inbox 경로로)

**`tomorrow` 모드일 때** (review-day에서 호출되는 주 경로):

- 대상: TARGET_DATE(내일) Focus Today
- 파일 없으면 템플릿으로 새로 생성
- `# 오늘 꼭(Focus)`이 비어 있으면 Step 6 분류에서 우선순위 상위 1-3건 + 오늘 미완료 이월 후보를 채운다
- 이미 3건 이상 채워져 있으면 덮어쓰지 않고 부족분만 append
- 착수 이동은 수행하지 않음. 단, PREV_DATE 미완료 이월은 수행

**`--orchestrated` 모드일 때**:

- 모호 결정은 "건너뛰기/기본값"으로 자동 처리
- "병합 vs 덮어쓰기" 질문은 자동 "병합"
- blocked 이슈 한 건씩 확인하는 질문 생략
- 발굴(Step 7) 후보는 Focus Today에 추가하지 않고 보고에만 포함
- Step 4 외부 인박스 소스 전체 스킵

**연체/리마인드 플래그**:

- Key Result 1(KR1, 프로세스 준수율) 체크포인트 연체 감지 시 (`{vault_path}/30 Imagoworks/10 Objectives/kr1-tracking.md`의 "다음 업데이트" 날짜가 과거면): `# 오늘 꼭(Focus)` 최상단에 `⚠ KR1 체크포인트 업데이트가 {N}일 연체 — /memento:review-objectives` 추가.
- Active Reminders와 충돌/일치하는 항목에는 `(리마인드: {슬로건})` 마크

### Step 9: 완료 출력

생성/갱신된 Focus Today 경로, 생성/이동된 todo 파일 경로, 지금 선택된 작업(있다면), 발굴된 후보 중 미처리로 남긴 것의 요약을 출력한다.

**`--orchestrated` 모드 반환 포맷** (review-day 등 상위가 집계 가능하도록 축약):

```
[planning/orchestrated target={TARGET_DATE}]
  focus_today=<filled|skipped|merged>
  focus=N carryover=M discoveries=K
  external_inbox=<checked|skipped|partial> teams_items=T mail_items=M jira_items=J marker=<created|skipped>
  focus_file=<경로>
  todo_files=[<경로1>, <경로2>, ...]
```

일반 사용자 출력(장문)은 생략하고 위 블록만 반환한다.

## 원칙

- 핵심 다섯 단계(파악·정리·분류·발굴·선택 = Step 4–8)를 순서대로 실행한다. 각 단계는 짧게.
- 발굴 단계에서 후보가 없으면 "발굴 없음"으로 정상 종료
- 선택 없이 종료하는 호출도 허용 — 파악·정리·분류만 필요할 때
- 반복 호출은 기존 섹션 병합 우선
- 후보가 비등할 때만 한 질문으로 선택
- blocked 이슈는 분류 단계에서 별도 표시
- KR1 연체 감지 시 1줄 경고 (첫 출현은 `Key Result 1(KR1)`로 풀어쓰기)
- todo 파일은 파일 하나 = 일 하나 (Focus Today는 인덱스만)
- `# 오늘 꼭(Focus)` 단일 섹션 8건 cap. 넘치면 Inbox/WORKING.md로 돌려보낸다.
- 모든 라인은 체크박스(`- [ ]` / `- [x]`). 아이콘은 체크박스 뒤 prefix로 우선순위 표현(⚠ 연체/마감, ⏰ 고정일정, 🌙 저녁, 🏠 집에서). 정보성 사실 라인도 예외 없이 체크박스(처리된 것은 - [x]).
- 외부 인박스(Teams, Mail, Jira)는 **당일 자동 스캔 성공 marker가 없을 때** 자동 스캔. marker 존재 후 재실행은 사용자 명시 요청 시에만(marker 갱신 안 함). 각 소스는 제외 필터 통과분만 Step 6 "외부 인박스" 블록에 노출. `tomorrow`·`--orchestrated`에서는 블록 자체 생략. 부분 실패 시 marker 미생성 → 자동 재시도.
- 출력은 Focus + 외부 인박스 두 블록만. 어제 이월/백로그/발굴 후보는 사용자 명시 요청 시에만 노출.
- **내부 Task ID 축약 단독 사용 금지**: 사용자 대면 출력(대화, Focus Today 본문, 보고서)에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9`, 에픽 내부 순번 같은 내부 레이블을 **한 문서 내 첫 출현 시** 단독으로 쓰지 않는다. 풀어쓰거나 괄호 병기: `Task 2(실제 docx 변환)`, `Checkpoint 1(CP1)`, `Key Result 1(KR1)`. 이후 같은 문서 내 반복은 단독 허용. Jira 티켓 번호(`CND-1173`, `PR #1482`)와 산업 표준 약어(API/HTTP/JSON/TDD/CI/CD 등)는 면제.
