---
description: 에이전틱 워크플로우 설정 (저장소 환경 탐지 + config 생성)
allowed-tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
---

# agentic-workflow 설정

대상 저장소의 환경을 자동 탐지하고, 에이전틱 워크플로우 설치에 필요한 설정 파일을 생성한다.
메인 스킬 실행 전에 1회 실행한다.

## Workflow

### Step 1: 저장소 확인

`git remote -v`로 GitHub remote 존재 여부를 확인한다.

| 케이스 | 처리 |
|--------|------|
| GitHub remote 있음 | `gh repo view --json name,owner,defaultBranchRef` 실행하여 메타데이터 수집 → Step 2 진행 |
| GitHub remote 없음 | "GitHub remote가 설정되지 않은 저장소입니다." 안내 후 중단 |
| git 저장소 아님 | "git 저장소가 아닙니다. git init 후 다시 실행해주세요." 안내 후 중단 |

### Step 2: 전제 조건 검증

아래 항목을 순서대로 확인한다. 하나라도 실패하면 해당 안내를 출력하고 중단.

1. **gh CLI 인증**: `gh auth status` 실행
   - 실패 시: "gh auth login으로 인증 후 다시 실행해주세요."
2. **GitHub Actions 활성화**: `gh api repos/{owner}/{repo}/actions/permissions` 실행
   - 비활성화 시: "GitHub Actions가 비활성화되어 있습니다. Settings > Actions에서 활성화해주세요."
3. **CLAUDE.md 존재**: 레포 루트에 `CLAUDE.md` 파일 존재 여부 확인
   - 없음 시: **경고만** 출력 (중단하지 않음). "CLAUDE.md가 없습니다. 에이전트가 코딩 가이드를 참조하지 못할 수 있습니다."

### Step 3: 환경 자동 탐지

아래 항목을 자동 탐지하여 기본값으로 사용한다.

**빌드 도구 탐지**:

| 파일 | 판정 | 기본 test_cmd | 기본 lint_cmd |
|------|------|---------------|---------------|
| `package.json` + `pnpm-lock.yaml` | pnpm | `pnpm test` | `pnpm run lint` |
| `package.json` + `yarn.lock` | yarn | `yarn test` | `yarn lint` |
| `package.json` | npm | `npm test` | `npm run lint` |
| `build.gradle` 또는 `build.gradle.kts` | gradle | `./gradlew test` | `./gradlew ktlintCheck` |
| `Cargo.toml` | cargo | `cargo test` | `cargo clippy` |
| `go.mod` | go | `go test ./...` | `golangci-lint run` |
| `pyproject.toml` 또는 `setup.py` | python | `pytest` | `ruff check .` |
| 그 외 | 미탐지 | (사용자 입력 필수) | (사용자 입력 필수) |

**에이전트 CLI 탐지**:

`which claude`, `which codex`, `which gemini` 순서로 실행하여 설치된 CLI를 탐지한다.

| CLI | agent_cmd 기본값 |
|-----|-----------------|
| claude | `claude -p` |
| codex | `codex` |
| gemini | `gemini` |
| 여러 개 발견 | Step 4에서 AskUserQuestion으로 선택 |
| 없음 | Step 4에서 직접 입력 요청 |

**기존 워크플로우 스캔**:

`.github/workflows/` 디렉토리의 파일 목록을 확인하여 기존 자동화 현황을 파악한다.
기존 bot 계정이 있는지 `gh api repos/{owner}/{repo}/collaborators --jq '.[].login'`에서 `[bot]` 접미사를 탐색한다.

**기본 브랜치**: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`

### Step 4: 설정값 수집

Step 3의 탐지 결과를 기본값으로 제시하고 AskUserQuestion으로 확인/수정을 요청한다.

**수집 항목**:

| 항목 | 설명 | 기본값 |
|------|------|--------|
| agent_cli | 사용할 에이전트 CLI 이름 | Step 3 탐지 결과 |
| agent_cmd | CLI 실행 명령 | Step 3 탐지 결과 |
| agent_model | 모델명 (선택) | (빈 문자열) |
| agent_model_flag | 모델 지정 플래그 | `--model` |
| bot_account | Bot 계정명 | Step 3 탐지 결과 또는 빈 문자열 |
| runner_label | GitHub Actions runner 라벨 | `ubuntu-latest` |
| test_cmd | 테스트 실행 명령 | Step 3 탐지 결과 |
| lint_cmd | 린트 실행 명령 | Step 3 탐지 결과 |
| cron_daily | Daily 워크플로우 cron 표현식 | `0 4 * * *` (UTC 04:00) |
| cron_weekly | Weekly 워크플로우 cron 표현식 | `0 1 * * 0` (UTC 01:00 일요일) |
| daily_limit | Phase 3 일일 이슈 처리 상한 | `3` |

### Step 5: config.md 생성

`~/.claude/plugins/data/agentic-workflow-<repo>/config.md` 경로에 설정 파일을 생성한다.
디렉토리가 없으면 먼저 생성.

**config.md 형식**:

```yaml
---
# Repository
owner: "<owner>"
repo: "<repo>"
default_branch: "<branch>"

# Agent CLI
agent_cli: "<cli>"
agent_cmd: "<cmd>"
agent_model: "<model>"
agent_model_flag: "<flag>"

# CI/CD
bot_account: "<account>"
runner_label: "<label>"
test_cmd: "<cmd>"
lint_cmd: "<cmd>"

# Schedule
cron_daily: "<cron>"
cron_weekly: "<cron>"

# Limits
daily_limit: <number>

# Installed phases
installed_phases: []

# Metadata
created: "<YYYY-MM-DD>"
updated: "<YYYY-MM-DD>"
---
```

### Step 6: 설정 요약 출력

설정 완료 후 아래 형식으로 요약을 출력한다:

```
agentic-workflow 설정 완료:
  저장소:      <owner>/<repo> (<branch>)
  Agent CLI:   <agent_cmd>
  Runner:      <runner_label>
  테스트:      <test_cmd>
  린트:        <lint_cmd>
  Daily cron:  <cron_daily>
  Weekly cron: <cron_weekly>
  일일 상한:   <daily_limit>
  config:      ~/.claude/plugins/data/agentic-workflow-<repo>/config.md

다음 단계: "에이전틱 워크플로우 설치" 또는 /agentic-workflow:agentic-workflow 로 Phase를 선택하여 설치하세요.
```
