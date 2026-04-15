---
description: 세션 마무리 및 인계. 세션 맥락에서 완료된 작업을 자동 감지해 done 처리, WORKING.md/raw 로그/Daily Note Log를 갱신. 자주 호출해 세션 부풀림 방지.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Skill
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# Wrap-up

**항상 동일한 단일 동작**. "wrap up" = 매듭짓고 다음으로 넘긴다. 마무리와 인계의 양가성을 함께 담는다. **호출 시점에는 항상 "다음은 새 세션에서 시작한다"**는 의도가 깔려 있다.

기존 finish-task는 이 커맨드에 흡수된다. 별도 커맨드로 "이 작업 완료"를 선언할 필요 없음. 작업이 실제로 끝났으면 다음 wrap-up 호출 시점에 자동으로 완료 처리된다.

**인자 없음.** 호출 비용을 낮춰 자주 호출해 세션이 가벼워지게 한다.

## 호출 시점 예시

- 한 주제의 대화가 얼추 끝났을 때 → 호출 → 그 주제 동안 끝낸 작업이 자동 done 처리 + 세션 정리. 다음 주제는 새 세션에서
- 점심/회의 전 → 호출 → 지금까지 컨텍스트를 WORKING.md에 안전 보관
- 작업 하나를 막 끝냈을 때 → 호출 → 감지 + 완료 처리 + 세션 정리

## Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md`를 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root`, `daily_notes_path`, `daily_note_format`, `in_progress_folder_path`, `resolved_folder_path`, `display_name_ko`, `display_name_en`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

`<memento_home> = <vault_path>/<memento_root>` 로 계산.

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

## Step 2: project-id 및 경로 준비

현재 작업 디렉토리 기준으로 project-id 계산 (session-start.sh 동일 로직):

```sh
PROJECT_ID=$(
  REMOTE=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/' | tr '/' '-' | tr '[:upper:]' '[:lower:]')
  if [ -n "$REMOTE" ]; then
    printf '%s' "$REMOTE"
  else
    git rev-parse --show-toplevel 2>/dev/null | tr '/' '-' | tr '[:upper:]' '[:lower:]'
  fi
)
```

경로:

- `WORKING = <memento_home>/projects/<PROJECT_ID>/WORKING.md`
- `RAW_LOG = <memento_home>/projects/<PROJECT_ID>/memory/{YYYY-MM-DD}.md` (오늘 날짜)
- `TODAY_DAILY = <vault_path>/<daily_notes_path>/{YYYY}/{MM}/{YYYY-MM-DD}.md` (format 치환)

## Step 3: 세션 맥락 분석 — 무엇이 끝났는지 스스로 알아낸다

세션에서 실제로 일어난 일을 읽는다. 가정하지 말 것.

**입력 소스**:

1. **대화 흐름**: 사용자/어시스턴트 메시지의 실제 발화. 완료 신호 키워드("됐다", "완료", "끝", "고쳤어", "머지됨" 등) 감지
2. **수행한 도구 호출**: 이 세션의 Edit/Write/Bash 흔적. 어떤 파일이 수정/생성되었는가
3. **Issue Box in-progress 스캔**: `in_progress_folder_path` 하위 파일들. 각 파일의 제목·카테고리와 세션 맥락을 매칭
4. **오늘 Daily Note Tasks**: `- [ ]` 항목들. 세션에서 어떤 항목이 실질적으로 완료되었는지 맥락 근거 확인

**완료 판정 근거** (다음 중 2개 이상 충족해야 확정):

- 사용자가 명시적으로 "완료/됐다/끝냈어" 등 선언
- 관련 파일이 저장되고(Edit/Write) 검증됨(테스트/빌드/git status 등)
- 결과물이 실제로 존재함 (파일/커밋/PR/배포)
- Issue Box 이슈의 "제안 조치" 체크리스트가 대부분 충족됨

**확정 감지 목록** / **모호 감지 목록** 두 가지로 분리해둔다.

## Step 4: 자동 완료 처리 (확정 항목)

확정 감지 목록의 각 항목에 대해:

### Issue Box (in-progress → done)

