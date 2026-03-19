# Phase 상세 사양

SKILL.md의 워크플로우에서 참조하는 Phase별 상세 사양 문서.

## Phase 간 의존 관계

```
Phase 1 (Daily Self-Critique)     독립
Phase 2 (PROGRESS.md)             독립
Phase 3 (Issue Pipeline)          독립
Phase 4 (Weekly Self-Improve)  →  Phase 1 필수 (metrics 데이터 소비)
Phase 5 (Visual Audit)            독립 (웹앱 저장소만 해당)
```

---

## Phase 1: Daily Self-Critique

**목적**: Bot/에이전트가 만든 PR의 품질을 매일 자동 평가하는 피드백 루프.

### 생성 파일

| 대상 경로 | 템플릿 | 설명 |
|-----------|--------|------|
| `.github/workflows/daily-critique.yml` | `phase-1/workflow.yml.md` | Actions 워크플로우 |
| `.github/workflows/daily-critique/run.sh` | `phase-1/run.sh.md` | 오케스트레이터 |
| `.github/workflows/daily-critique/collect-outputs.sh` | `phase-1/collect-outputs.sh.md` | bot PR 수집 |
| `.github/workflows/daily-critique/critique-prompt.md` | `phase-1/critique-prompt.md` | 평가 프롬프트 |
| `.agentic-workflow/metrics/.gitkeep` | (빈 파일) | 메트릭 저장소 |

### 치환 변수

| 변수 | 용도 |
|------|------|
| `{{owner}}` | GitHub owner |
| `{{repo}}` | 저장소 이름 |
| `{{agent_cmd}}` | Agent CLI 실행 명령 |
| `{{agent_model}}` | 모델명 |
| `{{agent_model_flag}}` | 모델 지정 플래그 |
| `{{bot_account}}` | 평가 대상 bot 계정명 |
| `{{runner_label}}` | Actions runner 라벨 |
| `{{cron_daily}}` | Daily cron 표현식 |

### 트리거 및 스케줄

- **cron**: `{{cron_daily}}` (기본 UTC 04:00)
- **workflow_dispatch**: 수동 실행 지원

### 핵심 동작

1. `collect-outputs.sh`가 `gh pr list --author "{{bot_account}}"` 로 어제 bot PR 수집
2. Agent CLI로 `critique-prompt.md` 실행 → 5개 카테고리 점수
3. 70점 미만 항목 → `gh issue create` (라벨: `self-critique`, `improvement`)
4. `.agentic-workflow/metrics/daily-critique-{date}.json` 커밋

### bot_account가 비어있는 경우

Phase 3가 설치되어 있으면 `auto-implement` 관련 라벨이 있는 PR을 대상으로 수집.
Phase 3도 없으면 "평가 대상 PR이 없습니다" 안내 후 종료.

### 검증 방법

```bash
gh workflow run daily-critique.yml
# → .agentic-workflow/metrics/daily-critique-{date}.json 생성 확인
# → 70점 미만 시 Issue 생성 확인
```

---

## Phase 2: PROGRESS.md 자동 관리

**목적**: 프로젝트 진행 상황을 자동 추적하는 문서. 에이전트/사람 모두 세션 시작 시 참조.

### 생성 파일

| 대상 경로 | 템플릿 | 설명 |
|-----------|--------|------|
| `PROGRESS.md` | `phase-2/PROGRESS.md.md` | 진행 상황 문서 |

### 치환 변수

| 변수 | 용도 |
|------|------|
| `{{owner}}` | GitHub owner |
| `{{repo}}` | 저장소 이름 |

### 추가 작업

PROGRESS.md 생성 후, `.claude/hooks/session-start.sh`에 아래 코드를 추가한다:

```sh
if [ -f PROGRESS.md ]; then
  echo ""
  echo "=== 프로젝트 진행 상황 ==="
  head -30 PROGRESS.md
fi
```

- 파일이 이미 존재하면 기존 내용 뒤에 append
- 파일이 없으면 새로 생성

### 업데이트 메커니즘

PROGRESS.md의 내용은 다른 Phase의 스크립트에서 자동 업데이트:
- **Phase 1** `run.sh` → "자기 비판 트렌드" 섹션 주간 평균 반영
- **Phase 3** `run.sh` → "활성 작업" 섹션 업데이트, PR 머지 시 "최근 완료" 추가

### 검증 방법

```bash
# PROGRESS.md 존재 확인
cat PROGRESS.md
# Claude Code 세션 시작 시 PROGRESS.md 내용 출력 확인
```

