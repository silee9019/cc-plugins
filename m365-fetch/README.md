# m365-fetch

Microsoft 365 컨텍스트를 **내 계정(delegated) 권한**으로 읽어와 markdown으로 저장하는 cc-plugins 플러그인. Teams 채팅/채널, Outlook 캘린더/메일, Power Automate flow CRUD + runs까지 하나의 CLI와 슬래시 커맨드 체계로 통합.

> **이름 이력**: 0.3.4까지 `msteams-fetch`, 0.4.0부터 `m365-fetch`. 기존 `~/.config/msteams-fetch/`는 최초 실행 시 `~/.config/m365-fetch/`로 자동 이전되고, 구식 `auth.scopes` 키는 `auth.graph_scopes`로 자동 승격.

## 동작 원리

```
/m365-fetch:calendar-events --since auto
  ↓
node scripts/cli.mjs calendar events --since auto
  ↓
MSAL device code → Graph (resource=graph) / Flow Service (resource=flow)
  ↓
~/tmp/m365-context/calendar/events-2026-04-21T1030.md
  ↓
Claude가 Read 도구로 열어 컨텍스트에 포함
```

- **인증**: MSAL delegated. 리소스별(`graph` / `flow`)로 다른 토큰을 발급해 `~/.config/m365-fetch/token-cache.json`에 리소스별 캐시.
- **저장 위치**: `~/tmp/m365-context/{teams,calendar,mail,flow}/` (vault 밖, git/sync 제외)
- **설정**: `~/.config/m365-fetch/{config.yaml, aliases.yaml, last-read.yaml, token-cache.json}` (0600)
- **since 기본값**: `"auto"` — 마지막 성공 실행 시각부터 지금까지. `last-read.yaml`에 per-command 키로 저장. 첫 실행은 7d fallback.
- **3일 윈도우 슬라이스**: calendar/mail/flow-runs는 `$filter` 범위를 3일 단위로 쪼개 순차 호출 (throttling 완화).
- **패키지 매니저**: pnpm

## 초기 설정

### 1. Azure AD 앱 등록

본인 테넌트에 앱을 직접 등록하고 다음 Delegated permission을 추가 + admin consent.

**Microsoft Graph (21개)**:
`Calendars.Read`, `Calendars.Read.Shared`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `Chat.Read`, `Chat.ReadBasic`, `Files.Read.All`, `Group.Read.All`, `Mail.Read`, `Mail.Read.Shared`, `offline_access`, `OnlineMeetings.Read`, `People.Read`, `Place.Read.All`, `Presence.Read.All`, `Tasks.Read`, `Tasks.Read.Shared`, `Team.ReadBasic.All`, `TeamMember.Read.All`, `User.Read`, `User.Read.All`

**Power Automate / Microsoft Flow Service (4개)** — "Add a permission > APIs my organization uses > Microsoft Flow Service (App ID `7df0a125-d3be-4c96-aa54-591f83ff541c`)":
`Activity.Read.All`, `Flows.Manage.All`, `Flows.Read.All`, `User`

**Authentication 탭**: "Allow public client flows" = **Yes** (device code flow 필수).

### 2. 의존성 설치

```bash
cd ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/m365-fetch
pnpm install
```

### 3. config.yaml 작성

`~/.config/m365-fetch/config.yaml`:

```yaml
auth:
  tenant_id: "<디렉터리 ID>"
  client_id: "6006edd4-d74d-4faf-b5cb-109d9b31ece0"   # 본인 테넌트 앱 ID
  # graph_scopes / flow_scopes 는 생략 시 코드 기본값 사용 (전체 scope).
  # 명시적으로 축소하려면 subset 지정.

output:
  dir: "~/tmp/m365-context"

defaults:
  since: "auto"       # 마지막 읽은 시각 이후 (fallback 7d)
  until: "now"
  chunk_days: 3       # 3일 윈도우 슬라이스
  limit: 200

flow:
  default_env: null    # null이면 자동 해석 (isDefault=true → Default-{tenantId} fallback)

inbox:                 # Teams inbox 제외 규칙
  exclude_chat_topics: []
  exclude_chat_ids: []
  exclude_chat_types: []
```