1. status를 `resolved`로 변경, `resolved_at`에 오늘 날짜 기록
2. 파일을 `resolved_folder_path/{YYYY-MM-DD}/`로 이동 (설정 없으면 status만)
3. Daily Note Tasks 중 매칭되는 `- [ ]`를 `- [x]`로 변경 (Edit 도구)
4. 체크 완료 줄 끝에 `(세션 완료: {간단 요약})` 주석 추가 — 근거가 명확할 때만

### Daily Note Tasks only (이슈 연결 없음)

1. 해당 `- [ ]` → `- [x]`
2. Log 섹션에 한 줄 메모: `- {HH:MM} {작업 내용} 완료`

## Step 5: 모호 항목 런타임 인터뷰

모호 감지 목록의 각 항목에 대해 **한 번에 하나씩** AskUserQuestion:

> "이 작업이 완료된 것으로 처리할까요? — {항목 제목}"

옵션: "완료 처리 (권장)" / "아직 진행 중" / "폐기"

답에 따라 Step 4 로직 실행 또는 dismissed 처리(`dismissed_folder_path`로 이동).

**여러 항목이면 반드시 순차로** — 한 번에 한 질문. 사용자의 집중을 흐리지 않는다.

## Step 6: 세션 상태 정리 (항상 수행)

완료 처리가 전혀 없었어도 항상 수행한다. wrap-up의 **본질**이 여기에 있다.

### 6a. raw 로그 체크포인트 append

`RAW_LOG`에 다음 형식으로 append:

```markdown
## [wrap-up: {주제 요지}]
- request: {이 블록에서 사용자가 요청한 것}
- analysis: {수행한 분석/탐색 요약}
- decisions: {내린 결정과 근거}
- outcome: {무엇이 바뀌었는가, 어떤 파일이 수정/생성되었는가}
- references: {관련 파일 경로, 외부 소스}
```

이 포맷은 memento-core의 End-of-Task Checkpoint 포맷과 동일하다. 단일 Write/Edit 호출로 최소 컨텍스트 영향.

### 6b. WORKING.md Session Handoff 갱신

`WORKING` 파일이 없거나 **현재 세션 주제와 어긋난 오래된 내용**이면 전체를 재작성한다. 템플릿은 `{CLAUDE_PLUGIN_ROOT}/templates/WORKING.md`.

섹션:

- **세션 요약**: 이 세션의 성격·주요 흐름 (3-5문장)
- **현재 상태**: 승인된 플랜, 진행 중 작업, git 상태, 활성 파일 등
- **미완료 작업**: 다음 세션에서 이어서 할 일 (체크리스트)
- **결정 사항**: 표 형식 (결정 / 근거 / 영향)
- **보류 사항**: 결정 미뤄진 것
- **참조 파일**: 다음 세션이 먼저 읽어야 할 파일 경로
- **재개 방법**: 다음 세션 시작 시 1-N 단계별 행동

**작성 원칙**: 다음 세션이 이 문서 하나만 읽으면 즉시 작업을 이어갈 수 있어야 함. 파일 경로는 절대경로로.

### 6c. Daily Note Log + Review 교훈 append

`TODAY_DAILY`의 `## Log` 섹션에 한 문단 추가:

```markdown
- {HH:MM} wrap-up: {주제 한 줄}. {핵심 결과 1-2줄}
```

**섹션 구조 / 정렬 원칙 - agent 프로젝트 1순위, 시간 2순위**:

Daily Note Log는 "오늘 있었던 일의 타임라인"이지만, 단순 시간 순으로 나열하면 여러 프로젝트가 뒤섞여 다음 날 회고나 주간 회고에서 어떤 프로젝트가 어떻게 진전됐는지 읽어내기 어렵다. 대신 **memento agent 프로젝트(`_memento/projects/{project-id}/`)별 `### {alias}` 서브섹션**으로 분리하고, 같은 프로젝트 안에서만 시계열로 정렬한다.

