---
name: create-issue
description: |
  세션 대화에서 이슈를 분석·추출하여 Obsidian vault inbox에 보고서로 저장.
  나중에 처리할 이슈를 보관(defer)하는 트리아지 도구.
  This skill should be used when the user asks to "이슈 정리", "inbox에 넣어", "triage", "이슈 보관", "나중에 처리", "defer", "이슈 추출", "문제 기록", "이슈 발견", "나중에 볼 것".
  `/inbox`, `/triage` alias로도 호출 가능.
---

# Issue Box — 이슈 추출 및 Obsidian Inbox 보관

세션 대화 내용을 분석하여 이슈를 추출하고, Obsidian vault inbox 폴더에 상세 보고서로 저장한다.
지금 당장 처리하지 않고 나중에 처리하기 위해 보관(defer)하는 트리아지 도구이다.

## 트리거 조건

- `/inbox`, `/triage`, `/issue-box:create-issue` 명시 호출
- "이슈 정리", "inbox", "triage", "이슈 보관", "나중에 처리", "defer", "이슈 추출", "문제 기록" 키워드 발화

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| vault | Obsidian vault 이름 | X | CLI로 탐색 후 자동/선택 |
| folder | inbox 폴더 경로 | X | vault 내 "inbox" 포함 폴더 자동 탐색 |

## 워크플로우

### Step 1: Obsidian CLI 확인

`obsidian --version` 실행으로 CLI 설치 여부 확인.

- **설치됨**: Step 2로 진행
- **미설치**: 아래 설치 가이드를 출력하고 중단

```
Obsidian CLI가 설치되어 있지 않습니다.

설치 방법:
  brew tap nicosm/tools
  brew install obsidian-cli

설치 후 다시 실행해주세요.
```

### Step 2: Vault 파악

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

### Step 3: Inbox 폴더 탐색

`obsidian vault="<name>" folders` 실행 후 폴더 목록에서 "inbox"(대소문자 무시) 포함 폴더를 필터링.

| 케이스 | 처리 |
|--------|------|
| 1개 매칭 | 자동 선택 |
| 2개+ 매칭 | AskUserQuestion으로 매칭된 폴더 목록 제시 후 선택 |
| 0개 매칭 | 전체 폴더 목록을 제시하고 AskUserQuestion으로 저장 폴더 지정 요청 |

### Step 4: 이슈 분석 및 추출

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
- **제목**: 간결한 한 줄 (노트 파일명으로도 사용)
- **카테고리**: `bug` / `tech-debt` / `enhancement` / `risk` / `follow-up`
- **우선순위**: `high` / `medium` / `low` (대화 맥락의 긴급도·영향도 기반 추정)
- **요약**: 1-2문장

이슈가 0건인 경우 "현재 세션에서 보관할 이슈가 발견되지 않았습니다." 안내 후 종료.

### Step 5: 이슈 선택

발견된 이슈 전체 목록을 번호 매긴 리스트로 출력.
각 항목에 제목, 카테고리, 우선순위, 요약을 표시.

AskUserQuestion으로 저장할 이슈를 선택받는다:
- 전체 선택 (예: "전부", "all")
- 번호 지정 (예: "1, 3, 5")
- 취소 (예: "취소", "cancel") → 즉시 종료

### Step 6: 보고서 작성 및 저장

선택된 각 이슈에 대해 상세 보고서를 작성하고 Obsidian 노트로 저장한다.

**파일명 규칙**: `{YYYY-MM-DD} {이슈 제목}`

**저장 명령**:

```bash
obsidian vault="<vault>" create name="<파일명>" path="<inbox폴더>" content="<보고서>"
```

content에 마크다운을 전달할 때 줄바꿈은 `\n`, 탭은 `\t`로 이스케이프한다.
YAML frontmatter의 `---` 구분자도 content 문자열 안에 포함하여 전달한다.

**보고서 포맷**:

```markdown
---
created: {YYYY-MM-DD}
category: {bug|tech-debt|enhancement|risk|follow-up}
priority: {high|medium|low}
status: open
source_project: {cwd 기반 프로젝트명}
tags:
  - issue-box
  - {category}
---

# {이슈 제목}

## 요약

{1-2문장 요약}

## 컨텍스트

{이슈 발견 경위. 어떤 작업 중 어떤 논의에서 나왔는지.}

## 상세 분석

{기술적 상세. 관련 파일, 코드 패턴, 영향 범위 등.}

## 재현 / 확인 방법

{카테고리에 맞는 확인 방법. 버그라면 재현 단계, 기술 부채라면 확인 방법, 개선 사항이라면 현재 상태.}

## 제안 조치

{권장 해결 방향, 다음 단계. 구체적이고 actionable하게.}

## 관련 파일

- `{파일 경로}` — {관련 이유}
```

저장 완료 후 생성된 노트의 파일명과 경로를 출력한다.

## Do / Don't

| Do | Don't |
|----|-------|
| 대화 내용에서 실제로 논의된 이슈만 추출 | 대화에 없는 이슈를 추측하여 생성 |
| 이슈별로 충분한 컨텍스트와 재현 방법 포함 | 제목과 요약만으로 보고서 작성 |
| 카테고리와 우선순위를 대화 맥락 기반으로 판단 | 모든 이슈를 동일 카테고리/우선순위로 설정 |
| 제안 조치를 구체적이고 actionable하게 작성 | "나중에 확인 필요" 같은 모호한 제안 |
| obsidian CLI 명령 실패 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