---

## Phase 3: Issue Pipeline (이슈 기반 자동 구현)

**목적**: GitHub Issue → 계획 → 승인 → 구현 → 검증 → PR 전체 자동화.

### 생성 파일

| 대상 경로 | 템플릿 | 설명 |
|-----------|--------|------|
| `.github/workflows/issue-pipeline.yml` | `phase-3/workflow.yml.md` | Actions 워크플로우 |
| `.github/workflows/issue-pipeline/run.sh` | `phase-3/run.sh.md` | 5단계 오케스트레이터 |
| `.github/workflows/issue-pipeline/queue.sh` | `phase-3/queue.sh.md` | 라벨 기반 큐 관리 |
| `.github/workflows/issue-pipeline/plan-prompt.md` | `phase-3/plan-prompt.md` | 계획 프롬프트 |
| `.github/workflows/issue-pipeline/implement-prompt.md` | `phase-3/implement-prompt.md` | 구현 프롬프트 |
| `.github/workflows/issue-pipeline/verify-prompt.md` | `phase-3/verify-prompt.md` | 검증 프롬프트 |

### 치환 변수

| 변수 | 용도 |
|------|------|
| `{{owner}}` | GitHub owner |
| `{{repo}}` | 저장소 이름 |
| `{{default_branch}}` | 기본 브랜치 |
| `{{agent_cmd}}` | Agent CLI 실행 명령 |
| `{{agent_model}}` | 모델명 |
| `{{agent_model_flag}}` | 모델 지정 플래그 |
| `{{bot_account}}` | Bot 계정명 |
| `{{runner_label}}` | Actions runner 라벨 |
| `{{test_cmd}}` | 테스트 실행 명령 |
| `{{lint_cmd}}` | 린트 실행 명령 |
| `{{daily_limit}}` | 일일 이슈 처리 상한 |

### 트리거

- `issues`: labeled (`auto-implement`)
- `issue_comment`: created (승인 코멘트 감지)
- `schedule`: 15분마다 (큐 처리)
- `workflow_dispatch`: 수동 실행

### 라벨 흐름

```
auto-implement → auto-plan-ready → auto-in-progress → (라벨 제거)
```

| 라벨 | 의미 | 전환 시점 |
|------|------|-----------|
| `auto-implement` | 큐 진입 | 사용자가 Issue에 부착 |
| `auto-plan-ready` | 계획 완료, 승인 대기 | Step 2 완료 후 |
| `auto-in-progress` | 구현 진행 중 | Step 4 시작 시 |
| (제거) | 완료 또는 실패 | Step 5 또는 실패 시 |

### 5단계 파이프라인

1. **큐 획득**: `queue.sh` → 처리할 이슈 번호 반환
2. **계획**: Agent CLI + `plan-prompt.md` → `plan.md` → Issue 코멘트로 게시
3. **승인 대기**: `@bot approve` 코멘트 확인 (없으면 다음 cron에서 재시도)
4. **구현**: 새 브랜치 `feature/auto/{issue}-{slug}` → Agent CLI + `implement-prompt.md` → 커밋 + 푸시
5. **검증**: Agent CLI + `verify-prompt.md` → 테스트/린트 → 성공 시 PR 생성, 실패 시 롤백

### 검증 방법

```bash
# 1. 테스트 Issue 생성 + auto-implement 라벨 부착
gh issue create --title "Test auto-implement" --label "auto-implement"
# 2. 15분 이내 계획 코멘트 게시 확인
# 3. @bot approve 코멘트 후 구현 → 테스트 → PR 생성 확인
```

---

## Phase 4: Weekly Self-Improvement

**목적**: Phase 1의 metrics를 분석해서 에이전트/프롬프트/가이드라인 자체를 개선.

### 생성 파일

| 대상 경로 | 템플릿 | 설명 |
|-----------|--------|------|
| `.github/workflows/weekly-self-improve.yml` | `phase-4/workflow.yml.md` | Actions 워크플로우 |
| `.github/workflows/weekly-self-improve/run.sh` | `phase-4/run.sh.md` | 오케스트레이터 |
| `.github/workflows/weekly-self-improve/improve-prompt.md` | `phase-4/improve-prompt.md` | 개선 분석 프롬프트 |
| `.claude/agents/meta-evaluator.md` | `phase-4/meta-evaluator.md` | 에이전트 품질 평가 |
| `.claude/agents/pattern-detector.md` | `phase-4/pattern-detector.md` | 패턴 감지 에이전트 |

