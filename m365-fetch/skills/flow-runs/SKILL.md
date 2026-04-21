---
name: flow-runs
description: 특정 Power Automate flow의 runs 이력을 날짜 범위로 조회. 3일 윈도우 슬라이스. 사용자가 "flow 실행 이력", "flow runs", "XXX flow 실패 확인", "Power Automate 로그"를 언급할 때 트리거.
---

# flow-runs

`api.flow.microsoft.com`의 `/flows/{flowName}/runs`를 `startTime` $filter로 쿼리해 markdown으로 저장한다.

## Step 0: 필수 인자 + 발화 해석

**필수 인자**: `<flowName>` (GUID). 사용자 발화에서 GUID/이름이 명시되지 않았으면:
- 사용자가 flow 이름만 언급했다면 → 먼저 `flow-list` skill을 제안하여 flowName(GUID) 확인
- 전혀 특정할 단서가 없으면 → AskUserQuestion으로 flowName 확인

**선택 인자 발화 매핑**:

| 발화 예시 | → 인자 |
|---|---|
| "어제 실행" | `--since 1d` |
| "최근 7일" | `--since 7d` |
| "최근 50건만" | `--top 50` |
| "실패만" (후처리) | CLI 결과를 필터링 |
| (명시 없음) | `--since auto --top 50` |

## Step 1: CLI 실행

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" flow runs <flowName> <추출한 옵션>
```

stdout 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.

출력: 날짜별 그룹, `- HH:MM · **Status** [code] · duration · trigger: <name> — runId` 형식.

## 지원 인자

- `<flowName>` (필수) → `flow-list`에서 확인한 GUID
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
