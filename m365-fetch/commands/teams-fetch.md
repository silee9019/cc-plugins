---
description: MS Teams 인박스(구독 채팅 전체 + 등록 채널)를 한 파일로 수집해 세션 컨텍스트에 로드. 단일 별칭만 원하면 첫 인자로 별칭 지정.
allowed-tools: Bash, Read
argument-hint: [<alias>] [--since auto|1d] [--limit 200]
---

# teams-fetch

구독 중인 모든 1:1/그룹 채팅 + 등록된 채널을 한 번에 수집해 세션 컨텍스트에 로드한다.
1:1은 상대 표시명으로 섹션이 라벨링되고, 설정(`inbox.exclude_chat_topics` 등)에 매칭되는 채팅은 자동 제외된다.

## 기본 동작: teams inbox

인자 없이 호출하면 인박스 전체를 수집한다.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams inbox $ARGUMENTS
```

- `$ARGUMENTS`가 비어 있으면 `defaults.since`(기본 `auto` = 마지막 읽은 시각) 기준으로 수집.
- 옵션: `--since <auto|2h|1d|7d|YYYY-MM-DD>`, `--until <spec>`, `--limit <N>`, `--exclude-alias <a,b>`, `--exclude-chat-id <id,id>`, `--out <path>`.
- stdout 마지막 줄이 생성된 파일 경로. Read 도구로 열어 세션에 포함시킨다.
- 첫 실행(state 없음) 시 7d fallback. 두 번째 실행부터는 직전 실행 시각 이후만 수집.

### 제외 설정

`~/.config/m365-fetch/config.yaml`의 `inbox` 섹션으로 영구 제외 규칙을 관리한다.

```yaml
inbox:
  exclude_chat_topics:
    - "Team PR Chat"     # topic 부분 일치(case-insensitive)
  exclude_chat_ids: []   # 정확한 chat.id 매칭
  exclude_chat_types: [] # 예: ["oneOnOne"]
```

등록 별칭(alias)의 `exclude_from_all: true`도 동일하게 적용된다.

## 단일 별칭만 원할 때: teams fetch <alias>

첫 인자가 등록된 별칭(또는 유사 이름)으로 해석되면 해당 별칭만 가져온다.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams fetch $ARGUMENTS
```

## 등록 별칭만 일괄 수집: teams fetch-all

인박스 대신 등록된 별칭(채널/채팅 URL로 add-alias 해둔 것)만 개별 파일로 저장하고 싶을 때 사용한다.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams fetch-all --since 1d
```

- `--exclude team-a,team-b`: 추가 제외할 별칭.
- 각 별칭별 개별 파일로 저장. stdout에 파일 경로 목록 출력.

## 에러 처리

- "설정 파일이 없습니다" → 사용자에게 README 초기 설정 안내.
- "별칭 'xxx'을(를) 찾을 수 없습니다" → `m365-fetch teams list`로 등록된 별칭 확인 권유. 유사 별칭이 있으면 제안됨.
- "Graph API 401/403" → 토큰 만료. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인 안내.
- "Graph API 404" → 해당 chatId/channelId에 접근 권한 없음. 내가 멤버인지 확인.

## 별칭 추가

이 슬래시 커맨드는 fetch만 담당한다. 별칭 추가는 터미널에서 직접:

```bash
node ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/m365-fetch/scripts/cli.mjs teams add-alias <name> "<teams-url>"
```

Teams 앱에서 메시지의 `...` → "링크 복사"로 얻은 URL을 사용한다.
