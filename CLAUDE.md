# cc-plugins

Claude Code 플러그인 모노레포.

## 프로젝트 구조

```
cc-plugins/
├── .claude-plugin/marketplace.json   ← 중앙 카탈로그 (모든 플러그인 등록)
├── git-init/                         ← command: GitHub 저장소 초기화
├── andrej-karpathy-skills/           ← skill: LLM 코딩 실수 방지 가이드라인
├── claude-statusline/                ← hook: 2줄 HUD statusline
├── memento/                          ← skill+hook+command: 세션 간 컨텍스트 보존(Memory) + 하루 계획·캡처·회고·인계(Mentor)
├── agentic-workflow/                 ← skill+command: 에이전틱 워크플로우 scaffold
├── tutor/                            ← command: 학습 노트 생성 + 4지선다 퀴즈 튜터
├── knowledge-tools/                  ← skill: 온톨로지 워크숍 + 문서 공유
└── resume-coach/                     ← skill: 이력서 작성 + 모의 면접 + 커리어 멘토링
```

각 플러그인은 독립 디렉토리에 `.claude-plugin/plugin.json` + 컴포넌트(command/skill/hook)로 구성.

## Coding Guide

### Shell Script: POSIX sh 호환성

플러그인의 모든 shell script는 **POSIX sh** 호환으로 작성한다.

- shebang: `#!/bin/sh`
- `set -eu` 필수
- **금지 문법** (bash/zsh 전용):
  - `[[ ]]` → `[ ]` 또는 `case` 사용
  - 배열 (`arr=()`, `${arr[@]}`) → 위치 매개변수(`$@`) 또는 문자열 분리 사용
  - `BASH_REMATCH` / `=~` → `expr`, `sed`, `case` 패턴으로 대체
  - `read -ra` → `IFS= read -r` + 수동 분리
  - `local -a` → `local` (배열 선언 불가)
  - `${var,,}` / `${var^^}` → `tr` 사용
  - `<<<` (here string) → `printf '%s' "$var" | ...`
  - `(( ))` 산술 → `$((  ))` 또는 `[ "$a" -gt "$b" ]`
  - `function foo()` → `foo()` (function 키워드 생략)
- **허용 문법**:
  - `local` (POSIX 표준은 아니나 모든 주요 sh 구현에서 지원)
  - `$(command)` 명령 치환
  - `${var#pattern}`, `${var%pattern}` 파라미터 확장

## A. 새 플러그인 추가 절차

### 1. 디렉토리 생성

```
<plugin-name>/
├── .claude-plugin/plugin.json
├── commands/<name>.md             ← command 타입
├── skills/<name>/SKILL.md         ← skill 타입
└── hooks/hooks.json               ← hook 타입
```

플러그인 이름은 kebab-case. 컴포넌트는 필요한 유형만 생성.

### 2. plugin.json

```jsonc
{
  "name": "<plugin-name>",           // 필수
  "description": "<설명>",           // 필수
  "version": "1.0.0",               // 필수, SemVer
  "author": { "name": "silee9019" }, // 필수
  "keywords": ["..."],              // 선택
  "license": "MIT",                 // 선택 (외부 기여 시)
  "commands": ["./commands"],       // command 타입만
  "skills": ["./skills/<name>"]     // skill 타입만
}
```

hook 타입은 `hooks/hooks.json` 존재만으로 자동 인식됨 — plugin.json에 선언하면 중복 로딩 에러 발생.

### 3. 컴포넌트 작성

**Command** (`commands/<name>.md`):

```yaml
---
description: <설명>
allowed-tools: Bash, Write, Read, AskUserQuestion
argument-hint: <인자 힌트>
---
```

본문에 `## Workflow` → `### Step N:` 형식으로 단계별 지시사항 작성.

**Skill** (`skills/<name>/SKILL.md`):

```yaml
---
name: <skill-name>
description: |
  <트리거 조건 포함 설명. 사용자 발화 키워드 나열.>
---
```

본문에 트리거 조건, 인자 표, 실행 로직 작성.

**Hook** (`hooks/hooks.json`):

```json
{
  "description": "<설명>",
  "hooks": {
    "SessionStart": [{
      "hooks": [{ "type": "command", "command": "<명령>" }]
    }]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}`로 플러그인 루트 경로 참조. 스크립트는 `scripts/`에 배치.

