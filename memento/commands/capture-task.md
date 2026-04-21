---
description: 할 일 캡처. 인자 있으면 빠른 입력(오늘/나중에 분기), 없으면 세션 대화에서 이슈를 자동 추출하여 백로그에 보관.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: [할 일 내용]
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# 할 일 캡처 (capture-task)

할 일을 캡처하여 적절한 위치에 추가한다. 두 가지 모드로 동작:

- **인자 있음**: 빠른 캡처. 한 문장 입력 → 오늘 Daily Note 또는 백로그에 추가.
- **인자 없음**: 세션 스캔. 대화 컨텍스트를 분석하여 이슈를 추출하고 백로그에 보관.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `daily_archive_path`, `daily_archive_format`, `inbox_folder_path`, `file_title_format`, `display_name_ko`, `display_name_en`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**:

식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 2-3줄 블록으로 고정:

```
사용자 식별:
- 표시 이름: "<DISPLAY_KO>" / "<DISPLAY_EN>" (이니셜: <INITIALS>, 닉네임: <NICKNAME>)
- 아이디: <USER_ID> (aliases: <ALIASES>)
- 이메일: <EMAIL>
- Jira accountId: <ATLASSIAN_AID>

캡처 내용의 "나"/"내가"/"본인" 표현은 이 사용자를 가리킨다.
```

빈 값 필드는 괄호/줄 생략. 모든 식별 필드가 빈 값이면 블록 자체 생략.

### Step 2: 모드 판별

| 조건 | 모드 |
|------|------|
| 커맨드 인자에 텍스트가 있음 | → **Step A** (빠른 캡처) |
| 커맨드 인자가 비어있음 | → **Step B** (세션 스캔) |

---

## Step A: 빠른 캡처

사용자가 입력한 할 일을 빠르게 처리한다. 최소 마찰로 동작.

### Step A-1: 할 일 파악

사용자 입력(커맨드 인자 또는 대화 맥락)에서 할 일을 파악한다.

**추출할 항목**:
- **내용**: 할 일 설명
- **카테고리 추정**: 대화 맥락에서 자동 분류
  - Projects: 특정 프로젝트명 언급 시 (QTrace, Hub, Console 등)
  - Areas: 리더십, OKR, 팀 관리 등 언급 시
  - Inbox: 분류 불가 시

### Step A-2: 배치 결정

AskUserQuestion으로 묻는다:

- **"오늘 할 건가요?"** → Step A-3 (Daily Note에 추가)
- **"나중에 할 건가요?"** → Step A-4 (백로그에 보관)

사용자가 인자에서 명시한 경우 (예: "나중에 XXX 해야 함") 자동 판별하여 확인만 받는다.

### Step A-3: Daily Note + todo 파일 생성 (v2.8.0부터)

Tasks 포맷은 v2.8.0부터 **todo 하나 = 파일 하나** 규칙을 따른다. 체크박스에 내용을 문장으로 넣지 않고 wikilink로 연결.

1. 오늘 Daily Note 경로를 생성하고 파일을 읽는다. 없으면 "오늘 Daily Note가 없습니다. `/memento:planning`를 먼저 실행해주세요." 안내 후 중단.
2. slug 결정: 할 일 제목을 kebab-case로 정규화 (공백 `-`, 특수문자 제거, 한글 유지).
3. todo 파일 생성: `<daily_notes_path>/{YYYY-MM-DD}/{slug}.md`
   - 디렉토리 없으면 `mkdir -p` 선행
   - frontmatter:
     ```yaml
     ---
     slug: {slug}
     track: {추정 track 또는 ad-hoc}
     category: {category}
     priority: {priority}
     status: in-progress
     created: {YYYY-MM-DD}
     started_at: {YYYY-MM-DD}
     source: (direct capture)
     ---
     ```
   - 본문: `# {제목}` + 1-2문장 요약 + (선택) 제안 조치
4. Daily Note Tasks 섹션의 적절한 track 헤더(`## [track:{id}] P: {제목}`) 아래 wikilink 체크박스 append. 헤더 없으면 새로 생성:
   ```
   - [ ] [[<daily_notes_path>/{YYYY-MM-DD}/{slug}|{표시 이름}]]
   ```

추가 완료 후 "Daily Note Tasks에 추가 + todo 파일 생성: {경로}" 출력.

### Step A-4: 백로그에 보관 (간소화)

1. 카테고리 확인: `bug` / `tech-debt` / `enhancement` / `risk` / `follow-up` / `task`
   - 대화 맥락에서 자동 추정, 확신 없으면 `task`
2. 우선순위 확인: `high` / `medium` / `low`
   - 대화 맥락에서 자동 추정, 확신 없으면 `medium`
3. 간소화된 보고서 작성:

