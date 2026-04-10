---
description: silee-planner 설정 (Obsidian vault, 폴더 경로, Daily Notes 경로, 파일 제목 형식)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# silee-planner 설정

Obsidian vault, Issue Box 폴더 경로, Daily Notes 경로, 파일 제목 형식을 설정하여 `~/.claude/plugins/data/silee-planner-cc-plugins/config.md`에 저장한다.

## Workflow

### Step 0: 플러그인 버전 읽기

현재 설치된 플러그인 버전을 읽어 이후 단계에서 비교/기록에 사용한다.

```sh
PLUGIN_VERSION=$(grep '"version"' "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" \
  | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
```

### Step 1: Obsidian CLI 설치 확인

`obsidian --help` 실행.

- **설치됨**: Step 2로 진행
- **미설치**: 아래 안내를 출력하고 중단

```
Obsidian CLI가 설치되어 있지 않습니다.

설치 방법:
  brew tap nicosm/tools
  brew install obsidian-cli

설치 후 다시 실행해주세요.
```

### Step 2: 기존 설정 확인 (마이그레이션 + 버전 비교)

아래 순서로 설정 파일을 찾는다:

1. `~/.claude/plugins/data/silee-planner-cc-plugins/config.md` (현재 버전)
2. `~/.claude/plugins/data/issue-box-cc-plugins/config.md` (이전 버전)

| 케이스 | 처리 |
|--------|------|
| 1번 파일 존재 | 기존 값을 기본값으로 사용. 아래 **버전 비교** 분기 적용 후 Step 3으로 진행 |
| 2번 파일만 존재 | **issue-box → silee-planner 마이그레이션**: 기존 값을 기본값으로 사용. "기존 issue-box 설정을 silee-planner로 마이그레이션합니다." 안내. `PREV_VERSION`은 없음으로 간주. Step 3으로 진행 |
| 둘 다 없음 | Step 3으로 진행 (신규 설정) |

추가로 `~/.claude/plugins/cache/cc-plugins/weekly-report/*/data/user-config.json` 탐색:
- 파일 존재 시: `authorEmail` 값을 Step 8의 `author_email` 기본값으로 사용

**`setup_version` 파싱** (1번 파일이 존재할 때):

```sh
CONFIG_PATH="$HOME/.claude/plugins/data/silee-planner-cc-plugins/config.md"
PREV_VERSION=$(sed -n 's/^setup_version: *"\(.*\)"$/\1/p' "$CONFIG_PATH" | head -1)
```

**`sort -V` 호환성 탐지**:

```sh
if printf '1\n2\n' | sort -V >/dev/null 2>&1; then
  SORT_V_OK=1
else
  SORT_V_OK=0
fi
```

**버전 비교 함수**:

```sh
compare_semver() {
  a="$1"; b="$2"
  if [ "$a" = "$b" ]; then echo equal; return; fi
  if [ "$SORT_V_OK" = "1" ]; then
    if [ "$(printf '%s\n%s\n' "$a" "$b" | sort -V | head -1)" = "$a" ]; then
      echo upgrade
    else
      echo downgrade
    fi
  else
    echo "$a $b" | awk '{
      n=split($1,A,"."); split($2,B,".")
      for (i=1; i<=n || i<=length(B); i++) {
        av=(A[i]==""?0:A[i]+0); bv=(B[i]==""?0:B[i]+0)
        if (av<bv) { print "upgrade"; exit }
        if (av>bv) { print "downgrade"; exit }
      }
      print "equal"
    }'
  fi
}
```

**버전 비교 분기** (1번 파일이 존재할 때만 수행):