### 4. marketplace.json 등록

`.claude-plugin/marketplace.json`의 `plugins` 배열에 추가:

```json
{
  "name": "<plugin-name>",
  "source": "./<plugin-name>",
  "description": "<plugin.json과 동일>",
  "version": "1.0.0",
  "author": { "name": "silee9019" },
  "keywords": ["..."],
  "category": "workflow | utility"
}
```

- **version은 plugin.json과 반드시 일치**
- category: `workflow` (작업 프로세스 안내) / `utility` (인프라/자동화)

### 5. 커밋

```
feat(<plugin-name>): add <plugin-name> plugin for <목적>
```

## B. 기존 플러그인 수정 절차

### 1. 수정 유형별 버전

| 유형 | 예시 | 버전 변경 | 커밋 접두사 |
|------|------|----------|-------------|
| 문구/오타 수정 | 설명 변경, 오타 | patch (x.y.**Z**) | `fix(<plugin>):` |
| 내부 리팩토링 | 코드 정리 (동작 동일) | patch | `refactor(<plugin>):` |
| 내부 동작 변경 (사용자 체감 무) | 경로 해석 방식, 내부 Step 재구성 | patch | `fix(<plugin>):` |
| 보조 기능 추가 | UX 개선, 훅, 보조 Step | patch | `feat(<plugin>):` |
| 핵심 기능 추가 | 새 커맨드, 새 스킬, 핵심 워크플로우 변경 | minor (x.**Y**.0) | `feat(<plugin>):` |
| 호환 깨짐 | 인자 삭제, 동작 변경 | major (**X**.0.0) | `feat(<plugin>)!:` |
| 비기능 변경 | 버전 범프, 문서만 | — | `chore(<plugin>):` |

### 2. 버전 동기화 (필수)

두 파일을 **반드시** 같이 수정:

1. `<plugin-name>/.claude-plugin/plugin.json` → `"version"`
2. `.claude-plugin/marketplace.json` → 해당 플러그인의 `"version"`

### 3. 수정 체크리스트

- [ ] 컴포넌트 파일 수정 완료
- [ ] plugin.json version 업데이트
- [ ] marketplace.json version **동기화** (plugin.json과 일치)
- [ ] marketplace.json description이 plugin.json과 일치
- [ ] 커밋 메시지 컨벤션 준수: `<type>(<scope>): <summary>`
- [ ] **버전 업그레이드 필수**: 플러그인 내용 수정 후 푸시 시 변경사항에 따라 major/minor/patch 버전 업그레이드. 버전 미변경 시 캐시가 갱신되지 않아 변경사항이 적용되지 않음.

## C. 플러그인 카탈로그

| 플러그인 | 버전 | 카테고리 | 컴포넌트 | 런타임 | 외부 의존성 |
|----------|------|----------|----------|--------|-------------|
| git-init | 1.4.1 | workflow | command | — | gh, curl |
| andrej-karpathy-skills | 1.0.0 | workflow | skill | — | 없음 |
| claude-statusline | 2.1.6 | utility | hook | POSIX sh + Bun(ccusage) | jq, ccusage |
| memento | 2.1.0 | workflow+utility | skill+hook+command | Bun + Python 3 | qmd, obsidian CLI, git, Jira/Atlassian MCP |
| agentic-workflow | 1.1.0 | workflow | skill + command | — | gh |
| tutor | 0.2.0 | workflow | command + skill | Python 3 | obsidian CLI |
| knowledge-tools | 0.1.1 | workflow | skill | — | pandoc |
| resume-coach | 0.1.1 | workflow | skill | — | 없음 |
| review-flow | 0.1.2 | workflow | skill | — | 없음 (WebFetch는 선택적) |

### agentic-workflow

```
agentic-workflow/
├── .claude-plugin/plugin.json
├── commands/setup.md                     ← 환경 탐지 + config 생성
└── skills/agentic-workflow/
    ├── SKILL.md                          ← Phase 선택 → 계획서 → 파일 생성
    ├── phase-reference.md                ← Phase 1-5 상세 사양
    └── templates/phase-{1..5}/           ← 생성할 파일 템플릿
```

