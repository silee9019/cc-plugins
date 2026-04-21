---
name: teams-fetch
description: MS Teams 인박스(구독 채팅 전체 + 등록 채널)를 한 파일로 수집해 세션 컨텍스트에 로드. 단일 별칭만 원하면 별칭 지정. 사용자가 "teams", "팀즈 가져와", "teams 인박스", "<별칭> 채팅", "teams fetch"를 언급할 때 트리거.
---

# teams-fetch

구독 중인 모든 1:1/그룹 채팅 + 등록된 채널을 한 번에 수집해 세션 컨텍스트에 로드한다.
1:1은 상대 표시명으로 섹션이 라벨링되고, 설정(`inbox.exclude_chat_topics` 등)에 매칭되는 채팅은 자동 제외된다.

## Step 0: 발화에서 인자 해석

세 가지 모드가 있다. 발화로 구분:

| 발화 의도 | 실행 명령 |
|---|---|
| 인박스 전체 ("teams 인박스 가져와", "팀즈 새 메시지") | `teams inbox <옵션>` |
| 단일 별칭 ("<별칭> 채팅", "team-a 메시지") | `teams fetch <alias> <옵션>` |
| 등록 별칭 일괄 ("등록된 별칭 전부 가져와", "fetch-all") | `teams fetch-all <옵션>` |

**옵션 발화 매핑**:

| 발화 예시 | → 인자 |
|---|---|
| "최근 1일" / "어제부터" | `--since 1d` |
| "최근 일주일" | `--since 7d` |
| "200개까지" | `--limit 200` |
| (명시 없음) | `--since auto` |

## Step 1: CLI 실행 (모드별)

### 인박스 전체
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams inbox <옵션>
```

- `--since <auto|2h|1d|7d|YYYY-MM-DD>`, `--until <spec>`, `--limit <N>`, `--exclude-alias <a,b>`, `--exclude-chat-id <id,id>`, `--out <path>` 지원
- 첫 실행(state 없음) 시 7d fallback. 두 번째 실행부터는 직전 실행 시각 이후만 수집.

### 단일 별칭
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams fetch <alias> <옵션>
```

### 등록 별칭 일괄
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" teams fetch-all --since 1d
```

- `--exclude team-a,team-b`: 추가 제외할 별칭
- 각 별칭별 개별 파일로 저장

## 제외 설정

`~/.config/m365-fetch/config.yaml`의 `inbox` 섹션으로 영구 제외 규칙을 관리한다.

```yaml
inbox:
  exclude_chat_topics:
    - "Team PR Chat"     # topic 부분 일치(case-insensitive)
  exclude_chat_ids: []   # 정확한 chat.id 매칭
  exclude_chat_types: [] # 예: ["oneOnOne"]
```

등록 별칭(alias)의 `exclude_from_all: true`도 동일하게 적용된다.

## 에러 처리

- "설정 파일이 없습니다" → 사용자에게 README 초기 설정 안내
- "별칭 'xxx'을(를) 찾을 수 없습니다" → `teams list`로 등록된 별칭 확인 권유. 유사 별칭이 있으면 제안됨
- "Graph API 401/403" → 토큰 만료. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인 안내
- "Graph API 404" → 해당 chatId/channelId에 접근 권한 없음. 내가 멤버인지 확인

## 별칭 추가

이 skill은 fetch만 담당. 별칭 추가는 터미널에서 직접:

```bash
node ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/m365-fetch/scripts/cli.mjs teams add-alias <name> "<teams-url>"
```

Teams 앱에서 메시지의 `...` → "링크 복사"로 얻은 URL을 사용한다.
