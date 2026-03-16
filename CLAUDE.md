# cc-plugins

Claude Code 플러그인 모노레포.

## 프로젝트 구조

```
cc-plugins/
├── .claude-plugin/marketplace.json   ← 중앙 카탈로그 (모든 플러그인 등록)
├── git-init/                         ← command 타입: GitHub 저장소 초기화
├── weekly-report/                    ← skill 타입: Git 커밋 기반 업무 보고서
├── andrej-karpathy-skills/           ← skill 타입: LLM 코딩 실수 방지 가이드라인
└── cached/                           ← hook 타입: 크로스 프로젝트 skill/command 캐시
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
