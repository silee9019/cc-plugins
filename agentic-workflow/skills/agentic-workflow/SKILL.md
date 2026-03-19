---
name: agentic-workflow
description: |
  GitHub 저장소에 에이전틱 워크플로우(CI/CD 자동화, 셀프 크리틱, 이슈 자동 구현)를 설치하는 scaffold 도구.
  Phase별 GitHub Actions, 프롬프트, 스크립트를 생성.
  사용자가 "에이전틱 워크플로우 설치", "자동화 파이프라인 설정", "agentic setup", "Phase 설치", "agentic workflow" 언급 시 트리거.
---

# Agentic Workflow — 에이전틱 워크플로우 설치

GitHub 저장소에 에이전틱 워크플로우를 설치한다.
저장소를 분석하여 커스터마이즈된 계획서를 생성하고, 사용자 승인 후 파일을 생성한다.

Agent CLI 비종속 — Claude Code, Codex, Gemini CLI 등 어떤 에이전트 CLI든 사용 가능.

## 트리거 조건

- `/agentic-workflow:agentic-workflow` 명시 호출
- "에이전틱 워크플로우", "agentic workflow", "자동화 파이프라인 설치", "Phase 설치" 키워드 발화

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| phases | 설치할 Phase 번호 (쉼표 구분) | X | Step 2에서 선택 |

## Phase 목록

| Phase | 이름 | 설명 | 전제 조건 |
|-------|------|------|-----------|
| 1 | Daily Self-Critique | Bot PR 품질 매일 자동 평가 | 없음 |
| 2 | PROGRESS.md | 프로젝트 진행 상황 자동 추적 문서 | 없음 |
| 3 | Issue Pipeline | 이슈 → 계획 → 승인 → 구현 → 검증 → PR | 없음 |
| 4 | Weekly Self-Improve | Phase 1 metrics 분석 → 에이전트/가이드라인 자동 개선 | Phase 1 필수 |
| 5 | Visual Audit | 웹앱 스크린샷 → Vision AI 품질 검증 | 웹앱 저장소만 |

> Phase별 상세 사양은 `phase-reference.md` 참조.

## Workflow

### Step 1: 설정 로드

`~/.claude/plugins/data/agentic-workflow-<repo>/config.md` 파일을 읽는다.
`<repo>`는 현재 디렉토리의 git 저장소 이름 (`basename $(git rev-parse --show-toplevel)`).

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | YAML frontmatter에서 설정값 로드. `installed_phases` 배열 파악 → Step 2 진행 |
| 파일 없음 | 아래 안내를 출력하고 중단 |

```
설정 파일이 없습니다. 먼저 설정을 실행해주세요:
  /agentic-workflow:setup
```

### Step 2: Phase 선택

Phase 1-5 목록을 표시한다. 이미 설치된 Phase는 ✅ 표시.

AskUserQuestion으로 설치할 Phase를 선택받는다:
- 복수 선택 가능 (예: "1, 2, 3")
- "전부" 또는 "all" → Phase 1-5 전체
- "취소" → 즉시 종료

**의존관계 검증**:
- Phase 4 선택 시 Phase 1이 설치되어 있지 않고 이번에도 선택하지 않았으면 안내:
  "Phase 4는 Phase 1의 metrics 데이터가 필요합니다. Phase 1도 함께 설치하시겠습니까?"
- Phase 5 선택 시 안내:
  "Phase 5는 웹앱이 있는 저장소에서만 동작합니다. pages.json에 검증 대상 URL을 직접 작성해야 합니다."

### Step 3: 기존 파일 충돌 확인 + 계획서 생성

선택된 Phase의 템플릿 목록을 `phase-reference.md`에서 확인하고, 대상 저장소에 생성할 파일 목록을 나열한다.

**충돌 확인**:
각 파일의 대상 경로가 이미 존재하는지 확인.

| 케이스 | 처리 |
|--------|------|
| 충돌 없음 | 계획서 생성 진행 |
| 충돌 있음 | 충돌 파일 목록을 표시하고 AskUserQuestion으로 처리 방법 선택: 덮어쓰기 / 해당 파일 스킵 / 중단 |
| Modified 상태 파일 충돌 | **절대 자동 덮어쓰기 금지**. 반드시 사용자 확인 |

**계획서 생성**:
아래 형식으로 계획서를 출력한다:

```
## 에이전틱 워크플로우 설치 계획서

### 대상 저장소
<owner>/<repo> (<default_branch>)

### Agent CLI
<agent_cmd>

### 설치 Phase
- Phase N: <이름> — <파일 수>개 파일

### 생성할 파일 (총 N개)

**Phase 1: Daily Self-Critique**
  .github/workflows/daily-critique.yml
  .github/workflows/daily-critique/run.sh
  .github/workflows/daily-critique/collect-outputs.sh
  .github/workflows/daily-critique/critique-prompt.md
  .agentic-workflow/metrics/.gitkeep

**Phase 2: PROGRESS.md**
  PROGRESS.md

... (선택된 Phase만)

### 워크플로우 핵심 설정 미리보기

**daily-critique.yml**:
  schedule: <cron_daily>
  runner: <runner_label>

... (각 워크플로우의 핵심 설정만)

### 충돌 파일
없음 (또는 충돌 목록)
```

### Step 4: 사용자 검토

AskUserQuestion으로 계획서 기반 진행 여부를 확인한다:
- "진행" → Step 5
- "수정" → 수정 사항 반영 후 Step 3 재실행
- "중단" → 즉시 종료

### Step 5: 파일 생성

`${CLAUDE_PLUGIN_ROOT}/skills/agentic-workflow/templates/phase-N/` 디렉토리의 각 템플릿 파일을 읽는다.

**템플릿 처리**:
1. 템플릿 파일을 Read로 읽는다
2. 파일 내의 코드 블록에서 실제 생성할 내용을 추출한다
3. `{{변수}}` 플레이스홀더를 config.md 값으로 치환한다
4. 대상 경로에 Write로 생성한다
5. 쉘 스크립트 파일(`.sh`)은 생성 후 `chmod +x` 실행

**치환 변수 매핑** (config.md → 템플릿):

| 변수 | config 키 |
|------|-----------|
| `{{owner}}` | owner |
| `{{repo}}` | repo |
| `{{default_branch}}` | default_branch |
| `{{agent_cmd}}` | agent_cmd |
| `{{agent_model}}` | agent_model |
| `{{agent_model_flag}}` | agent_model_flag |
| `{{bot_account}}` | bot_account |
| `{{runner_label}}` | runner_label |
| `{{test_cmd}}` | test_cmd |
| `{{lint_cmd}}` | lint_cmd |
| `{{cron_daily}}` | cron_daily |
| `{{cron_weekly}}` | cron_weekly |
| `{{daily_limit}}` | daily_limit |

**Phase 2 추가 작업**:
PROGRESS.md 생성 후, `.claude/hooks/session-start.sh`에 PROGRESS.md 출력 코드를 추가한다:
```sh
if [ -f PROGRESS.md ]; then
  echo ""
  echo "=== 프로젝트 진행 상황 ==="
  head -30 PROGRESS.md
fi
```
- 파일이 이미 존재하면: 위 코드가 이미 있는지 확인 후 없으면 append
- 파일이 없으면: 새로 생성 (`#!/bin/sh` + `set -eu` + 위 코드)

**config.md 업데이트**:
설치 완료 후 config.md의 `installed_phases` 배열에 새로 설치한 Phase 번호를 추가하고 `updated` 날짜를 갱신한다.

### Step 6: 검증 안내

설치 완료 후 아래 내용을 출력한다:

```
에이전틱 워크플로우 설치 완료!

생성된 파일 (N개):
  <파일 목록>

검증 방법:
  Phase 1: gh workflow run daily-critique.yml
  Phase 2: cat PROGRESS.md
  Phase 3: gh issue create --title "Test" --label "auto-implement"
  Phase 4: gh workflow run weekly-self-improve.yml
  Phase 5: pages.json 작성 후 gh workflow run weekly-visual-audit.yml

주의사항:
  - Phase 3의 승인 게이트: Issue 코멘트에 "@bot approve" 작성
  - Phase 4는 Phase 1 데이터 2주 축적 후 의미 있는 결과
  - Phase 5는 pages.json에 검증 대상 URL을 직접 작성해야 합니다
  - 워크플로우 secrets/vars 설정이 필요할 수 있습니다 (Agent CLI 인증 등)
```

## Do / Don't

| Do | Don't |
|----|-------|
| config.md에서 설정값 로드 후 템플릿 치환 | 하드코딩된 값을 템플릿에 직접 삽입 |
| 충돌 파일 발견 시 사용자 확인 후 처리 | Modified 상태 파일 자동 덮어쓰기 |
| Phase 의존관계를 사전에 안내 | 의존관계 미충족 Phase를 무시하고 설치 |
| 계획서를 먼저 보여주고 승인 후 생성 | 계획서 없이 바로 파일 생성 |
| 쉘 스크립트에 chmod +x 적용 | 실행 권한 없이 스크립트 생성 |
| config.md의 installed_phases 업데이트 | 설치 상태를 추적하지 않음 |
| Agent CLI 비종속적인 프롬프트 작성 | Claude Code 전용 Tool use 등 사용 |