- **수정 시**: 템플릿 변수 `{{name}}` 추가/변경 시 SKILL.md의 치환 변수 매핑과 phase-reference.md의 변수 표도 동기화
- **테스트**: 임의의 git 저장소에서 `/agentic-workflow:setup` → Phase 선택 → 파일 생성 확인
- **의존성**: `gh` CLI (인증 필요)
- **주의**:
  - Agent CLI 비종속 (Claude Code, Codex, Gemini CLI 등)
  - config.md 경로: `~/.claude/plugins/data/agentic-workflow-<repo>/config.md`
  - `installed_phases` 배열로 점진적 설치 추적

### git-init

```
git-init/
├── .claude-plugin/plugin.json
└── commands/git-init.md        ← 10단계 워크플로우
```

- **수정 시**: `git-init.md`의 Step 순서 변경 시 번호 정합성 확인
- **테스트**: `/git-init test-repo` 실행 후 GitHub에서 생성 확인, `gh repo delete`로 정리
- **의존성**: `gh` CLI (인증 필요), `curl` (gitignore.io)

### andrej-karpathy-skills

```
andrej-karpathy-skills/
├── .claude-plugin/plugin.json
├── skills/karpathy-guidelines/SKILL.md
├── EXAMPLES.md
└── README.md
```

- **수정 시**: SKILL.md의 4가지 원칙 변경 시 README.md, EXAMPLES.md도 동기화
- **테스트**: 코드 리뷰 요청 시 가이드라인이 적용되는지 확인
- **의존성**: 없음 (순수 가이드라인 문서)

### tutor

```
tutor/
├── .claude-plugin/plugin.json
├── commands/
│   └── setup.md                    ← /tutor:setup: Obsidian vault + 학습 경로 설정
├── skills/
│   ├── study-notes/SKILL.md        ← 소스 → 학습 노트 변환 (스크립트 사용)
│   └── quiz/SKILL.md               ← 4지선다 퀴즈 + 진행도 추적 (스크립트 사용)
├── scripts/
│   ├── parse_quiz.py               ← callout 파싱 + 셔플 (결정론적)
│   ├── update_mastery.py           ← mastery EMA 계산 (결정론적)
│   ├── scan_notes.py               ← 카테고리별 노트 스캔 + 메타파일 필터링
│   └── gen_dashboard.py            ← 대시보드 마크다운 생성
└── reference/
    ├── obsidian-cli-reference.md
    └── quiz-schema.md              ← 공유 퀴즈 callout 스키마
```

- **수정 시**: quiz-schema.md 변경 시 parse_quiz.py의 파싱 로직도 동기화. frontmatter 스키마 변경 시 update_mastery.py, scan_notes.py도 동기화.
- **테스트**:
  - `/tutor:setup` → config.md 생성 확인
  - study-notes 스킬 → vault에 학습 노트 생성 + 대시보드 갱신 확인
  - `/tutor:quiz <주제>` → 퀴즈 세션 + update_mastery.py 실행 확인
  - `/tutor:quiz drill` → 약점 드릴 + 이전 오답 우선 배치 확인
  - `/tutor:quiz dashboard` → scan_notes.py + gen_dashboard.py 출력 확인
  - 스크립트 단위 테스트: `echo "샘플" | python3 scripts/parse_quiz.py`
- **의존성**: Obsidian CLI (`brew install obsidian-cli`), Python 3 (표준 라이브러리만)
- **설정**: `~/.claude/plugins/data/tutor-cc-plugins/config.md`
- **주의**:
  - memento config에서 vault 이름 자동 감지 (있을 경우)
  - 학습 노트는 `> [!quiz]` callout으로 퀴즈 문항 내장 (quiz-schema.md 참조)
  - mastery 계산: 첫 퀴즈는 정답률 직접 설정, 이후 EMA (기존 60% + 이번 40%)
  - 계산/파싱/집계/셔플은 Python 스크립트로 결정론적 처리 (LLM 비결정론 보완)

### claude-statusline

```
claude-statusline/
├── .claude-plugin/plugin.json
├── hooks/hooks.json            ← SessionStart
├── scripts/
│   ├── statusline.sh           ← stdin JSON → 2줄 HUD (settings.json에서 호출)
│   ├── hook-handler.sh         ← 비용 갱신 + auto-setup
│   └── refresh-cost.ts         ← ccusage 백그라운드 실행 → 캐시 (Bun)
└── data/                       ← 런타임 (gitignore)
    └── cost-cache.json
```