| 케이스 | 동작 |
|--------|------|
| `PREV_VERSION` 없음 (기존 config에 필드 없음) | "이전 버전 기록 없음 — 업그레이드로 간주합니다" 안내 후 진행 |
| `PREV_VERSION` == `PLUGIN_VERSION` | "이미 최신 버전입니다 (`<PLUGIN_VERSION>`)" 안내, AskUserQuestion으로 **계속/취소** |
| `PREV_VERSION` < `PLUGIN_VERSION` | 업그레이드 알림 출력 + 기존 값을 기본값으로 유지 |
| `PREV_VERSION` > `PLUGIN_VERSION` | "설정 파일이 플러그인보다 높은 버전입니다" 경고 + 사용자 확인 후 진행 |

**업그레이드 알림 블록**:

```
⬆ 플러그인 업그레이드 감지: <PREV_VERSION> → <PLUGIN_VERSION>
이전 설정을 기본값으로 유지하며 재설정을 진행합니다.
```

### Step 3: Vault 선택

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

기존 설정에 vault가 있으면 해당 값을 기본값으로 제안.

### Step 4: Issue Box 폴더 경로 설정

AskUserQuestion으로 4개 폴더 경로를 순서대로 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `inbox_folder_path` | 새로 보관되는 이슈 (open 상태) | `issue-box` |
| `in_progress_folder_path` | 작업 중인 이슈 (in-progress 상태) | `issue-box/진행중` |
| `resolved_folder_path` | 해결된 이슈 (resolved 상태) | `issue-box/완료` |
| `dismissed_folder_path` | 폐기된 이슈 (dismissed 상태) | `issue-box/폐기` |

- 기존 설정이 있으면 해당 값을 기본값으로 제안
- 사용자가 기본값을 수락하면 해당 값 사용

### Step 5: Daily Notes 경로 설정

AskUserQuestion으로 Daily Notes 경로를 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `daily_notes_path` | Daily Notes 폴더 경로 패턴 | `01 Daily Notes/{YYYY}/{MM}` |
| `daily_note_format` | Daily Note 파일명 형식 | `{YYYY}-{MM}-{DD}` |

- 사용 가능 변수: `{YYYY}`, `{MM}`, `{DD}`
- 예시: `01 Daily Notes/2026/04/2026-04-08.md`

### Step 6: Weekly Notes 경로 설정

AskUserQuestion으로 Weekly Notes 경로를 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `weekly_notes_path` | Weekly Notes 폴더 경로 패턴 | `02 Weekly Notes/{YYYY}` |
| `weekly_note_format` | Weekly Note 파일명 형식 | `{YYYY} Week-{WW}` |

- 사용 가능 변수: `{YYYY}`, `{MM}`, `{WW}`
- `{WW}`: ISO 8601 주 번호 (zero-padded). 계산: `date -j -f "%Y-%m-%d" "$date" "+%V"`
- 예시: `02 Weekly Notes/2026/2026 Week-15.md`

### Step 7: Monthly Notes 경로 설정

AskUserQuestion으로 Monthly Notes 경로를 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `monthly_notes_path` | Monthly Notes 폴더 경로 패턴 | `03 Monthly Notes/{YYYY}` |
| `monthly_note_format` | Monthly Note 파일명 형식 | `{YYYY}-{MM}` |

- 사용 가능 변수: `{YYYY}`, `{MM}`
- 예시: `03 Monthly Notes/2026/2026-04.md`

### Step 8: 작성자 이메일 설정

AskUserQuestion으로 주간 보고서용 Git author 이메일을 묻는다.

**기본값 후보 수집 순서**:
1. 마이그레이션에서 가져온 `authorEmail` (Step 2에서 weekly-report 캐시 발견 시)
2. `git config user.email` (현재 레포)
3. `git config --global user.email`

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `author_email` | 주간 보고서 Git author 이메일 | 위 후보 중 첫 번째 |

### Step 9-A: Repositories 기본 경로 설정

AskUserQuestion으로 주간 회고에서 커밋을 수집할 Git 저장소 루트 경로를 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `repos_base_path` | 활성 레포 자동 탐지의 루트 (2단계까지 재귀 탐색) | 현재 `cwd`에서 `Repositories` 세그먼트 추출 |

