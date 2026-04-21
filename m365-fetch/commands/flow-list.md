---
description: Power Automate environment의 flow 목록을 표 형태로 조회. 소유 flow만도 옵션으로 필터.
allowed-tools: Bash, Read
argument-hint: [--env <id>] [--owned-only]
---

# flow-list

Flow Service(`api.flow.microsoft.com`)의 environment 내 flow 목록을 markdown 표로 저장한다.

## 사용 절차

1. **Bash로 다음 명령 실행**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" flow list $ARGUMENTS
```

2. stdout의 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.
3. 출력은 `| 이름 | 상태 | 생성 | 마지막 수정 | flowName |` 표. flowName(GUID)은 이후 `flow get`/`flow runs`/`flow update`/`flow delete` 호출에 사용.

## 인자

- `--env <id>` → environment name (`config.yaml`의 `flow.default_env` 또는 자동 해석 사용, 명시적 override)
- `--owned-only` → 내가 소유한 flow만 (Flow Service 서버 측 `$filter=search('owned')` 적용)
- `--out <path>` → 출력 파일 경로 지정

## 에러 처리

- "Flow API 401/403" → `Flows.Read.All` 또는 `User` scope 미승인. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login --resource flow` 재로그인
- "environment 해석 실패" → config에 `flow.default_env` 명시 또는 `tenant_id` 확인

## 생성/수정/삭제

변경 작업은 slash 커맨드가 아닌 터미널에서 직접:

```bash
node .../scripts/cli.mjs flow create --from /tmp/flow.json
node .../scripts/cli.mjs flow update <flowName> --from /tmp/flow.json
node .../scripts/cli.mjs flow delete <flowName>
```

`--from` JSON 파일은 `{ "properties": { "displayName": "...", "definition": {...}, "connectionReferences": {...}, "state": "Started|Stopped|Suspended" } }` 형식.
