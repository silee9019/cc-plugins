# Agentic Workflow

GitHub 저장소에 에이전틱 워크플로우를 설치하는 Claude Code 플러그인.
저장소 환경을 자동 탐지하고, 5개 Phase를 선택적으로 설치한다.

**Agent CLI 비종속** — Claude Code, Codex, Gemini CLI 등 어떤 에이전트 CLI든 사용 가능.

## Phase 개요

| Phase | 이름 | 설명 | 전제 조건 |
|-------|------|------|-----------|
| 1 | Daily Self-Critique | Bot/에이전트 PR 품질을 매일 자동 평가 | 없음 |
| 2 | PROGRESS.md | 프로젝트 진행 상황 자동 추적 문서 | 없음 |
| 3 | Issue Pipeline | 이슈 → 계획 → 승인 → 구현 → 검증 → PR | 없음 |
| 4 | Weekly Self-Improve | Phase 1 metrics 분석 → 가이드라인 자동 개선 | Phase 1 |
| 5 | Visual Audit | 웹앱 스크린샷 → Vision AI 품질 검증 | 웹앱 저장소만 |

```
Phase 1 ──→ Phase 4 (2주 데이터 축적 후)
Phase 2 ── 독립
Phase 3 ── 독립
Phase 5 ── 독립 (웹앱만)
```

## 사용법

### 1. 설정 (1회)

```
/agentic-workflow:setup
```

저장소의 빌드 도구, 에이전트 CLI, runner 라벨 등을 자동 탐지하여 config를 생성한다.

### 2. Phase 설치

```
에이전틱 워크플로우 설치해줘
```

또는 명시 호출:

```
/agentic-workflow:agentic-workflow
```

Phase 선택 → 계획서 생성 → 사용자 검토 → 승인 후 파일 생성.

### 3. 추가 설치

이미 Phase 1-3을 설치한 상태에서 Phase 4를 추가할 수 있다:

```
Phase 4 추가 설치해줘
```

`installed_phases` 배열로 설치 상태를 추적하므로, 이미 설치된 Phase는 건너뛴다.

## 생성되는 파일

Phase 설치 시 대상 저장소에 아래 파일들이 생성된다:

### Phase 1: Daily Self-Critique (5개)

```
.github/workflows/daily-critique.yml
.github/workflows/daily-critique/run.sh
.github/workflows/daily-critique/collect-outputs.sh
.github/workflows/daily-critique/critique-prompt.md
.agentic-workflow/metrics/.gitkeep
```

### Phase 2: PROGRESS.md (1개)

```
PROGRESS.md
```

### Phase 3: Issue Pipeline (6개)

```
.github/workflows/issue-pipeline.yml
.github/workflows/issue-pipeline/run.sh
.github/workflows/issue-pipeline/queue.sh
.github/workflows/issue-pipeline/plan-prompt.md
.github/workflows/issue-pipeline/implement-prompt.md
.github/workflows/issue-pipeline/verify-prompt.md
```

### Phase 4: Weekly Self-Improve (5개)

```
.github/workflows/weekly-self-improve.yml
.github/workflows/weekly-self-improve/run.sh
.github/workflows/weekly-self-improve/improve-prompt.md
.claude/agents/meta-evaluator.md
.claude/agents/pattern-detector.md
```

### Phase 5: Visual Audit (4개)

```
.github/workflows/weekly-visual-audit.yml
.github/workflows/weekly-visual-audit/run.sh
.github/workflows/weekly-visual-audit/pages.json
.github/workflows/weekly-visual-audit/audit-prompt.md
```

## Agent CLI 비종속 설계

설정 시 에이전트 CLI를 선택한다. 생성되는 워크플로우와 프롬프트는 특정 CLI에 종속되지 않는다.

| CLI | agent_cmd 예시 |
|-----|---------------|
| Claude Code | `claude -p` |
| Codex | `codex` |
| Gemini CLI | `gemini` |

프롬프트 파일은 범용 마크다운으로 작성되어 어떤 LLM에서든 동작한다.
`run.sh`에서 `${AGENT_CMD}` 환경변수로 CLI 명령을 주입받는 패턴을 사용한다.

## 설정 파일

```
~/.claude/plugins/data/agentic-workflow-<repo>/config.md
```

YAML frontmatter로 저장소별 설정을 관리한다:

```yaml
---
owner: "silee9019"
repo: "my-project"
default_branch: "main"
agent_cli: "claude"
agent_cmd: "claude -p"
runner_label: "ubuntu-latest"
test_cmd: "pnpm test"
lint_cmd: "pnpm run lint"
cron_daily: "0 4 * * *"
cron_weekly: "0 1 * * 0"
daily_limit: 3
installed_phases: [1, 2, 3]
---
```

## Issue Pipeline 라벨 흐름 (Phase 3)

```
auto-implement → auto-plan-ready → auto-in-progress → (라벨 제거)
```

1. 사용자가 Issue에 `auto-implement` 라벨 부착
2. 에이전트가 계획 수립 → Issue 코멘트로 게시 → `auto-plan-ready`
3. 사용자가 `@bot approve` 코멘트
4. 에이전트가 구현 → `auto-in-progress`
5. 테스트/린트 검증 → PR 생성 → 라벨 제거

## 의존성

- `gh` CLI (GitHub API 접근)
- Agent CLI (claude/codex/gemini 중 하나)
- GitHub Actions runner

## Install

```
/plugin marketplace add silee9019/cc-plugins
/plugin install agentic-workflow
```
