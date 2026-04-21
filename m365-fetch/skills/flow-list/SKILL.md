---
name: flow-list
display_name: flow-list
description: Power Automate environment의 flow 목록을 표 형태로 조회. 사용자가 "flow 목록", "Power Automate 목록", "내 flow 보여줘", "flow list"를 언급할 때 트리거.
---

# flow-list

Flow Service(`api.flow.microsoft.com`)의 environment 내 flow 목록을 markdown 표로 저장한다.

## Step 0: 발화에서 인자 해석

| 발화 예시 | → 인자 |
|---|---|
| "내가 만든 flow만" / "내 소유 flow" | `--owned-only` |
| "환경 X에서" / "tenant Y" | `--env <id>` |
| (명시 없음) | 기본 environment (config.yaml의 `flow.default_env`) |

## Step 1: CLI 실행

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" flow list <추출한 인자>
```

stdout 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.

출력: `| 이름 | 상태 | 생성 | 마지막 수정 | flowName |` 표. flowName(GUID)은 이후 `flow get`/`flow runs`/`flow update`/`flow delete` 호출에 사용.

## 지원 인자

- `--env <id>` → environment name
- `--owned-only` → 내가 소유한 flow만 (서버 측 `$filter=search('owned')` 적용)
- `--out <path>` → 출력 파일 경로 지정

## 에러 처리

- "Flow API 401/403" → `Flows.Read.All` 또는 `User` scope 미승인. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login --resource flow` 재로그인
- "environment 해석 실패" → config에 `flow.default_env` 명시 또는 `tenant_id` 확인

## 생성/수정/삭제

변경 작업은 skill이 아닌 터미널에서 직접:

```bash
node .../scripts/cli.mjs flow create --from /tmp/flow.json
node .../scripts/cli.mjs flow update <flowName> --from /tmp/flow.json
node .../scripts/cli.mjs flow delete <flowName>
```

`--from` JSON 파일은 `{ "properties": { "displayName": "...", "definition": {...}, "connectionReferences": {...}, "state": "Started|Stopped|Suspended" } }` 형식.