- 기존 설정이 있으면 해당 값을 기본값으로 제안
- 자동 탐지 실패 시 기본값은 빈 문자열이며, 사용자가 경로를 직접 입력
- 예시: `/Users/silee/ResilioSync/silee-drive/Repositories`

### Step 9-B: Atlassian 연동 설정 (선택)

AskUserQuestion으로 Jira/Confluence 사이트 URL을 묻는다. 입력하지 않으면(빈 문자열) Atlassian 수집을 비활성화한다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `atlassian_site_url` | Atlassian Cloud site URL (예: `https://company.atlassian.net`) | 빈 문자열 |
| `atlassian_cloud_id` | 자동 탐지 후 캐시됨 (수동 입력 불필요) | 빈 문자열 |

- `atlassian_site_url`이 빈 문자열이면 weekly-report에서 Atlassian 수집 전체 스킵
- `atlassian_cloud_id`는 weekly-report가 최초 실행 시 `getAccessibleAtlassianResources`로 조회하여 자동 캐시

### Step 10: file_title_format 설정

AskUserQuestion으로 파일 제목 형식을 묻는다.

- 기본값: `{date} {category} {title}`
- 사용 가능 변수: `{category}`, `{title}`, `{date}`
- 예시: `2026-04-08 bug 로그인 에러 메시지 누락.md`

### Step 11: 설정 파일 생성

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 경로에 설정 파일을 생성한다.
디렉토리가 없으면 먼저 생성.

**config.md 형식**:

```yaml
---
setup_version: "<PLUGIN_VERSION>"
vault: "<선택된 vault 이름>"
daily_notes_path: "<Daily Notes 폴더 경로 패턴>"
daily_note_format: "<Daily Note 파일명 형식>"
weekly_notes_path: "<Weekly Notes 폴더 경로 패턴>"
weekly_note_format: "<Weekly Note 파일명 형식>"
monthly_notes_path: "<Monthly Notes 폴더 경로 패턴>"
monthly_note_format: "<Monthly Note 파일명 형식>"
author_email: "<Git author 이메일>"
inbox_folder_path: "<inbox 폴더 경로>"
in_progress_folder_path: "<진행중 폴더 경로>"
resolved_folder_path: "<완료 폴더 경로>"
dismissed_folder_path: "<폐기 폴더 경로>"
repos_base_path: "<Git 저장소 루트 경로>"
atlassian_site_url: "<Atlassian Cloud site URL (선택)>"
atlassian_cloud_id: "<자동 캐시 - 비워둠>"
file_title_format: "<파일 제목 형식>"
---
```

### Step 12: 설정 요약 출력

설정 완료 후 아래 형식으로 요약 출력:

```
silee-planner 설정 완료:
  setup_version:            <PLUGIN_VERSION>
  vault:                    <vault 이름>
  daily_notes_path:         <Daily Notes 경로 패턴>
  daily_note_format:        <Daily Note 파일명 형식>
  weekly_notes_path:        <Weekly Notes 경로 패턴>
  weekly_note_format:       <Weekly Note 파일명 형식>
  monthly_notes_path:       <Monthly Notes 경로 패턴>
  monthly_note_format:      <Monthly Note 파일명 형식>
  author_email:             <Git author 이메일>
  inbox_folder_path:        <inbox 폴더 경로>
  in_progress_folder_path:  <진행중 폴더 경로>
  resolved_folder_path:     <완료 폴더 경로>
  dismissed_folder_path:    <폐기 폴더 경로>
  repos_base_path:          <Git 저장소 루트 경로>
  atlassian_site_url:       <Atlassian site URL 또는 "(미설정)">
  file_title_format:        <파일 제목 형식>
  config:                   ~/.claude/plugins/data/silee-planner-cc-plugins/config.md
```