### 전제 조건

- **Phase 1 설치 필수**: `.agentic-workflow/metrics/daily-critique-*.json` 데이터 소비
- **의미 있는 결과를 위해 2주 이상 Phase 1 데이터 축적 권장**

### 치환 변수

| 변수 | 용도 |
|------|------|
| `{{owner}}` | GitHub owner |
| `{{repo}}` | 저장소 이름 |
| `{{default_branch}}` | 기본 브랜치 |
| `{{agent_cmd}}` | Agent CLI 실행 명령 |
| `{{agent_model}}` | 모델명 |
| `{{agent_model_flag}}` | 모델 지정 플래그 |
| `{{runner_label}}` | Actions runner 라벨 |
| `{{cron_weekly}}` | Weekly cron 표현식 |

### 핵심 동작

1. 최근 7일 `daily-critique-*.json` 수집
2. 반복 패턴 식별 (같은 카테고리 70점 미만 3회 이상)
3. CLAUDE.md, coding-guide, agents, skills 파일 분석
4. 개선 PR 생성 (`chore/self-improve-{date}`)

### 검증 방법

```bash
gh workflow run weekly-self-improve.yml
# → chore/self-improve-{date} 브랜치 + PR 생성 확인
# → 메트릭이 없으면 "데이터 부족" 메시지 확인
```

---

## Phase 5: Visual Audit (스크린샷 UI 검증)

**목적**: 웹앱 페이지를 스크린샷으로 캡처 후 Vision API로 UI 품질 검증.

### 생성 파일

| 대상 경로 | 템플릿 | 설명 |
|-----------|--------|------|
| `.github/workflows/weekly-visual-audit.yml` | `phase-5/workflow.yml.md` | Actions 워크플로우 |
| `.github/workflows/weekly-visual-audit/run.sh` | `phase-5/run.sh.md` | 오케스트레이터 |
| `.github/workflows/weekly-visual-audit/pages.json` | `phase-5/pages.json.md` | 검증 대상 페이지 목록 |
| `.github/workflows/weekly-visual-audit/audit-prompt.md` | `phase-5/audit-prompt.md` | Vision 분석 프롬프트 |

### 전제 조건

- **웹앱이 있는 저장소만 해당**
- Playwright (Node.js) 실행 가능한 환경
- `pages.json`에 검증 대상 URL을 사용자가 직접 작성

### 치환 변수

| 변수 | 용도 |
|------|------|
| `{{owner}}` | GitHub owner |
| `{{repo}}` | 저장소 이름 |
| `{{agent_cmd}}` | Agent CLI 실행 명령 |
| `{{agent_model}}` | 모델명 |
| `{{agent_model_flag}}` | 모델 지정 플래그 |
| `{{runner_label}}` | Actions runner 라벨 |
| `{{cron_weekly}}` | Weekly cron 표현식 |

### 핵심 동작

1. `pages.json`에서 URL 목록 읽기
2. 각 URL에 대해 Playwright로 스크린샷 캡처
3. Agent CLI + Vision으로 5개 카테고리 분석 (레이아웃, 반응형, 접근성, 일관성, 상태)
4. 문제 발견 시 `gh issue create` (라벨: `visual-audit`)

### 검증 방법

```bash
# pages.json에 검증 대상 URL 작성 후
gh workflow run weekly-visual-audit.yml
# → 스크린샷 캡처 + 분석 결과 확인
# → 문제 발견 시 Issue 생성 확인
```

---

## Agent CLI별 호출 패턴

템플릿에서 생성된 `run.sh`는 환경변수로 CLI 명령을 주입받는다:

| CLI | AGENT_CMD | 프롬프트 전달 | 모델 지정 |
|-----|-----------|--------------|----------|
| Claude Code | `claude -p` | stdin redirect (`< prompt.md`) | `--model claude-sonnet-4-6` |
| Codex | `codex` | `--prompt-file prompt.md` | `--model gpt-4o` |
| Gemini CLI | `gemini` | stdin redirect (`< prompt.md`) | `--model gemini-2.5-pro` |

**주의**: 각 CLI의 프롬프트 전달 방식이 다르므로, `run.sh` 내의 실행 부분은 `${AGENT_CMD}` 환경변수에 전체 명령을 포함하는 방식으로 설계. 필요 시 `config.md`의 `agent_cmd`를 `claude -p --print` 등으로 커스터마이즈.
