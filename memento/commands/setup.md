---
description: Memento 메모리 시스템 초기 설정 (qmd 설치 확인 + 디렉토리 생성 + qmd collection 등록)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# Memento Setup

모든 단계는 멱등(idempotent) — 여러 번 실행해도 동일한 결과.

## Workflow

### Step 1: qmd 설치 확인

```bash
which qmd
```

설치되어 있지 않으면 사용자에게 안내:
- `npm install -g qmd` 또는 `bun install -g qmd`

### Step 2: 디렉토리 초기화

session-start.sh를 실행하여 현재 프로젝트의 memento 디렉토리를 생성:

```bash
echo '{}' | bash ${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh > /dev/null
```

session-start.sh는 `mkdir -p` + 템플릿 복사(`[ ! -f ]` 가드)로 이미 존재하는 파일을 덮어쓰지 않음.
session-start.sh는 User Scope 디렉토리(`~/.claude/memento/user/knowledge/`)도 자동 생성.

### Step 3: qmd collection 등록

프로젝트 디렉토리와 user 디렉토리를 qmd collection으로 등록 (이미 등록된 경우 no-op):

```bash
cd ~/.claude/memento/projects/<project-id> && qmd collection add .
```

```bash
cd ~/.claude/memento/user && qmd collection add .
```

project-id는 session-start.sh의 프로젝트 ID 결정 로직과 동일:
- git remote → `org-repo` (lowercase)
- fallback → CWD 경로 (/ → -, lowercase)

### Step 4: 구 캐시 정리

memento 플러그인 캐시 디렉토리를 스캔하여 현재 버전 외 구 버전이 있는지 확인:

```bash
ls -d ~/.claude/plugins/cache/cc-plugins/memento/*/ 2>/dev/null
```

- 구 버전 디렉토리가 존재하면 사용자에게 목록을 보여주고 AskUserQuestion으로 삭제 여부 확인
- 현재 버전만 있으면 "구 캐시 없음" 출력 후 다음 Step으로

### Step 5: 완료 확인

- 생성된 프로젝트 디렉토리 경로 출력
- qmd 설치 상태 출력
- Layer 1 파일 존재 확인 (WORKING.md, memory/ROOT.md)
- user/ROOT.md 존재 확인
- qmd collection 등록 상태 확인 (프로젝트 + user)