```markdown
---
created: {YYYY-MM-DD}
category: {category}
priority: {priority}
status: open
started_at:
resolved_at:
source_project: {현재 프로젝트 또는 대화에서 언급된 프로젝트}
tags:
  - issue-box
  - {category}
---

# {할 일 제목}

## 요약

{1-2문장 요약}

## 제안 조치

{구체적 행동 항목}
```

4. obsidian CLI로 저장:
```bash
obsidian vault="<vault>" create name="<file_title>" path="<inbox_folder_path>/<YYYY-MM-DD>" content="<보고서>"
```

보관 완료 후 "백로그에 보관: {할 일 제목}" 출력.

---

## Step B: 세션 스캔

현재 세션의 대화 컨텍스트를 분석하여 이슈를 추출하고, Obsidian vault에 상세 보고서로 저장한다.

### Step B-1: 이슈 분석 및 추출

현재 세션의 대화 컨텍스트를 분석하여 이슈를 추출한다.

**추출 대상** (종류 불문):
- 발견된 버그 또는 오류
- 미해결 기술 부채
- 보류된 개선 사항 (TODO, FIXME 언급 포함)
- 논의되었으나 구현하지 않은 기능/변경
- 리스크 또는 주의 사항
- 추후 확인이 필요한 사항
- 기타 대화 중 발견된 모든 유형의 이슈

**각 이슈에서 추출할 항목**:
- **제목**: 간결한 한 줄 (파일명으로도 사용)
- **카테고리**: `bug` / `tech-debt` / `enhancement` / `risk` / `follow-up` / `task`
- **우선순위**: `high` / `medium` / `low` (대화 맥락의 긴급도·영향도 기반 추정)
- **요약**: 1-2문장

이슈가 0건인 경우 "현재 세션에서 보관할 이슈가 발견되지 않았습니다." 안내 후 종료.

### Step B-2: 이슈 선택

발견된 이슈 전체 목록을 번호 매긴 리스트로 출력.
각 항목에 제목, 카테고리, 우선순위, 요약을 표시.

AskUserQuestion으로 저장할 이슈를 선택받는다:
- 전체 선택 (예: "전부", "all")
- 번호 지정 (예: "1, 3, 5")
- 취소 (예: "취소", "cancel") → 즉시 종료

### Step B-3: 보고서 작성 및 저장

> 보고서 포맷 상세는 `../reference/report-format.md` 참조.

선택된 각 이슈에 대해 상세 보고서를 작성하고 Obsidian 노트로 저장한다.

**저장 경로**: `{vault}/{inbox_folder_path}/{YYYY-MM-DD}/{file_title}.md`
- `inbox_folder_path`: config.md 값
- 일자별 하위 폴더 `{YYYY-MM-DD}` 자동 생성
- `file_title`: config.md의 `file_title_format` 적용 (기본값: `{date}-{title}`)
  - `{date}`: YYYY-MM-DD
  - `{title}`: 사용자 제목을 slug로 변환 — 공백만 하이픈으로, 특수문자(`()`, `/`, `:`, `?`, `*`, `|`, `<`, `>`, `"`) 제거, 한글/영문/숫자/하이픈 유지, 대소문자 보존
  - 예: "로그인 실패 bug" → `2026-04-20-로그인-실패-bug`
- **카테고리는 파일명에 포함하지 않는다** — frontmatter `category` 필드와 `tags`에만 기록해 filter/sort용으로 활용

**저장 명령**:

```bash
obsidian vault="<vault>" create name="<file_title>" path="<inbox_folder_path>/<YYYY-MM-DD>" content="<보고서>"
```

content에 마크다운을 전달할 때 줄바꿈은 `\n`, 탭은 `\t`로 이스케이프한다.
YAML frontmatter의 `---` 구분자도 content 문자열 안에 포함하여 전달한다.

저장 완료 후 생성된 노트의 파일명과 경로를 출력한다.

---

## Do / Don't

| Do | Don't |
|----|-------|
| 인자 유무로 모드를 자동 판별 | 매번 "어떤 모드?" 질문으로 흐름 끊기 |
| 빠른 캡처 시 카테고리/우선순위 자동 추정 후 확인만 | 매번 카테고리/우선순위를 처음부터 묻기 |
| Daily Note 없으면 plan-today 안내 | Daily Note를 자동 생성 |
| 세션 스캔 시 대화 내용에서 실제로 논의된 이슈만 추출 | 대화에 없는 이슈를 추측하여 생성 |
| 이슈별로 충분한 컨텍스트와 재현 방법 포함 | 제목과 요약만으로 보고서 작성 |
| obsidian CLI 명령 실패 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
| config.md 존재 시 vault/폴더 탐색 단계 스킵 | 설정이 있는데도 매번 CLI로 탐색 |