- **1순위 = agent 프로젝트 (memento project-id)**: 세션이 수행된 작업의 agent 프로젝트 기준. project-id는 session-start.sh 로직(`git remote → repos.md 매칭`)으로 식별. 문서에는 **alias로 표기**하여 가독성 확보 (예: `silee9019-silee-vault` → `### vault`, `silee9019-cc-plugins` → `### cc-plugins`, `imagoworks-inc-dentbird-platform-connect-monorepo` → `### connect-monorepo`). alias는 `_memento/user/control/repos.md`의 ID를 사용자 친화적으로 줄인 이름으로 하루 첫 사용 시점에 결정.
- **2순위 = 프로젝트 내 시간(HH:MM)**: 같은 프로젝트 서브섹션 안에서는 오래된 항목이 위, 최근이 아래. 새 항목은 `새 시각 < 기존 시각`인 **첫 항목 직전**에 삽입(프로젝트 내 가장 큰 시각이면 섹션 끝에 append).
- **섹션 순서**: `### 📅 미팅` (프로젝트 무관 앵커) 먼저, 그 다음 프로젝트 섹션. 프로젝트 섹션 순서는 첫 사용 시점 또는 작업 비중 순. 한 파일 안에서는 일관되게 유지.
- **📅 미팅은 프로젝트 섹션이 아님**: 캘린더 이벤트는 agent 프로젝트에 귀속되지 않으므로 별도 고정 섹션으로 유지. `### 📅 미팅` 섹션이 없으면 신설하고 미팅 항목만 시각 순으로 쌓는다.
- **프로젝트 분류가 모호한 항목** (예: 여러 레포를 한 번에 정리한 wrap-up): 세션이 시작된 agent 프로젝트(즉 이 wrap-up이 실행되는 project-id)의 섹션에 배치. 교차 트랙 작업은 본문에 다른 프로젝트 영향을 언급.
- **파일 끝 무조건 append 금지**. 매 wrap-up마다 "이 항목이 어느 agent 프로젝트인가?"부터 판단한 뒤 해당 서브섹션에서 시각 순으로 삽입.
- **기존 Log가 평면 시간순 형식**이면, 이번 wrap-up에서 **agent 프로젝트 서브섹션으로 재정렬**한 뒤 새 항목을 삽입한다. 재정렬은 정보 손실 없이 항목 이동만 수행하고 본문 텍스트는 수정하지 않는다. 이미 agent 프로젝트 섹션 형식이면 추가 재정렬 없이 해당 섹션에 삽입만.
- **신규 프로젝트**: 오늘 처음 등장하는 project-id면 `_memento/user/control/repos.md`에 등록되어 있는지 확인(없으면 등록 검토 권장)하고 alias를 정한 뒤 새 `### {alias}` 서브섹션을 추가.

Daily Note가 없으면 생략 (planning 먼저 권장은 하지 않음 / wrap-up은 항상 동일 동작 원칙).

**캘린더 참고 / 오늘의 미팅도 Log에 항목으로 포함**:

Daily Note Log는 "오늘의 시간 순 타임라인"이므로 일하는 세션만이 아니라 미팅도 함께 보여야 하루 흐름이 복원된다. wrap-up 시 다음을 수행한다:

1. 회사 일정 컨텍스트 스크립트 실행:
   ```bash
   python3 {PLUGIN_ROOT}/memento/scripts/work_calendar_context.py --plugin-root {PLUGIN_ROOT}/memento
   ```
   출력에서 **오늘 날짜에 해당하는 이벤트만** 추출 (형식 예: `- 04-13(월) 10:00 {제목} @ {장소}`).

2. 각 오늘 이벤트에 대해 Daily Note Log에 이미 동일/유사 항목이 있는지 확인한다 (제목 substring 매칭). 없으면 `### 📅 미팅` 서브섹션에 시각 순으로 삽입한다 (해당 섹션이 없으면 신설):
   ```markdown
   - {HH:MM} 📅 {제목} @ {장소}
   ```

3. 스크립트가 `미설정`을 반환하거나 Keychain 접근 실패 시 조용히 건너뛴다 (wrap-up의 본질은 체크포인트이므로 캘린더는 부가 정보).