- **수정 시**:
  - hooks.json은 auto-discovery → plugin.json에 hooks 필드 선언 금지
  - SessionStart 훅에서 `settings.json` statusLine 경로를 자동 갱신 (버전 변경 시 자동 적용)
- **테스트**:
  ```bash
  # 훅 테스트
  echo '{"hook_event_name":"SessionStart","session_id":"test","cwd":"/tmp"}' \
    | bash scripts/hook-handler.sh
  # statusline 렌더링 테스트
  echo '{"session_id":"test","workspace":{"current_dir":"/tmp"},"model":{"display_name":"Claude Opus 4.6"},"context_window":{"current_usage":{"input_tokens":1000,"cache_creation_input_tokens":0,"cache_read_input_tokens":0},"context_window_size":200000},"version":"1.0.0"}' \
    | bash scripts/statusline.sh 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g'
  ```
- **의존성**: jq (JSON 파싱), Bun + ccusage (비용 데이터, refresh-cost.ts에서만 사용)
- **주의**:
  - ccusage는 `refresh-cost.ts` detached 프로세스로만 실행 (캐시 TTL 5분)

### memento

```
memento/
├── .claude-plugin/plugin.json
├── commands/setup.md               ← /memento-setup: qmd 설치 확인
├── skills/
│   ├── memento-core/SKILL.md       ← 세션 라이프사이클 + 체크포인트 + 승격 규칙
│   ├── memento-compaction/SKILL.md ← 5-level 컴팩션 트리 + user ROOT 재생성
│   ├── memento-flush/SKILL.md      ← 수동 메모리 플러시
│   ├── memento-search/SKILL.md     ← 트리 탐색 + user knowledge 검색
│   └── memento-handoff/SKILL.md    ← 세션 인수인계
├── hooks/hooks.json                ← SessionStart + PreCompact + TaskCompleted
├── scripts/
│   ├── session-start.sh            ← 프로젝트/user 디렉토리 생성 + 프로토콜 전문 stdout
│   └── compact.mjs                 ← 기계적 컴팩션 + user/ROOT.md 재생성 (Bun)
└── templates/                      ← 초기 메모리 파일 템플릿 (ROOT.md, USER-ROOT.md 등)
```

