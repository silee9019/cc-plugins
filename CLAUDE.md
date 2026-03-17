# cc-plugins

Claude Code 플러그인 모노레포.

## 프로젝트 구조

```
cc-plugins/
├── .claude-plugin/marketplace.json   ← 중앙 카탈로그 (모든 플러그인 등록)
├── git-init/                         ← command: GitHub 저장소 초기화
├── weekly-report/                    ← skill: Git 커밋 기반 업무 보고서
├── andrej-karpathy-skills/           ← skill: LLM 코딩 실수 방지 가이드라인
├── cached/                           ← hook: 크로스 프로젝트 skill/command 캐시
├── claude-statusline/                ← hook+command: 3줄 HUD statusline
├── issue-box/                        ← skill: 세션 이슈 추출 → Obsidian inbox 보관
├── memento/                          ← skill+hook+command: 3-tier 에이전트 메모리 시스템
├── claude-auth-mode/                 ← command: 인증 모드 전환 (subscription ↔ Foundry)
└── backup/                           ← 기존 statusline 백업
```

각 플러그인은 독립 디렉토리에 `.claude-plugin/plugin.json` + 컴포넌트(command/skill/hook)로 구성.

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
| 기능 추가 | 새 Step, 인자, 출력 | minor (x.**Y**.0) | `feat(<plugin>):` |
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
| git-init | 1.2.0 | workflow | command | — | gh, curl |
| weekly-report | 1.0.0 | workflow | skill | — | git, Obsidian vault |
| andrej-karpathy-skills | 1.0.0 | workflow | skill | — | 없음 |
| cached | 1.0.0 | utility | hook | Python 3 | 없음 |
| claude-statusline | 1.3.0 | utility | hook+command | Bun + TS | ccusage |
| issue-box | 1.0.0 | workflow | skill | — | obsidian CLI |
| memento | 1.0.0 | utility | skill+hook+command | Bun | qmd |
| claude-auth-mode | 2.0.1 | utility | command | — | sops, age |

### git-init

```
git-init/
├── .claude-plugin/plugin.json
└── commands/git-init.md        ← 10단계 워크플로우
```

- **수정 시**: `git-init.md`의 Step 순서 변경 시 번호 정합성 확인
- **테스트**: `/git-init test-repo` 실행 후 GitHub에서 생성 확인, `gh repo delete`로 정리
- **의존성**: `gh` CLI (인증 필요), `curl` (gitignore.io)

### weekly-report

```
weekly-report/
├── .claude-plugin/plugin.json
└── skills/weekly-report/SKILL.md   ← 트리거 키워드 + 5단계 워크플로우
```

- **수정 시**: 트리거 키워드 변경 시 description의 키워드 목록도 동기화
- **테스트**: "이번 주 주간 보고서 작성해줘" 프롬프트로 트리거 확인
- **의존성**: git (커밋 이력), Obsidian vault (출력 경로)
- **주의**: Obsidian vault 경로를 `find`로 자동 탐색 — vault가 없으면 현재 디렉토리에 저장

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

### cached

```
cached/
├── .claude-plugin/plugin.json
├── hooks/hooks.json            ← SessionStart 훅
├── scripts/sync.py             ← Python 3 캐시 동기화
└── .cache/                     ← 런타임 캐시 (gitignore)
```

- **수정 시**: `sync.py`의 `CACHE_VERSION` 변경 시 기존 캐시 무효화됨
- **테스트**: 새 세션 시작 후 `.cache/` 디렉토리 갱신 확인
- **의존성**: Python 3 (표준 라이브러리만)
- **주의**: hooks.json은 auto-discovery — plugin.json에 hooks 필드 선언 금지

### claude-statusline

```
claude-statusline/
├── .claude-plugin/plugin.json
├── commands/{setup,cost,list,purpose}.md
├── hooks/hooks.json            ← SessionStart/UserPromptSubmit/SessionEnd
├── scripts/
│   ├── statusline.ts           ← stdin JSON → 3줄 HUD (settings.json에서 호출)
│   ├── hook-handler.ts         ← 세션 상태 갱신
│   └── refresh-cost.ts         ← ccusage 백그라운드 실행 → 캐시
├── src/
│   ├── types.ts, format.ts, session.ts, cost.ts
│   ├── cjk.ts, shorten.ts, git.ts
└── data/                       ← 런타임 (gitignore)
    ├── sessions/{id}.json
    └── cost-cache.json
```

- **수정 시**:
  - `settings.json`의 statusLine 경로에 버전이 하드코딩됨 → 버전 변경 시 `/setup` 재실행 필수
  - hooks.json은 auto-discovery → plugin.json에 hooks 필드 선언 금지 (중복 로딩 에러)
  - `src/` 수정 후 `scripts/`에서 import 경로 확인 (`.js` 확장자 필수)
