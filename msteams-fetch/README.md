# msteams-fetch

MS Teams 채팅/채널 메시지를 **내 계정(delegated) 권한**으로 읽어와 markdown으로 저장하는 cc-plugins 플러그인. 복붙 대신 별칭 하나로 Claude Code 세션에 Teams 컨텍스트를 불러온다.

## 동작 원리

```
/msteams-fetch 팀채널 --since 1d
  ↓
node scripts/cli.mjs fetch 팀채널 --since 1d
  ↓
MSAL device code → Microsoft Graph API
  ↓
~/tmp/teams-context/팀채널-2026-04-14T1030.md
  ↓
Claude가 Read 도구로 열어 컨텍스트에 포함
```

- **인증**: Microsoft Graph delegated permission. "Teams 앱에서 내가 볼 수 있는 것"과 완전히 동일한 범위
- **저장 위치**: `~/tmp/teams-context/` (vault 밖, git/동기화 제외)
- **설정**: `~/.config/msteams-fetch/{config.yaml, aliases.yaml, token-cache.json}` (0600)
- **패키지 매니저**: pnpm

## 초기 설정

### 1. 의존성 설치

```bash
cd ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/msteams-fetch
pnpm install
```

### 2. config.yaml 작성

`~/.config/msteams-fetch/config.yaml`:

```yaml
auth:
  tenant_id: "<디렉터리 ID>"
  client_id: "<admin-consented 앱의 client ID>"
  scopes:
    - "Chat.ReadWrite"
    - "ChannelMessage.Read.All"
    - "User.Read"

output:
  dir: "~/tmp/teams-context"

defaults:
  since: "7d"
  limit: 200
```

chmod 600 으로 권한 제한.

> **앱 ID 확보**: 회사 테넌트가 user consent를 차단한 경우, admin consent가 이미 완료된 internal 앱의 client_id를 빌려 쓸 수 있다. Azure v2 endpoint는 scope을 "토큰에 구울 때" 처리하므로, 빌린 앱이 보유한 delegated permission 범위 안에서만 토큰이 발급된다. 자체 앱을 새로 등록할 경우 admin consent를 먼저 받아야 한다.

### 3. 로그인

```bash
node ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/msteams-fetch/scripts/cli.mjs login
```

- 터미널에 코드와 URL이 출력됨 (`https://microsoft.com/devicelogin`)
- 브라우저에서 본인 Microsoft 계정으로 로그인
- 토큰이 `~/.config/msteams-fetch/token-cache.json`에 저장되고 이후 silent refresh 자동

## 사용법

### 별칭 추가

Teams 앱에서 대상 채팅/채널의 메시지 하나에 마우스 올리기 → `...` → "링크 복사".

```bash
# 1:1 또는 그룹 채팅
node .../cli.mjs add-alias connect-chat "https://teams.microsoft.com/l/message/19%3Axxx%40thread.v2/171..."

# 팀 채널
node .../cli.mjs add-alias connect-channel "https://teams.microsoft.com/l/channel/19%3Ayyy%40thread.tacv2/General?groupId=..."

# 특정 쓰레드 (루트 메시지 + 답글)
node .../cli.mjs add-alias kr1-공지 "<채널 내 메시지 링크>"
```

`--label "QTrace 논의 그룹"`으로 표시 라벨 지정 가능.

### 목록 확인

```bash
node .../cli.mjs list
```

### 메시지 가져오기

Claude Code 세션에서:

```
/msteams-fetch 팀채널 --since 1d
```

또는 터미널에서 직접:

```bash
node .../cli.mjs fetch connect-chat --since 2h
node .../cli.mjs fetch connect-channel --since 7d --limit 500
node .../cli.mjs fetch kr1-공지  # 쓰레드는 since 무시, 전체 가져옴
```

옵션:
- `--since` - `2h`, `1d`, `7d` 같은 상대값 또는 `2026-04-13` ISO 날짜
- `--limit` - 최대 메시지 개수 (기본 200)
- `--out` - 출력 경로 직접 지정

## 출력 포맷

```markdown
---
source: teams
alias: connect-channel
label: 💫Connect
type: channel
team_id: "a26429fe-..."
channel_id: "19:...@thread.tacv2"
fetched_at: 2026-04-14T10:30:00+09:00
range: "2026-04-13T10:30 ~ 2026-04-14T10:30"
message_count: 42
---

# 💫Connect

## 2026-04-13

### 14:23 - 홍길동

SDS 초안 공유드립니다. 검토 부탁드려요.

- 📎 [spec.docx](https://...)

*reactions*: like 3
```

## 캐시 정리 (선택)

`~/tmp/teams-context/` 은 fetch/search 호출마다 누적된다. 주기적으로 오래된 파일을 삭제하려면 crontab 한 줄:

```cron
0 3 * * * find ~/tmp/teams-context -type f -mtime +30 -delete
```

30일 경과한 파일을 매일 03:00에 지운다. 보존 기간은 취향대로 조정.

## 권한 범위 주의

- `Chat.ReadWrite` / `Chat.Read` (delegated): 내가 참여 중인 1:1/그룹 채팅만
- `ChannelMessage.Read.All` (delegated): 내가 멤버인 팀 채널만
- application permission이 아니므로 "조직 전체 대리 읽기"는 불가능. 본인 Teams 앱 가시 범위와 동일

## 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| `401 Unauthorized` | 토큰 만료. `cli.mjs login` 재실행 |
| `403 Forbidden` | 앱이 해당 scope에 대한 admin consent 미완료 |
| `404 Not Found` (chat) | 해당 chat에 내가 멤버가 아니거나 chatId 오타 |
| `AADSTS65001` | consent 미수락. admin consent 필요 |
| `AADSTS500011` | scope 이름 오타 |

## 파일 구조

```
msteams-fetch/
├── .claude-plugin/plugin.json
├── commands/msteams-fetch.md       # 슬래시 커맨드
├── scripts/
│   ├── cli.mjs                    # 엔트리포인트
│   ├── auth.mjs                   # MSAL device code flow
│   ├── config.mjs                 # yaml 설정 로더
│   ├── graph.mjs                  # Graph API 호출
│   ├── render.mjs                 # HTML → markdown
│   └── urlParser.mjs              # Teams URL 파싱
├── package.json
└── README.md
```

## 로드맵

- [x] Phase 1: 1:1/그룹 채팅 (`Chat.Read`)
- [x] Phase 1+: 팀 채널 (`ChannelMessage.Read.All`)
- [x] AdaptiveCard / Hero / O365 connector 카드 본문 추출
- [x] `search` 서브커맨드: 가입 채팅 + 등록 채널에서 멘션/이름 검색 (날짜 범위)
- [x] 0.3.1: 채널 fetch에 thread replies 자동 병합 (root 아래 `####` + blockquote 들여쓰기)
- [x] 0.3.1: 한국 이름 멘션 머지 (`@Sangin @Lee` → `@Sangin Lee`)
- [x] 0.3.1: search가 본인 발신 메시지까지 매칭 (target=me 시 `from.user.id` 기반)
- [x] 0.3.1: `~/tmp/teams-context/` GC crontab 가이드
- [ ] 0.4.0 (보류): 로컬 캐시 SSOT + sync cron (Phase 0 검증 결과 재평가 후 진행)