`chmod 600`으로 권한 제한.

### 4. 로그인

```bash
node ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/m365-fetch/scripts/cli.mjs login
# flow 리소스 토큰은 Flow 서브커맨드 첫 호출 시 자동으로 device code 한 번 더 뜸.
# 수동 사전 발급:
node .../scripts/cli.mjs login --resource flow
```

토큰은 `~/.config/m365-fetch/token-cache.json`에 리소스별로 분리 저장되고 이후 silent refresh.

## 사용법

### Teams

Teams 앱에서 채팅/채널 메시지의 `...` → "링크 복사":

```bash
# 별칭 추가
node .../cli.mjs teams add-alias team-chat "https://teams.microsoft.com/l/message/19%3A.../171..."
node .../cli.mjs teams add-alias team-channel "https://teams.microsoft.com/l/channel/...?groupId=..."

# 목록 / 조회
node .../cli.mjs teams list
node .../cli.mjs teams fetch team-channel --since 1d
node .../cli.mjs teams inbox                     # since=auto (마지막 실행 이후)
node .../cli.mjs teams search --name me
node .../cli.mjs teams fetch-all --since 7d
```

슬래시 커맨드:
- `/m365-fetch:teams-fetch [<alias>] [--since auto]`
- `/m365-fetch:teams-search [--name me] [--since auto]`

### Outlook 캘린더

```bash
node .../cli.mjs calendar list                   # 캘린더 ID 확인
node .../cli.mjs calendar events --since auto    # 기본 캘린더, 3d slice
node .../cli.mjs calendar events --since 14d --chunk-days 3 --calendar <id>
```

슬래시 커맨드: `/m365-fetch:calendar-events [--since auto]`

### Outlook 메일

```bash
node .../cli.mjs mail inbox --since auto         # inbox 폴더, 3d slice
node .../cli.mjs mail inbox --folder sentitems --since 7d
node .../cli.mjs mail get <messageId> --with-attachments
```

슬래시 커맨드: `/m365-fetch:mail-inbox [--since auto] [--folder inbox]`

### Power Automate flow

```bash
# 조회
node .../cli.mjs flow list                        # 기본 env
node .../cli.mjs flow list --owned-only
node .../cli.mjs flow get <flowName>              # flowName = GUID (list 출력에서 확인)
node .../cli.mjs flow runs <flowName> --since auto
node .../cli.mjs flow run-detail <flowName> <runId>

# 변경 (slash 커맨드로는 불가, 터미널 전용)
node .../cli.mjs flow create --from /tmp/flow.json
node .../cli.mjs flow update <flowName> --from /tmp/flow.json
node .../cli.mjs flow delete <flowName>
```

`--from` JSON: `{ "properties": { "displayName": "...", "definition": {...}, "connectionReferences": {...}, "state": "Started|Stopped|Suspended" } }`

슬래시 커맨드:
- `/m365-fetch:flow-list [--env <id>] [--owned-only]`
- `/m365-fetch:flow-runs <flowName> [--since auto]`

## 출력 포맷

Teams 메시지:
```markdown
---
source: teams
alias: team-channel
label: 💫Team
...
---

# 💫Team
## 2026-04-20
### 14:23 - 홍길동
기획 공유의 건
- 📎 [spec.docx](https://...)
*reactions*: like 3
```

Calendar:
```markdown
---
source: outlook-calendar
range: 2026-04-20T10:00:00.000+09:00 ~ 2026-04-21T10:00:00.000+09:00
event_count: 2
---
# 📅 Calendar: 2026-04-20 ~ 2026-04-21
## 2026-04-21
### 13:00-14:00 - 팀 주간회의
주최: Alice <alice@...> · 장소: Conference Room A · 참석: Bob, Carol
```

Mail:
```markdown
---
source: outlook-mail
folder: inbox
message_count: 12
---
# 📧 Mail inbox: ...
## 2026-04-21
### 09:15 - [Weekly digest](https://outlook.office.com/...)
From: Alice <alice@...> · To: Me · 📎 첨부 있음
(본문 markdown)
```

