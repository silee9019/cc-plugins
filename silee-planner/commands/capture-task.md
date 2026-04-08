---
description: 할 일 캡처. 인자 있으면 빠른 입력(오늘/나중에 분기), 없으면 세션 대화에서 이슈를 자동 추출하여 백로그에 보관.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
argument-hint: [할 일 내용]
---

# 할 일 캡처 (capture-task)

할 일을 캡처하여 적절한 위치에 추가��다. 두 가지 모드��� 동작:

- **인자 있음**: 빠른 캡처. 한 문장 입력 → 오늘 Daily Note 또는 백로그에 추가.
- **인자 없음**: 세션 스캔. 대화 컨텍스트를 분석하여 이슈를 ��출하고 백로그에 보관.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| ��이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path`, `file_title_format` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

### Step 2: 모드 판별

| ��건 | 모드 |
|------|------|
| 커맨드 인자에 텍스트가 있음 | → **Step A** (빠른 캡처) |
| 커맨드 인자가 비어있음 | → **Step B** (세션 스캔) |

---

## Step A: 빠른 캡처

사용자가 입력한 할 일을 빠르게 처리한다. 최소 마찰로 ���작.

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

사용자가 인자에서 명시한 경�� (예: "나중에 XXX 해야 함") 자동 판별하여 확인만 받는다.

### Step A-3: Daily Note에 추가

1. 오늘 Daily Note 경로를 생성하고 파일�� 읽는다.
2. 적절한 섹션(Projects/Areas/Inbox)에 체크��스 항목을 추가한다:
   ```
   - [ ] {할 일 내용}
   ```
3. 해당 섹션이 없으면 Inbox에 추가한다.
4. Daily Note��� 없으면 "오늘 Daily Note가 없습니다. `/silee-planner:daily-plan`을 먼저 실행해주세요." 안내.

추가 완료 후 "Daily Note에 추가: {할 일 내용}" 출력.

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
- 발��된 버그 또는 오류
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

발견된 이슈 전�� 목록을 번호 매긴 리스트로 출력.
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
- 일자별 하위 폴더 `{YYYY-MM-DD}` ���동 생성
- `file_title`: config.md의 `file_title_format` 적용 (기본값: `{date} {category} {title}`)

**저장 명령**:

```bash
obsidian vault="<vault>" create name="<file_title>" path="<inbox_folder_path>/<YYYY-MM-DD>" content="<보고서>"
```

content에 마크다운을 전달할 때 줄바꿈은 `\n`, 탭은 `\t`로 이스케이프한다.
YAML frontmatter의 `---` 구분자도 content 문자열 안에 포함하여 전달한다.

저장 완료 후 생성된 노��의 파일명과 경로를 출력한다.

---

## Do / Don't

| Do | Don't |
|----|-------|
| 인자 유무로 모드를 자동 판별 | 매번 "어떤 모드?" 질문으로 흐름 끊기 |
| 빠른 캡처 시 카테고리/우선순위 자동 추정 후 확인만 | 매번 카테고리/우선순위를 처음부터 묻기 |
| Daily Note 없으면 daily-plan 안내 | Daily Note��� 자동 생성 |
| 세션 스캔 시 대화 내용에서 실제��� 논의된 이슈만 추출 | 대화에 없는 이슈를 추측하여 생성 |
| 이슈별로 충분한 컨텍스트와 재현 방법 포함 | 제목과 요약만으로 보고서 작성 |
| obsidian CLI 명령 실패 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
| config.md 존재 시 vault/폴더 탐색 단계 스킵 | 설정�� 있��데도 매번 CLI로 탐색 |
