---
description: 특정 Power Automate flow의 runs 이력을 날짜 범위로 조회. 3일 윈도우 슬라이스.
allowed-tools: Bash, Read
argument-hint: <flowName> [--since auto|1d] [--top 50]
---

# flow-runs

`api.flow.microsoft.com`의 `/flows/{flowName}/runs`를 `startTime` $filter로 쿼리해 markdown으로 저장한다.

## 사용 절차

1. **Bash로 다음 명령 실행** (flowName은 `flow list`에서 확인한 GUID):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" flow runs $ARGUMENTS
```

2. stdout의 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.
3. 출력은 날짜별 그룹, `- HH:MM · **Status** [code] · duration · trigger: <name> — runId` 형식.

## 인자

- `<flowName>` (필수) → `flow list`에서 확인한 GUID
- `--env <id>` → environment name
- `--since auto` (기본) → 마지막 조회 시각 이후. `2h`/`1d`/`7d`/`YYYY-MM-DD` 가능
- `--until now` (기본) → 종료 시각
- `--chunk-days <n>` → 슬라이스 크기 (기본 3)
- `--top <n>` → 윈도우당 최대 run 수 (기본 50)
- `--limit <n>` → 총 최대 run 수
- `--out <path>` → 출력 파일 경로 지정

## 에러 처리

- "Flow API 401/403" → `Flows.Read.All` 또는 `Activity.Read.All` 미승인. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login --resource flow` 재로그인

## run 단건 상세

특정 run의 action input/output 링크까지 보려면 터미널에서:

```bash
node .../scripts/cli.mjs flow run-detail <flowName> <runId>
```

output에는 각 action의 status/duration/error + `inputsLink`/`outputsLink` URL이 포함된다.
