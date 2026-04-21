---
name: calendar-events
display_name: calendar-events
description: Outlook 캘린더 이벤트를 날짜 범위로 조회해 세션에 로드. 3일 윈도우로 자동 슬라이스. 사용자가 "캘린더", "일정", "calendar events", "이번 주 미팅", "오늘 일정", "outlook calendar"를 언급하며 조회를 원할 때 트리거.
---

# calendar-events

`/me/calendarView`를 호출해 범위 내 이벤트(반복 일정 전개 포함)를 수집하고 markdown으로 저장한다.

## Step 0: 발화에서 인자 해석

사용자 발화에서 다음 인자를 추출한다. 없으면 기본값 사용.

| 발화 예시 | → 인자 |
|---|---|
| "오늘 일정" | `--since 1d --until now` |
| "이번 주 미팅" | `--since 7d` |
| "최근 3일 캘린더" | `--since 3d` |
| "2026-04-15부터" | `--since 2026-04-15` |
| "공유 캘린더 X" | `--calendar <id>` (id 모르면 `m365-fetch calendar list` 먼저 안내) |
| (명시 없음) | `--since auto --until now` (마지막 조회 시각 이후) |

## Step 1: CLI 실행

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" calendar events <추출한 인자>
```

stdout 마지막 줄이 생성된 파일의 절대 경로. Read 도구로 세션에 포함.

출력: 날짜별 그룹, `### HH:MM-HH:MM subject` 헤딩, 주최/장소/참석/온라인 링크/본문(HTML→markdown)/Outlook 링크.

## 지원 인자 전체

- `--since auto` (기본) → 마지막 조회 시각 이후. `2h`/`1d`/`7d`/`2026-04-13`도 가능
- `--until now` (기본) → 종료 시각. 명시적 ISO/상대 가능
- `--calendar <id>` → 특정 캘린더 ID (생략 시 기본 캘린더). ID는 `m365-fetch calendar list`로 확인
- `--chunk-days <n>` → 슬라이스 크기 (기본 3)
- `--limit <n>` → 최대 이벤트 수
- `--out <path>` → 출력 파일 경로 지정

## 에러 처리

- "Graph API 401/403" → 토큰 만료 또는 `Calendars.Read` 미승인. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인
- 공유 캘린더 접근 시 403 → `Calendars.Read.Shared`가 토큰에 포함되어 있는지 확인
