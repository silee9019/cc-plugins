---
name: teams-search
display_name: teams-search
description: MS Teams에서 내가 멘션된 곳 + 이름이 등장한 곳을 날짜 범위로 검색. 가입 채팅 + 등록된 채널 alias 전부 스캔. 사용자가 "teams 검색", "멘션 찾아줘", "내 이름 언급된 곳", "teams search"를 언급할 때 트리거.
---

# teams-search

가입한 모든 1:1/그룹 채팅과 등록된 channel-type alias를 훑어, 내가 멘션됐거나 이름이 등장한 메시지를 추려 markdown으로 저장한다.

## Step 0: 발화에서 인자 해석

| 발화 예시 | → 인자 |
|---|---|
| "내 멘션만" / "날 태그한 메시지만" | `--mentions-only` |
| "홍길동 언급된 곳" | `--name "홍길동"` |
| "본문에 XXX 있는 메시지" | `--body-only --name "XXX"` |
| "최근 일주일 멘션" | `--since 7d` |
| "어제부터 확인" | `--since 1d` |
| "최대 100건" | `--limit 100` |
| (명시 없음, 나에 대한 검색) | `--name me --since auto` |

## Step 1: CLI 실행

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams search <추출한 인자>
```

stdout 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 열어 세션에 포함.

결과: source(channel/chat) → 날짜순으로 그룹핑. 각 메시지에 `[mention]`, `[body]`, `[both]` 태그가 붙어 매칭 근거 표시.

## 지원 인자

- `--name me` (기본) → `/me`로 본인 id/displayName 조회 후 매칭
- `--name "홍길동"` → 자유 문자열 substring 매칭
- `--since auto` (기본) → 마지막 검색 시각 이후. `2h`, `1d`, `7d`, `2026-04-13`도 가능
- `--until <spec>` → 종료 시각 (기본: now)
- `--mentions-only` → @mention 매칭만
- `--body-only` → 본문 substring만
- `--limit 500` → 결과 상한

## 에러 처리

- "Graph API 401/403" → 토큰 만료. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인 안내
- 결과 0건이면 `_(매칭 결과 없음)_` 표기. 범위/조건을 넓혀 재시도 권유

## 비용

`/me/chats/getAllMessages`와 channel `getAllMessages`는 2025-08-25부터 metered 해제됨 (Microsoft Graph 정책 변경). billing 설정 없이 자유 사용 가능. 단 호출 횟수가 많을 경우 throttling 발생 가능.
