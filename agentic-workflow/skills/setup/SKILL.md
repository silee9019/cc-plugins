---
name: setup
description: 에이전틱 워크플로우 설정 (저장소 환경 탐지 + config 생성). 사용자가 "에이전틱 워크플로우 설정", "agentic-workflow setup", "agentic-workflow 초기화", "워크플로우 설치 준비"를 언급할 때 트리거. 메인 agentic-workflow skill 실행 전에 1회 실행.
user_invocable: true
---

# agentic-workflow 설정

대상 저장소의 환경을 자동 탐지하고, 에이전틱 워크플로우 설치에 필요한 설정 파일을 생성한다.
메인 스킬 실행 전에 1회 실행한다.

## Workflow

### Step 0: 플러그인 버전 읽기

현재 설치된 플러그인 버전을 읽어 이후 단계에서 비교/기록에 사용한다.

```sh
PLUGIN_VERSION=$(grep '"version"' "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" \
  | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
```

### Step 1: 저장소 확인

`git remote -v`로 GitHub remote 존재 여부를 확인한다.

| 케이스 | 처리 |
|--------|------|
| GitHub remote 있음 | `gh repo view --json name,owner,defaultBranchRef` 실행하여 메타데이터 수집 → Step 2 진행 |
| GitHub remote 없음 | "GitHub remote가 설정되지 않은 저장소입니다." 안내 후 중단 |
| git 저장소 아님 | "git 저장소가 아닙니다. git init 후 다시 실행해주세요." 안내 후 중단 |

### Step 2: 기존 설정 확인 및 버전 비교

`~/.claude/plugins/data/agentic-workflow-<repo>/config.md` (Step 1에서 얻은 repo 이름 사용)를 확인한다.

**`setup_version` 파싱**:

```sh
CONFIG_PATH="$HOME/.claude/plugins/data/agentic-workflow-<repo>/config.md"
if [ -f "$CONFIG_PATH" ]; then
  PREV_VERSION=$(sed -n 's/^setup_version: *"\(.*\)"$/\1/p' "$CONFIG_PATH" | head -1)
else
  PREV_VERSION=""
fi
```

**`sort -V` 호환성 탐지 + 버전 비교 함수**: memento setup의 동일 블록 참조.

**분기 처리**:

| 케이스 | 동작 |
|--------|------|
| config 없음 | 신규 설정 — Step 3으로 진행 |
| config 있음 + `setup_version` 없음 | "이전 버전 기록 없음 — 업그레이드로 간주합니다" 안내 + 기존 값을 기본값으로 사용 |
| `PREV_VERSION` == `PLUGIN_VERSION` | "이미 최신 버전입니다 (`<PLUGIN_VERSION>`)" 안내, AskUserQuestion으로 **계속/취소** |
| `PREV_VERSION` < `PLUGIN_VERSION` | 업그레이드 알림 출력 + 기존 값을 기본값으로 유지하며 진행 |
| `PREV_VERSION` > `PLUGIN_VERSION` | "설정 파일이 플러그인보다 높은 버전입니다" 경고 + 사용자 확인 후 진행 |

**업그레이드 알림 블록**:

```
⬆ 플러그인 업그레이드 감지: <PREV_VERSION> → <PLUGIN_VERSION>
이전 설정을 기본값으로 유지하며 재설정을 진행합니다.
필요한 경우 각 단계에서 값을 조정할 수 있습니다.
```

### Step 3: 전제 조건 검증

아래 항목을 순서대로 확인한다. 하나라도 실패하면 해당 안내를 출력하고 중단.

1. **gh CLI 인증**: `gh auth status` 실행
   - 실패 시: "gh auth login으로 인증 후 다시 실행해주세요."
2. **GitHub Actions 활성화**: `gh api repos/{owner}/{repo}/actions/permissions` 실행
   - 비활성화 시: "GitHub Actions가 비활성화되어 있습니다. Settings > Actions에서 활성화해주세요."
3. **CLAUDE.md 존재**: 레포 루트에 `CLAUDE.md` 파일 존재 여부 확인
   - 없음 시: **경고만** 출력 (중단하지 않음). "CLAUDE.md가 없습니다. 에이전트가 코딩 가이드를 참조하지 못할 수 있습니다."

### Step 4: 환경 자동 탐지

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
| 여러 개 발견 | Step 5에서 AskUserQuestion으로 선택 |
| 없음 | Step 5에서 직접 입력 요청 |

**기존 워크플로우 스캔**:

`.github/workflows/` 디렉토리의 파일 목록을 확인하여 기존 자동화 현황을 파악한다.
기존 bot 계정이 있는지 `gh api repos/{owner}/{repo}/collaborators --jq '.[].login'`에서 `[bot]` 접미사를 탐색한다.

**기본 브랜치**: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`

### Step 5: 설정값 수집

Step 4의 탐지 결과를 기본값으로 제시하고 AskUserQuestion으로 확인/수정을 요청한다.
**기존 config가 있으면 해당 값을 Step 4 탐지 결과보다 우선하여 기본값으로 제시한다.**

**수집 항목**:

| 항목 | 설명 | 기본값 |
|------|------|--------|
| agent_cli | 사용할 에이전트 CLI 이름 | 기존 config > Step 4 탐지 결과 |
| agent_cmd | CLI 실행 명령 | 기존 config > Step 4 탐지 결과 |
| agent_model | 모델명 (선택) | 기존 config > (빈 문자열) |
| agent_model_flag | 모델 지정 플래그 | 기존 config > `--model` |
| bot_account | Bot 계정명 | 기존 config > Step 4 탐지 결과 또는 빈 문자열 |
| runner_label | GitHub Actions runner 라벨 | 기존 config > `ubuntu-latest` |
| test_cmd | 테스트 실행 명령 | 기존 config > Step 4 탐지 결과 |
| lint_cmd | 린트 실행 명령 | 기존 config > Step 4 탐지 결과 |
| cron_daily | Daily 워크플로우 cron 표현식 | 기존 config > `0 4 * * *` (UTC 04:00) |
| cron_weekly | Weekly 워크플로우 cron 표현식 | 기존 config > `0 1 * * 0` (UTC 01:00 일요일) |
| daily_limit | Phase 3 일일 이슈 처리 상한 | 기존 config > `3` |

### Step 6: config.md 생성

`~/.claude/plugins/data/agentic-workflow-<repo>/config.md` 경로에 설정 파일을 생성한다.
디렉토리가 없으면 먼저 생성.

**config.md 형식** (frontmatter 최상단에 `setup_version` 추가):

```yaml
---
# Plugin version (auto-managed by setup skill)
setup_version: "<PLUGIN_VERSION>"

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

`installed_phases`는 기존 config가 있으면 해당 값을 유지한다(재설치 여부 판단용).
`created`도 기존 값을 유지, `updated`만 오늘 날짜로 갱신.

### Step 7: 설정 요약 출력

설정 완료 후 아래 형식으로 요약을 출력한다:

```
agentic-workflow 설정 완료:
  setup_version: <PLUGIN_VERSION>
  저장소:      <owner>/<repo> (<branch>)
  Agent CLI:   <agent_cmd>
  Runner:      <runner_label>
  테스트:      <test_cmd>
  린트:        <lint_cmd>
  Daily cron:  <cron_daily>
  Weekly cron: <cron_weekly>
  일일 상한:   <daily_limit>
  config:      ~/.claude/plugins/data/agentic-workflow-<repo>/config.md

다음 단계: "에이전틱 워크플로우 설치" 또는 agentic-workflow skill로 Phase를 선택하여 설치하세요.
```
