# teams-fetch

MS Teams 채팅/채널 메시지를 **내 계정(delegated) 권한**으로 읽어와 markdown으로 저장하는 cc-plugins 플러그인. 복붙 대신 별칭 하나로 Claude Code 세션에 Teams 컨텍스트를 불러온다.

## 동작 원리

```
/teams-fetch qtrace-팀방 --since 1d
  ↓
node scripts/cli.mjs fetch qtrace-팀방 --since 1d
  ↓
MSAL device code → Microsoft Graph API
  ↓
~/tmp/teams-context/qtrace-팀방-2026-04-13T1730.md
  ↓
Claude가 Read 도구로 열어 컨텍스트에 포함
```

- **인증**: Microsoft Graph delegated permission. "Teams 앱에서 내가 볼 수 있는 것"과 완전히 동일한 범위
- **저장 위치**: `~/tmp/teams-context/` (vault 밖, git/동기화 제외)
- **설정**: `~/.config/teams-fetch/{config.yaml, aliases.yaml, token-cache.json}` (0600)

## 초기 설정

### 1. Azure AD 앱 등록

한 번만 수행. 본인 계정으로 portal.azure.com 접속.

1. "앱 등록" → "+ 새 등록"
2. 이름: `teams-fetch-silee`, 계정 유형: 단일 테넌트
3. 리디렉션 URI: "공용 클라이언트/네이티브" + `http://localhost`
4. 등록 후 "개요"에서 `애플리케이션(클라이언트) ID`, `디렉터리(테넌트) ID` 복사
5. "API 권한" → "+ 권한 추가" → Microsoft Graph → 위임된 권한
   - `Chat.Read` 체크 (Phase 1: 1:1/그룹 채팅)
   - `ChannelMessage.Read.All` 체크 (Phase 2: 팀 채널 — admin consent 필요할 수 있음)
6. "인증" → "공용 클라이언트 흐름 허용"을 **예**로 변경 → 저장

### 2. config.yaml 작성

```bash
mkdir -p ~/.config/teams-fetch
cat > ~/.config/teams-fetch/config.yaml <<'EOF'
auth:
  tenant_id: "<디렉터리 ID>"
  client_id: "<애플리케이션 ID>"
  scopes:
    - "Chat.Read"
    - "User.Read"
    # Phase 2에서 추가: "ChannelMessage.Read.All"

output:
  dir: "~/tmp/teams-context"

defaults:
  since: "7d"
  limit: 200
EOF
chmod 600 ~/.config/teams-fetch/config.yaml
```

### 3. 로그인

```bash
node ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/teams-fetch/scripts/cli.mjs login
```

- 터미널에 코드와 URL이 출력됨 (예: `https://microsoft.com/devicelogin` 에서 `ABC123DEF` 입력)
- 브라우저에서 본인 Microsoft 계정으로 로그인 → 권한 동의
- 토큰이 `~/.config/teams-fetch/token-cache.json`에 저장되고 이후 자동 갱신

## 사용법

### 별칭 추가

Teams 앱에서 대상 채팅/채널의 메시지 하나에 마우스 올리기 → `...` → "링크 복사".

```bash
# 1:1 또는 그룹 채팅
node .../cli.mjs add-alias qtrace-팀방 "https://teams.microsoft.com/l/message/19%3Axxx%40thread.v2/171..."

# 팀 채널
node .../cli.mjs add-alias dentbird-general "https://teams.microsoft.com/l/channel/19%3Ayyy%40thread.tacv2/General?groupId=..."

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
/teams-fetch qtrace-팀방 --since 1d
```

또는 터미널에서 직접:

```bash
node .../cli.mjs fetch qtrace-팀방 --since 2h
node .../cli.mjs fetch dentbird-general --since 7d --limit 500
node .../cli.mjs fetch kr1-공지  # 쓰레드는 since 무시, 전체 가져옴
```

옵션:
- `--since` — `2h`, `1d`, `7d` 같은 상대값 또는 `2026-04-13` ISO 날짜
- `--limit` — 최대 메시지 개수 (기본 200)
- `--out` — 출력 경로 직접 지정

## 출력 포맷

```markdown
---
source: teams
alias: qtrace-팀방
label: QTrace 논의 그룹
type: chat
chat_id: "19:xxx@thread.v2"
fetched_at: 2026-04-13T17:30:00+09:00
range: "2026-04-12T17:30 ~ 2026-04-13T17:30"
message_count: 42
---

# QTrace 논의 그룹

## 2026-04-12

### 14:23 — 홍길동

SDS 초안 공유드립니다. 검토 부탁드려요.

- 📎 [spec.docx](https://...)

*reactions*: like 3
```

## 권한 범위 주의

- `Chat.Read` (delegated): 내가 참여 중인 1:1/그룹 채팅만. 보통 user consent만으로 통과
- `ChannelMessage.Read.All` (delegated): 내가 멤버인 팀 채널만. **admin consent 필요 가능성 높음**
- 둘 다 application permission이 아니므로 "조직 전체 대리 읽기"는 불가능. 본인 Teams 앱 가시 범위와 동일

## 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| `401 Unauthorized` | 토큰 만료. `cli.mjs login` 재실행 |
| `403 Forbidden` | 권한 부족. config.yaml의 scopes와 Azure 앱 permission 일치 확인 |
| `404 Not Found` (chat) | 해당 chat에 내가 멤버가 아니거나 chatId 오타 |
| `AADSTS65001` (첫 로그인) | consent 미수락. 브라우저 로그인 화면에서 "수락" 필요 |
| `AADSTS500011` | scope 이름 오타. `Chat.Read`, `User.Read` 등 정확히 |

## 파일 구조

```
teams-fetch/
├── .claude-plugin/plugin.json
├── commands/teams-fetch.md        # 슬래시 커맨드
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
- [ ] Phase 2: 팀 채널 (`ChannelMessage.Read.All`, admin consent)
- [ ] Phase 3: 쓰레드 permalink 확장
- [ ] 30일 이상 된 출력 파일 자동 정리
