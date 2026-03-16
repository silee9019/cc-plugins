---
description: 추적 중인 Claude Code 세션 목록 표시
allowed-tools: Bash, Read
argument-hint: ""
---

## 세션 목록 표시

### 동작

1. `${CLAUDE_PLUGIN_ROOT}/data/sessions/` 디렉토리의 모든 `.json` 파일을 읽는다
2. 각 세션의 주요 정보를 테이블로 출력한다
3. `lastActivityAt` 기준 최근순으로 정렬한다

### 출력 형식

마크다운 테이블로 출력:

| ID (앞 8자) | Purpose | Branch | #Turns | Status | Last Activity |
|---|---|---|---|---|---|

### 세션 파일 구조

각 JSON 파일은 다음 필드를 포함:
- `sessionId`: 세션 식별자
- `purpose`: 세션 목적
- `branch`: git 브랜치
- `promptCount`: 프롬프트 횟수
- `status`: `active` 또는 `completed`
- `lastActivityAt`: 마지막 활동 시각 (ISO 8601)

### 표시 규칙

- `active` 세션은 일반 텍스트
- `completed` 세션은 `~~취소선~~` 처리
- 7일 이상 된 세션은 "(expired)" 표시