Flow runs:
```markdown
---
source: power-automate-runs
flow_name: abc123-guid
env: Default-<tenant>
run_count: 15
---
# 🔁 Runs: abc123-guid (...)
## 2026-04-21
- 09:00 · **Succeeded** [OK] · 2.50s · trigger: Recurrence — `08584000000000000000`
```

## 캐시 정리 (선택)

`~/tmp/m365-context/`는 호출마다 누적. crontab 한 줄:

```cron
0 3 * * * find ~/tmp/m365-context -type f -mtime +30 -delete
```

## 권한 범위 주의

모든 scope는 **delegated**, 즉 본인이 Teams/Outlook/Flow 앱에서 볼 수 있는 범위로 한정:

- Chat/Channel: 내가 멤버인 것만
- Calendar/Mail: 내 것만 (`.Shared`까지 있으면 타인 공유분 포함)
- Flow: 내가 소유자/공동소유자인 flow. `Flows.Manage.All`로 생성/수정/삭제도 가능.
- application permission 아님 — "조직 전체 대리 읽기" 불가

## 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| `401 Unauthorized` | 토큰 만료. `cli.mjs login` 재실행 |
| `403 Forbidden` (Graph) | 앱 등록에 해당 scope 의 admin consent 미완료 |
| `403 Forbidden` (Flow) | `login --resource flow` 미실행 또는 Flow scope 미승인 |
| `404 Not Found` (chat) | 멤버가 아니거나 chatId 오타 |
| `AADSTS65001` | consent 미수락. admin consent 필요 |
| `AADSTS500011` | scope 이름 오타 |
| `AADSTS700016` | client_id가 테넌트에 없음. tenant_id 재확인 |
| flow environment 해석 실패 | `config.flow.default_env` 명시 또는 `auth.tenant_id` 확인 |

## 파일 구조

```
m365-fetch/
├── .claude-plugin/plugin.json
├── commands/
│   ├── teams-fetch.md          # /m365-fetch:teams-fetch
│   ├── teams-search.md         # /m365-fetch:teams-search
│   ├── calendar-events.md      # /m365-fetch:calendar-events
│   ├── mail-inbox.md           # /m365-fetch:mail-inbox
│   ├── flow-list.md            # /m365-fetch:flow-list
│   └── flow-runs.md            # /m365-fetch:flow-runs
├── scripts/
│   ├── cli.mjs                 # commander nested tree 엔트리
│   ├── auth.mjs                # MSAL + multi-resource (graph/flow)
│   ├── config.mjs              # yaml 로더 + legacy 자동 이전 + 풀 scope 기본값
│   ├── state.mjs               # last-read.yaml 관리
│   ├── tz.mjs                  # KST 규약 + sliceIsoRange
│   ├── sliced-fetch.mjs        # 3일 윈도우 순차 수집 래퍼
│   ├── graph.mjs               # Teams chat/channel Graph wrapper
│   ├── render.mjs              # Teams message → markdown (turndown)
│   ├── search.mjs              # Teams search
│   ├── inbox.mjs               # Teams inbox aggregator
│   ├── calendar.mjs            # Outlook calendar
│   ├── mail.mjs                # Outlook mail
│   ├── flow.mjs                # Power Automate CRUD + runs
│   ├── cache.mjs               # Teams 캐시 (0.5.0+ SSOT 로드맵)
│   └── urlParser.mjs
├── test/                       # node:test — 85+ 케이스
├── package.json
└── README.md
```

## 로드맵

- [x] 0.4.0: `msteams-fetch` → `m365-fetch` rename + Outlook/Flow 전면 통합 + nested CLI + since=last-read + 3일 슬라이스
- [ ] 0.5.0: People/Presence/OnlineMeetings/Tasks 커맨드. `last-read` SSOT 기반 inbox 스타일 자동 수집.
- [ ] 0.6.0: Files(OneDrive/SharePoint) 컨텍스트 로드, Team/Channel 디렉토리 index.
- [ ] 0.7.0+: 로컬 캐시 SSOT + sync cron (기존 msteams-fetch 0.4.0 로드맵).
