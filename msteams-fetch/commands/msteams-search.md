---
description: MS Teams에서 내가 멘션된 곳 + 이름이 등장한 곳을 날짜 범위로 검색. 가입 채팅 + 등록된 채널 alias 전부 스캔.
allowed-tools: Bash, Read
argument-hint: [--name me] [--since 7d] [--mentions-only|--body-only]
---

# msteams-search

가입한 모든 1:1/그룹 채팅(`/me/chats/getAllMessages`)과 등록된 channel-type alias를 훑어, 내가 멘션됐거나 이름이 등장한 메시지를 추려 markdown으로 저장한다.

## 사용 절차

1. **Bash로 다음 명령을 실행한다**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" search $ARGUMENTS
```

2. stdout의 마지막 줄이 생성된 파일의 절대 경로다. 그 경로를 **Read 도구로 열어** 내용을 세션에 포함시킨다.
3. 결과는 source(channel/chat) → 날짜순으로 그룹핑되어 있고, 각 메시지에 `[mention]`, `[body]`, `[both]` 태그가 붙어 매칭 근거를 표시한다.

## 인자

- `--name me` (기본) → `/me`로 본인 id/displayName 조회 후 매칭
- `--name "홍길동"` → 자유 문자열 substring 매칭
- `--since 7d` → 시간 범위 (`2h`, `1d`, `7d`, `2026-04-13`)
- `--mentions-only` → @mention 매칭만
- `--body-only` → 본문 substring만
- `--limit 500` → 결과 상한

## 에러 처리

- "Graph API 401/403" → 토큰 만료. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인 안내
- 결과 0건이면 `_(매칭 결과 없음)_` 표기. 범위/조건을 넓혀 재시도 권유

## 비용

`/me/chats/getAllMessages`와 channel `getAllMessages`는 2025-08-25부터 metered 해제됨 (Microsoft Graph 정책 변경). billing 설정 없이 자유 사용 가능. 단 호출 횟수가 많을 경우 throttling 발생 가능.