4. wrap-up 본인 엔트리(`- {HH:MM} wrap-up: ...`)를 쓸 때, 바로 직전 미팅과 시간적으로 인접하면(예: 미팅 종료 직후 wrap-up) 자연스럽게 "미팅 복귀 후 …" 같은 맥락을 본문에 녹여도 된다. 단, 억지로 엮지 않음.

**교훈 추출 및 저장**: 세션 맥락에서 교훈(lessons learned)을 추출하여 `## Review` 섹션의 `- 배운 것:` 필드에 누적 append한다.

교훈 추출 기준:
- 처음 시도해서 효과적이었던 접근법
- 실패 후 발견한 원인/해결책
- 도구/패턴/아키텍처에 대한 새로운 이해
- "다음에도 이렇게 하자" 또는 "다음엔 이렇게 하지 말자" 류의 판단

저장 형식 (기존 내용 아래에 append, 덮어쓰지 않음):

```markdown
- 배운 것:
  - {교훈 1}
  - {교훈 2}
```

동작 규칙:
- 교훈이 없으면 건너뛰기 (억지로 채우지 않음)
- 한 세션당 1-3개. 간결하게 한 줄씩
- `- 배운 것:` 뒤에 이미 하위 불릿이 있으면 마지막 불릿 뒤에 append

## Step 6d: 작업 레포지토리 커밋/푸시 제안

세션 중 **현재 작업 디렉토리(또는 세션에서 파일을 수정한 레포지토리)**에 미커밋 변경이 있는지 확인한다.

```bash
git status --short
```

| 케이스 | 처리 |
|--------|------|
| 변경 없음 (clean) | 조용히 건너뛰기 |
| 미커밋 변경 있음 | AskUserQuestion으로 질문 |

**gitignore 처리 원칙**: `_memento/` 이하와 같이 .gitignore에 포함된 경로는 vault git 커밋 대상이 아니다. wrap-up 수행 중 Step 6a(raw 로그)/Step 6b(WORKING.md)가 _memento/ 하위를 수정하는 것은 정상 동작이며, 이 사실을 사용자에게 설명하거나 "gitignore라 커밋 대상 아님" 같은 안내를 출력하지 않는다. 사용자는 이미 알고 있다. Step 6d에서는 `git status --short` 결과 그대로 실제 변경된 추적 파일만 취급한다.

질문 형식:

> "{레포 이름}에 미커밋 변경이 {N}개 파일 있습니다. 커밋하고 푸시할까요?"

옵션: "커밋+푸시" / "커밋만" / "건너뛰기"

- **커밋+푸시**: `/commit-commands:commit-push-pr` 또는 수동 git add/commit/push 실행
- **커밋만**: git add + commit만 실행 (push 생략)
- **건너뛰기**: 아무것도 하지 않고 Step 7로 진행

세션 중 여러 레포에서 작업했다면 (예: vault + cc-plugins) 각 레포에 대해 순차적으로 확인한다.

## Step 7: 호출 후 상태

"세션 컨텍스트를 정신적으로 비운 상태"로 다음 블록을 이어갈 수 있어야 한다. 출력은 다음 형식으로 간결하게:

```
wrap-up 완료:
  완료 처리: N건 (이슈 + Daily Note)
  raw 로그 append: <경로>
  WORKING.md 갱신: <경로>
  Daily Note Log: <경로>
  Daily Note 교훈: N건

다음 세션 재개 단계:
  1. ...
  2. ...
```

## Do / Don't

| Do | Don't |
|----|-------|
| 세션 맥락 근거 2개 이상일 때만 자동 완료 | 단일 근거로 자동 완료 |
| 모호하면 한 건씩 런타임 인터뷰 | 모호한 것도 가정하여 자동 처리 |
| 완료 처리 0건이어도 Step 6는 항상 수행 | 처리할 게 없으면 아무것도 안 함 |
| WORKING.md는 "이 문서만 읽으면 재개 가능" 수준 | 단편적 메모만 남기고 끝 |
| 자주 호출해 세션 가볍게 유지 | 세션 끝에만 한 번 호출 |
| 인자 없음 — 항상 동일 동작 | 모드 분기/옵션 고민 |
