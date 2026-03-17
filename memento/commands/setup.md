---
description: Memento 메모리 시스템 초기 설정 (qmd 설치 확인 + 디렉토리 생성)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# Memento Setup

## Workflow

### Step 1: qmd 설치 확인

```bash
which qmd
```

설치되어 있지 않으면 사용자에게 안내:
- `npm install -g qmd` 또는 `bun install -g qmd`

### Step 2: 디렉토리 초기화

init.sh를 실행하여 현재 프로젝트의 memento 디렉토리를 생성:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh
```

### Step 3: 완료 확인

- 생성된 프로젝트 디렉토리 경로 출력
- qmd 설치 상태 출력
- Layer 1 파일 존재 확인 (SCRATCHPAD.md, WORKING.md, TASK-QUEUE.md, memory/ROOT.md)
