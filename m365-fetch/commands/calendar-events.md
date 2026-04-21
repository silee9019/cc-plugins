---
description: Outlook 캘린더 이벤트를 날짜 범위로 조회해 세션에 로드. 3일 윈도우로 자동 슬라이스.
allowed-tools: Bash, Read
argument-hint: [--since auto|7d] [--until now] [--calendar <id>] [--limit 200]
---

# calendar-events

`/me/calendarView`를 호출해 범위 내 이벤트(반복 일정 전개 포함)를 수집하고 markdown으로 저장한다.

## 사용 절차

1. **Bash로 다음 명령 실행**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" calendar events $ARGUMENTS
```

2. stdout의 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.
3. 출력은 날짜별 그룹, `### HH:MM-HH:MM subject` 헤딩, 주최/장소/참석/온라인 링크/본문(HTML→markdown)/Outlook 링크.

## 인자

- `--since auto` (기본) → 마지막 조회 시각 이후. `2h`/`1d`/`7d`/`2026-04-13`도 가능
- `--until now` (기본) → 종료 시각. 명시적 ISO/상대 가능
- `--calendar <id>` → 특정 캘린더 ID (생략 시 기본 캘린더). ID는 `m365-fetch calendar list`로 확인
- `--chunk-days <n>` → 슬라이스 크기 (기본 3)
- `--limit <n>` → 최대 이벤트 수
- `--out <path>` → 출력 파일 경로 지정

## 에러 처리

- "Graph API 401/403" → 토큰 만료 또는 `Calendars.Read` 미승인. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인
- 공유 캘린더 접근 시 403 → `Calendars.Read.Shared`가 토큰에 포함되어 있는지 확인