- **원본**: [hipocampus](https://github.com/kevin-hs-sohn/hipocampus) v0.1.6 (MIT)
- **2-scope 3-layer 메모리**:
  - **MEMENTO_HOME**: `~/.claude/plugins/data/memento-cc-plugins/config.md`의 `vault_path`+`memento_root`로 결정. config 없으면 레거시 `~/.claude/memento/` 폴백 + deprecation 경고. **1.8.0에서 레거시 경로 제거 예정**.
  - **User Scope**: `<MEMENTO_HOME>/user/` — 크로스프로젝트 교훈/레시피 (`knowledge/*.md` + `ROOT.md`)
  - **Project Scope**: `<MEMENTO_HOME>/projects/<project-id>/` — 작업 연속성, 일일 로그, 컴팩션 트리
    - Layer 1 (System Prompt): WORKING.md, memory/ROOT.md — 세션 시작 시 자동 주입
    - Layer 2 (On-Demand): memory/YYYY-MM-DD.md, knowledge/*.md, plans/*.md
    - Layer 3 (Search): 5-level 컴팩션 트리 (raw→daily→weekly→monthly→ROOT)
- **config.md 스키마** (`~/.claude/plugins/data/memento-cc-plugins/config.md`):
  ```yaml
  ---
  setup_version: "1.7.0"
  vault_path: "/absolute/path/to/vault"
  memento_root: "_memento"
  ---
  ```
  - `memento_root` 기본값: `_memento` (언더스코어 prefix로 Obsidian 사이드바 상단 고정)
- **수정 시**:
  - session-start.sh의 프로젝트 ID 로직 변경 시 compact.mjs의 동일 로직도 동기화
  - session-start.sh의 config 파싱 로직 변경 시 compact.mjs의 `resolveMementoHome`도 동기화
  - hooks.json은 auto-discovery → plugin.json에 hooks 필드 선언 금지
  - User Scope 변경 시 session-start.sh 프로토콜 텍스트 + compact.mjs + memento-core SKILL.md 승격 규칙 3곳 동기화
- **테스트**:
  - 새 세션 시작 → MEMENTO_HOME 해석 + 프로젝트/user 디렉토리 생성 확인
  - 레거시 폴백: config 없는 상태에서 hook 실행 → deprecation 경고 2줄 출력 + `~/.claude/memento/` 사용
  - `/memento:setup` → vault 탐지 + config.md 생성 + rsync 마이그레이션 컨펌 + qmd collection 재등록 확인
  - `bun run scripts/compact.mjs` → 에러 없이 완료 확인
  - project_id 자기참조 가드: `cd <vault>/_memento/projects/test && session-start.sh` → vault 이름이 project_id로 해석되지 않는지 확인
- **의존성**: Bun, qmd (`npm install -g qmd`)
- **주의**:
  - 프로젝트/유저 데이터는 config.md가 가리키는 경로 (기본: Obsidian vault 내부 `_memento/`)
  - 스킬/스크립트/템플릿은 플러그인 디렉토리 (데이터 아님)
  - SessionStart hook stdout이 프로토콜 전문으로 세션 컨텍스트에 주입됨 — system prompt의 경로는 현재 세션에 고정, setup 후 경로 변경은 **다음 세션부터** 적용
  - Knowledge 승격: 체크포인트 시 에이전트가 프로젝트 비종속 교훈을 `<MEMENTO_HOME>/user/knowledge/`에 저장
  - 마이그레이션: `rsync -a --remove-source-files` 사용 (교차 볼륨 안전, 재실행 가능). ResilioSync 동기화 중 실행 시 일시 중지 권장.

### knowledge-tools

```
knowledge-tools/
├── .claude-plugin/plugin.json
├── skills/
│   ├── ontology-workshop/
│   │   └── SKILL.md                # 5단계 워크플로우 (현상학→온톨로지→분류학→검증→도출)
│   └── share-document/
│       ├── SKILL.md                # 마크다운→HTML 변환 (pandoc)
│       └── style.css               # 공유용 CSS
├── scripts/
│   └── preprocess.sh               # Obsidian→pandoc 전처리
├── personas/
│   ├── core/
│   │   ├── ontologist.md           # 본질 분석 (genus-differentia)
│   │   ├── sw-expert.md            # 체계 분석 (표준/업계 매핑)
│   │   └── user-proxy.md           # 경험 수집 (사용자 대리인)
│   └── bench/
│       ├── linguist.md             # 의미론, 한영 대응
│       ├── architect.md            # 경계, 관계, 생명주기
│       ├── backend-dev.md          # 코드 모델링, API 설계
│       ├── frontend-dev.md         # UI 표현, 타입 네이밍
│       ├── designer.md             # 사용자 멘탈 모델
│       ├── pm.md                   # 이해관계자, 로드맵
│       ├── qa-engineer.md          # 품질, 테스트 분류
│       ├── devops.md               # 운영, 로그, 검색성
│       ├── tech-writer.md          # 문서 일관성, 표준 용어
│       ├── test-engineer.md        # 검증 가능성, 수용 기준
│       ├── security.md             # 위협 모델, 보안 경계
│       └── data-engineer.md        # 데이터 모델, 스키마
├── templates/
│   └── decision-record.md          # Obsidian 기록 템플릿
└── reference/
    └── persona-selection.md        # 유형별 자동 선택 가이드
```

- **스킬 2개**: ontology-workshop (온톨로지 워크숍), share-document (문서 공유)
- **수정 시**: 페르소나 추가/제거 시 `reference/persona-selection.md`와 SKILL.md 벤치 멤버 테이블 동기화
- **테스트**:
  - ontology-workshop: 용어 결정 주제로 워크숍 실행 → 5단계 진행 + Obsidian vault 기록 확인
  - share-document: `/share-document <파일>` → HTML 변환 확인
- **의존성**: pandoc (share-document 스킬)
- **산출물**: `{vault}/Resources/decisions/YYYY-MM-DD-{slug}.md` (ontology-workshop)
- **주의**:
  - 투표는 목적이 아니라 검증 수단 — 정의 확립이 우선
  - 리서치 에이전트와 검증 에이전트는 반드시 분리 (hallucination 방지)
  - vault 경로는 memento config에서 읽음

### resume-coach

```
resume-coach/
├── .claude-plugin/plugin.json
└── skills/
    ├── setup/
    │   ├── SKILL.md                ← 초기 설정
    │   └── templates/              ← SOUL 페르소나 + CLAUDE.md 템플릿 (7개)
    └── coach/
        ├── SKILL.md                ← 이력서 코칭 + 모의 면접
        └── personas/              ← 면접관/멘토 페르소나 (5개)
```

- **수정 시**: 두 스킬(setup, coach) 간 교차 참조 동기화 확인
- **테스트**: 이력서 코칭 시나리오 실행 확인
- **의존성**: 없음

### review-flow

```
review-flow/
├── .claude-plugin/plugin.json
├── .gitignore                          ← .cache/claude-docs/ 제외
├── skills/
│   ├── plan-review/SKILL.md            ← 설계/계획 검토
│   ├── code-review/SKILL.md            ← 코드 변경 검토
│   └── skill-review/SKILL.md           ← 스킬/커맨드 문서 검토 (agent harness 관점)
├── reference/
│   ├── review-criteria.md              ← 범용 리뷰 기준 (3개 스킬 공유)
│   ├── intent-alignment.md             ← Priority-0 의도 정합성 공유 프로토콜
│   └── skill-review-criteria.md        ← skill-review의 기준 소스(공식 가이드)와 페치 정책
└── .cache/claude-docs/                 ← (런타임) 공식 가이드 캐시 (gitignore)
```

- **스킬 3개**: plan-review (설계), code-review (코드), skill-review (SKILL.md + 슬래시 커맨드)
- **수정 시**:
  - `review-criteria.md` 변경 시 3개 스킬 워크플로우 동기화 확인
  - `intent-alignment.md`는 3개 스킬 모두 Step 0에서 로드 — 프로토콜 변경 시 각 SKILL.md의 Step 0 설명도 동기화
  - `skill-review-criteria.md`의 페치 알고리즘/임계값 변경 시 skill-review SKILL.md의 Step 2 요약 동기화
- **테스트**:
  - plan-review: 설계 문서 입력 → Step 0 정합성 검증 → 보고서 (Fix Plan 포함) → 컨펌 대기 확인
  - code-review: `git diff` → Step 0 → 위임 판단 → 보고서 → 컨펌 대기 확인
  - skill-review: SKILL.md 입력 → 공식 가이드 페치 (캐시/라이브) → 위임+자체+codex 교차 → Fix Plan → 컨펌 대기 확인
  - 페치 실패 시뮬레이션: 네트워크 차단 → 캐시 Fallback + 경고 출력 확인
- **의존성**: 없음. `WebFetch`(skill-review), `/codex`(병렬), `pr-review-toolkit`/`gstack /review`/`plugin-dev:skill-reviewer`(선택적 위임)는 모두 있으면 활용, 없으면 자체 리뷰로 폴백
- **주의**:
  - **Priority-0 의도 정합성 원칙**: 모든 리뷰 스킬은 기술적 품질 평가 전에 사용자 의도/요구사항 정합성을 먼저 검증한다. 판정 결과가 `Clear but Misaligned` 또는 `Unclear`면 일반 리뷰를 중단하고 Fix Plan/회의 주최로 분기한다
  - **Fix Plan 컨펌 절차**: 모든 리뷰는 보고서 말미에 Fix Plan 섹션과 AskUserQuestion 컨펌 단계를 반드시 포함. 사용자가 **컨펌/피드백/부분 승인** 중 하나를 선택하지 않으면 수정을 진행하지 않는다
  - **skill-review 공식 가이드 페치**: 매 실행마다 `https://code.claude.com/docs/llms.txt`를 라이브 페치, 성공 시 `${CLAUDE_PLUGIN_ROOT}/.cache/claude-docs/`에 24h TTL로 캐시. 페치 실패가 누적(≥3회 또는 >72h)되면 경고 + Tentative 플래그, 더 누적(≥5회 또는 >7d)되면 사용자 중단 가능 알림
  - code-review는 pr-review-toolkit / gstack /review가 있으면 우선 위임
  - codex 병렬 리뷰는 3개 스킬 모두 선택적 — 없으면 건너뜀
  - 보고서는 왜(Why)/무엇을(What)/어떻게(How) 3축 구조 + Fix Plan

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