- **테스트**:
  ```bash
  # 훅 테스트
  echo '{"hook_event_name":"SessionStart","session_id":"test","cwd":"/tmp","prompt":""}' \
    | bun run scripts/hook-handler.ts
  # statusline 렌더링 테스트
  echo '{"session_id":"test","workspace":{"current_dir":"/tmp"},...}' \
    | bun run scripts/statusline.ts 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g'
  ```
- **의존성**:
  - Bun (TypeScript 직접 실행)
  - ccusage (`bun install -g ccusage`, 비용 데이터, ~26초 소요 → 동기 호출 금지)
- **주의**:
  - ccusage는 `refresh-cost.ts` detached 프로세스로만 실행 (캐시 TTL 5분)
  - UserPromptSubmit마다 캐시 만료 체크 → 만료 시 백그라운드 갱신

### issue-box

```
issue-box/
├── .claude-plugin/plugin.json
└── skills/create-issue/SKILL.md   ← 6단계 워크플로우 (이슈 추출 → Obsidian inbox 저장)
```

- **수정 시**: 트리거 키워드 변경 시 description의 키워드 목록도 동기화
- **테스트**: `/inbox` 또는 `/triage`로 트리거 확인, Obsidian에서 생성된 노트 확인
- **의존성**: `obsidian` CLI (`brew install obsidian-cli`)
- **주의**: vault 탐색은 `obsidian vaults verbose`, inbox 폴더 탐색은 `obsidian vault="<name>" folders` 사용

### memento

```
memento/
├── .claude-plugin/plugin.json
├── commands/setup.md               ← /memento-setup: qmd 설치 확인
├── skills/
│   ├── memento-core/SKILL.md       ← 세션 라이프사이클 + 체크포인트
│   ├── memento-compaction/SKILL.md ← 5-level 컴팩션 트리
│   ├── memento-flush/SKILL.md      ← 수동 메모리 플러시
│   └── memento-search/SKILL.md     ← 트리 탐색 기반 검색
├── hooks/hooks.json                ← SessionStart: 프로젝트 ID + @import 세션 주입
├── scripts/
│   ├── init.sh                     ← 프로젝트 ID 결정 + 디렉토리 생성 + @import 출력
│   └── compact.mjs                 ← 기계적 컴팩션 (Bun)
└── templates/                      ← 초기 메모리 파일 템플릿
```

- **원본**: [hipocampus](https://github.com/kevin-hs-sohn/hipocampus) v0.1.6 (MIT)
- **수정 시**:
  - 스킬 경로는 `~/.claude/memento/projects/<project-id>/` 기반
  - init.sh의 프로젝트 ID 로직 변경 시 compact.mjs의 동일 로직도 동기화
  - hooks.json은 auto-discovery → plugin.json에 hooks 필드 선언 금지
- **테스트**:
  - 새 세션 시작 → `~/.claude/memento/projects/<id>/` 디렉토리 생성 확인
  - `/memento-setup` → qmd 설치 확인
  - `bun run scripts/compact.mjs` → 에러 없이 완료 확인
- **의존성**: Bun, qmd (`npm install -g qmd`)
- **주의**:
  - 메모리 데이터는 `~/.claude/memento/projects/` (유저 스코프, 프로젝트별 격리)
  - 스킬/스크립트/템플릿은 플러그인 디렉토리 (프로젝트 데이터 아님)
  - SessionStart hook stdout이 세션 컨텍스트에 @import로 주입됨

### claude-auth-mode

```
claude-auth-mode/
├── .claude-plugin/plugin.json
├── commands/setup.md              ← /claude-auth-mode:setup: sops+age 초기 설정
├── scripts/
│   ├── setup.sh                   ← idempotent 셋업 (디렉토리, sops, zshrc 연동)
│   └── claude-auth-mode.zsh      ← 원본 zsh function (setup 시 ~/.claude-auth/로 복사)
└── templates/
    ├── .sops.yaml                 ← age creation rule 템플릿
    └── foundry.env.template       ← 환경변수 플레이스홀더
```

- **수정 시**: `claude-auth-mode.zsh` 변경 후 `/claude-auth-mode:setup` 재실행으로 반영
- **테스트**: `camt && env | grep FOUNDRY`, `cams`
- **의존성**: sops (`brew install sops`), age (`brew install age`)
- **주의**:
  - 런타임 데이터는 `~/.claude-auth/` (sops 암호화 파일, active 상태)
  - `foundry.sops.env`가 이미 존재하면 setup이 덮어쓰지 않음 (사용자 값 보존)
  - 셸 시작 시 active 파일을 읽어 자동 모드 로드 (foundry일 때만 sops decrypt)
