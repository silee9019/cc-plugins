---
name: setup
description: Memento 메모리+멘토 시스템 초기 설정 (통합 config 생성 + vault 이전 + qmd 등록 + capture 룰 설치). 사용자가 "memento 설정", "memento setup", "memento 초기화", "memento 경로 바꿔줘", "vault 연결"을 언급할 때 트리거.
user_invocable: true
---

# Memento Setup

memento 데이터를 Obsidian vault 내부로 이전하고, Memory + Mentor 통합 config를 기록한다.
모든 단계는 멱등(idempotent) — 여러 번 실행해도 동일한 결과.

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

## Workflow

### Step 1: 플러그인 버전 & qmd 설치 확인

**플러그인 버전 읽기**:

```sh
PLUGIN_VERSION=$(grep '"version"' "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" \
  | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
```

**qmd 설치 확인**:

```sh
which qmd
```

설치되어 있지 않으면 사용자에게 안내:
- `npm install -g qmd` 또는 `bun install -g qmd`

### Step 2: 기존 memento config 확인 및 버전 비교

```sh
CONFIG_FILE="$HOME/.claude/plugins/data/memento-cc-plugins/config.md"
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

**분기**:

| 케이스 | 처리 |
|--------|------|
| config 없음 | **신규 설정** — Step 3부터 신규 플로우로 진행 (기존 `~/.claude/memento/` 데이터가 있다면 Step 5에서 마이그레이션 여부 결정) |
| config 있음 + `setup_version` 없음 | "이전 버전 기록 없음 — 업그레이드로 간주합니다" 안내 + 기존 값을 기본값으로 |
| `PREV_VERSION` == `PLUGIN_VERSION` | "이미 최신 버전입니다" 안내, AskUserQuestion으로 계속/취소 |
| `PREV_VERSION` < `PLUGIN_VERSION` | 업그레이드 알림 + 기존 `vault_path`, `memento_root`를 기본값으로 유지 |
| `PREV_VERSION` > `PLUGIN_VERSION` | 경고 + 사용자 확인 후 진행 |

**기존 config 파싱** (있을 때) — `PREV_*` 변수들로 기존 값 로드 (Memory/Mentor/사용자식별/외부연동 키 전체).

**마이그레이션 (구 키 → 일반형 키)**:

```sh
# user_id ← github_username
if [ -z "$PREV_USER_ID" ] && [ -n "$PREV_GITHUB" ]; then
  PREV_USER_ID="$PREV_GITHUB"
fi

# aliases ← github_aliases
if [ -z "$PREV_ALIASES" ] && [ -n "$PREV_GITHUB_ALIASES" ]; then
  PREV_ALIASES="$PREV_GITHUB_ALIASES"
fi

# email ← author_email
if [ -z "$PREV_EMAIL" ] && [ -n "$PREV_AUTHOR_EMAIL" ]; then
  PREV_EMAIL="$PREV_AUTHOR_EMAIL"
fi
```

마이그레이션 후 구 키 (`github_username`, `github_aliases`, `author_email`)는 Step 7에서 config.md 재작성 시 출력하지 않아 자동 소멸.

### Step 3: vault 탐지 & 선택

`obsidian vaults verbose` 실행하여 vault 목록과 경로 파악.

1. **기존 memento config가 있으면** `PREV_VAULT_PATH`를 1순위로 사용 (Step 2에서 읽음).
2. vault 선택:
   - 0개: "Obsidian vault가 없습니다." 안내 후 중단
   - 1개: 자동 선택
   - 2개+: AskUserQuestion으로 선택

선택된 vault의 **절대경로**를 `VAULT_PATH`에 저장:

```sh
VAULT_PATH=$(cd "$selected_vault_path" && pwd -P)
```

### Step 4: memento_root 서브디렉토리 설정

AskUserQuestion으로 vault 내 memento 루트 서브디렉토리를 묻는다.

- 기본값: `97 Memento` (숫자 접두어 체계로 vault 최하단 고정 + 일반 노트와 시각적 분리)
- 기존 config가 있으면 `PREV_MEMENTO_ROOT`를 기본값으로
- 슬래시 포함 가능 (`Knowledge/Memento` 등)

선택된 값을 `MEMENTO_ROOT`에 저장.

### Step 5: 레거시 데이터 마이그레이션 판단 & 실행

**새 경로**:

```sh
NEW_HOME="$VAULT_PATH/$MEMENTO_ROOT"
LEGACY_HOME="$HOME/.claude/memento"
```

**분기**:

| 케이스 | 처리 |
|--------|------|
| `LEGACY_HOME` 없음 | 신규 — Step 6으로 진행 |
| `LEGACY_HOME` 있음 + `NEW_HOME`에 데이터 있음 | 경고 + 수동 병합 안내, 마이그레이션 스킵하고 Step 6으로 진행 |
| `LEGACY_HOME` 있음 + `NEW_HOME` 비어 있음 | **이동 플로우** 진행 (아래) |

**이동 플로우**:

1. **사전 안내**:
   ```
   ⚠ 마이그레이션 전 확인사항

   - `<vault>`가 ResilioSync로 동기화되는 경우, 동기화를 일시 중지하는 것을 권장합니다.
   - 이동 명령은 rsync --remove-source-files를 사용하며, 중단 시 재실행 가능합니다.
   ```
2. **AskUserQuestion**으로 최종 컨펌 (기본: 이동 / 대안: 스킵)
3. **이동 실행** (컨펌 시):
   ```sh
   mkdir -p "$NEW_HOME"
   rsync -a --remove-source-files "$LEGACY_HOME/" "$NEW_HOME/"
   find "$LEGACY_HOME" -type d -empty -delete 2>/dev/null || true
   ```
4. **스킵 선택 시**: 레거시 데이터는 그대로, 새 경로에 빈 구조만 생성 (Step 6)

### Step 6: 디렉토리 구조 생성 (idempotent)

```sh
mkdir -p "$NEW_HOME/user/knowledge"
mkdir -p "$NEW_HOME/projects"
```

프로젝트별 디렉토리는 session-start.sh가 세션 시작 시 자동 생성.

user/ROOT.md가 없으면 템플릿에서 복사:

```sh
if [ ! -f "$NEW_HOME/user/ROOT.md" ]; then
  cp "${CLAUDE_PLUGIN_ROOT}/templates/USER-ROOT.md" "$NEW_HOME/user/ROOT.md"
fi
```

### Step 6.5: 사용자 식별 정보 수집 (인터뷰 7문항)

memento 스킬들이 "나"가 누구인지 구조적으로 알 수 있도록 7개 일반형 식별 필드를 인터뷰로 수집한다. `atlassian_account_id`는 Step 6.6에서 자동 조회.

**원칙**:
- 각 필드는 `AskUserQuestion`으로 한 번에 하나씩 묻는다.
- **기본값/예시 값을 프롬프트에 하드코딩하지 않는다.**
- 기존 config에서 읽은 `PREV_*` 값이 있으면 질문 텍스트에 "(현재값: <값>)"만 표기.
- **PREV 값을 그대로 유지하려면 빈 값을 입력한다** (빈 입력 = PREV 유지 신호).
- 신규 값을 넣으려면 그 값을 그대로 입력한다. 진짜로 값을 지우려면 한 칸 공백(` `) 입력 후 setup이 `trim` 처리.
- 모든 필드는 빈 문자열 허용.

**수집 순서**:

1. **`display_name_ko`** — 국문 표시 이름. Teams/Slack 멘션 감지.
2. **`display_name_en`** — 영문 표시 이름. 영문 멘션 감지.
3. **`initials`** — 이니셜. 짧은 형식 멘션(`@SI`) 감지.
4. **`user_id`** — 주 아이디/로그인 핸들. GitHub author 매칭.
5. **`nickname`** — 닉네임. 비공식 호칭 감지.
6. **`email`** — 주 이메일. git commit author 매칭.
7. **`aliases`** — 추가 아이디/핸들 (쉼표 구분). 멀티 계정 매칭.

### Step 6.6: `atlassian_account_id` 자동 조회 (atlassianUserInfo MCP)

```
if [ -n "$PREV_ATLASSIAN_AID" ]; then
  ATLASSIAN_AID="$PREV_ATLASSIAN_AID"
  echo "[memento] atlassian_account_id: 기존 값 유지 ($ATLASSIAN_AID)"
else
  echo "[memento] atlassian_account_id: atlassianUserInfo MCP 조회 시도..."
  # ——— LLM 수행 단계 ———
  # 1. mcp__plugin_atlassian_atlassian__atlassianUserInfo 호출 (파라미터 없음)
  # 2. 응답 JSON에서 accountId 필드 추출
  # 3a. 성공: ATLASSIAN_AID="<accountId>"
  # 3b. 실패: ATLASSIAN_AID="" (review-week 첫 실행에서 재시도)
fi
```

- **사용자에게 묻지 않는다** — 자동 조회만이 올바른 UX.
- **cloudId 불필요** — `atlassianUserInfo`는 파라미터 없음.
- **멱등성** — `PREV_ATLASSIAN_AID`가 있으면 재실행 시 MCP 호출 스킵.
- **Graceful degradation** — MCP 없거나 실패해도 setup은 중단되지 않음.

### Step 7: config.md 생성

```sh
mkdir -p "$HOME/.claude/plugins/data/memento-cc-plugins"
```

**통합 config.md 형식** (Memory + Mentor 키 병합):

```yaml
---
setup_version: "<PLUGIN_VERSION>"
# Memory 레이어
vault_path: "<VAULT_PATH>"
memento_root: "<MEMENTO_ROOT>"
# Mentor 레이어
daily_notes_path: "<DAILY_PATH>"
daily_note_format: "<DAILY_FORMAT>"
daily_archive_path: "<DAILY_ARCHIVE_PATH>"
daily_archive_format: "<DAILY_ARCHIVE_FORMAT>"
weekly_notes_path: "<WEEKLY_PATH>"
weekly_note_format: "<WEEKLY_FORMAT>"
monthly_notes_path: "<MONTHLY_PATH>"
monthly_note_format: "<MONTHLY_FORMAT>"
inbox_folder_path: "<INBOX>"
in_progress_folder_path: "<INPROGRESS>"
resolved_folder_path: "<RESOLVED>"
dismissed_folder_path: "<DISMISSED>"
file_title_format: "<FILE_TITLE>"
decision_note_format: "<DECISION_FORMAT>"
daily_log_format: "<DAILY_LOG_FORMAT>"
handoff_note_format: "<HANDOFF_FORMAT>"
# 사용자 식별
display_name_ko: "<DISPLAY_KO>"
display_name_en: "<DISPLAY_EN>"
initials: "<INITIALS>"
user_id: "<USER_ID>"
nickname: "<NICKNAME>"
email: "<EMAIL>"
aliases: "<ALIASES>"
atlassian_account_id: "<ATLASSIAN_AID>"
# 외부 연동 (옵션)
repos_base_path: "<REPOS_BASE>"
atlassian_site_url: "<ATLASSIAN_URL>"
atlassian_cloud_id: "<ATLASSIAN_CLOUD>"
---
```

**중요**: 구 키 `github_username`, `github_aliases`, `author_email`는 config.md에 **출력하지 않는다**.

**값 선택 우선순위** (각 Mentor 키별):

1. `PREV_*` (기존 memento config v2 이상) — **단, 2.7.0 파일명 규칙 통일 예외**:
   - `PREV_VERSION` < `2.7.0`이고 `PREV_DAILY_FORMAT`이 구 포맷이면 **새 기본값으로 강제 교체** 후 안내 (migrate_file_naming.py 스크립트 안내)
   - 그 외 사용자 커스텀 포맷은 유지
2. 기본값:
   - `daily_notes_path`: `"01 Working"`
   - `daily_note_format`: `"{YYYY}-{MM}-{DD}-planning.md"`
   - `daily_archive_path`: 신규 `"99 Archives/Daily"`, 업그레이드 빈 값
   - `daily_archive_format`: 신규 `"{YYYY}/{MM}/{YYYY}-{MM}-{DD}-planning.md"`
   - `weekly_notes_path`: `"10 Reflection/01 Weekly"`
   - `weekly_note_format`: `"{YYYY}/{YYYY}-W{WW}-weekly-review.md"`
   - `monthly_notes_path`: `"10 Reflection/02 Monthly"`
   - `monthly_note_format`: `"{YYYY}/{YYYY}-{MM}-monthly-review.md"`
   - `inbox_folder_path`: `"00 Inbox"`
   - `in_progress_folder_path`: `"01 Working"`
   - `resolved_folder_path`: `""`
   - `dismissed_folder_path`: `""`
   - `file_title_format`: `"{date}-{title}"`
   - `decision_note_format`: `"{YYYY}-{MM}-{DD}-decision-{slug}.md"`
   - `daily_log_format`: `"{YYYY}-{MM}-{DD}-log.md"`
   - `handoff_note_format`: `"{YYYY}-{MM}-{DD}-{HHmm}-handoff-{slug}.md"`
   - 기타(`repos_base_path`/`atlassian_*`): 빈 문자열

### Step 7a: vault `.claude/rules/memento-capture.md` 설치

자연 캡처 룰 파일을 vault에 설치한다.

```sh
RULES_DIR="$VAULT_PATH/.claude/rules"
CAPTURE_RULE="$RULES_DIR/memento-capture.md"
mkdir -p "$RULES_DIR"

cat > "$CAPTURE_RULE" <<'CAPTURE_RULE_EOF'
# memento capture 트리거

대화 중 사용자가 다음 표현이나 의도를 보이면 즉시 `/memento:capture-task "<요지>"` 를
호출해 Issue Box inbox에 담는다. 호출 전 한 줄로 확인한다.

트리거 표현 예시:
- "이거 해야지", "나중에", "백로그에 넣어둬", "담아둬", "기억해둬"
- "todo", "후속 작업", "이슈 만들어"
- 사용자가 이슈를 인지했지만 지금 즉시 처리하지 않을 때

행동 원칙:
- 사용자의 흐름을 끊지 말 것. 한 줄 확인 → 호출 → 다음 단계로 즉시 복귀
- 인자에는 사용자가 말한 요지를 가능한 그대로 (요약하지 말 것)
- 이미 진행 중인 작업은 캡처하지 않음 (in-progress와 inbox 구분)
CAPTURE_RULE_EOF

echo "[memento] capture 룰 파일 설치: $CAPTURE_RULE"
```

이 파일은 `memento:setup` 재실행 시마다 덮어쓴다.

### Step 8: qmd collection 재등록

1. **레거시 collection 제거** (존재 시):
   ```sh
   qmd collection remove "$LEGACY_HOME/projects/<project-id>" 2>/dev/null || true
   qmd collection remove "$LEGACY_HOME/user" 2>/dev/null || true
   ```
2. **새 collection 등록**:
   ```sh
   (cd "$NEW_HOME/user" && qmd collection add .) || echo "[memento] qmd add user failed — 수동 재시도 필요" >&2
   ```
   현재 프로젝트의 project-id는 session-start.sh 로직을 참고하여 결정:
   ```sh
   PROJECT_ID=$(
     REMOTE=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/' | tr '/' '-' | tr '[:upper:]' '[:lower:]')
     if [ -n "$REMOTE" ]; then
       printf '%s' "$REMOTE"
     else
       git rev-parse --show-toplevel 2>/dev/null | tr '/' '-' | tr '[:upper:]' '[:lower:]'
     fi
   )
   if [ -n "$PROJECT_ID" ]; then
     mkdir -p "$NEW_HOME/projects/$PROJECT_ID"
     (cd "$NEW_HOME/projects/$PROJECT_ID" && qmd collection add .) || echo "[memento] qmd add project failed" >&2
   fi
   ```

### Step 9: 구 캐시 정리

```sh
ls -d ~/.claude/plugins/cache/cc-plugins/memento/*/ 2>/dev/null
```

- 구 버전 디렉토리가 존재하면 사용자에게 목록을 보여주고 AskUserQuestion으로 삭제 여부 확인

### Step 10: 완료 확인 & 요약 출력

```
memento 설정 완료:
  setup_version:         <PLUGIN_VERSION>
  vault_path:            <VAULT_PATH>
  memento_root:          <MEMENTO_ROOT>
  new_home:              <VAULT_PATH>/<MEMENTO_ROOT>
  config:                ~/.claude/plugins/data/memento-cc-plugins/config.md

사용자 식별:
  display_name_ko:       <DISPLAY_KO>
  display_name_en:       <DISPLAY_EN>
  initials:              <INITIALS>
  user_id:               <USER_ID>
  nickname:              <NICKNAME>
  email:                 <EMAIL>
  aliases:               <ALIASES>
  atlassian_account_id:  <ATLASSIAN_AID>  <자동조회_접미사>

디렉토리 구조:
  user:          <NEW_HOME>/user/
  projects:      <NEW_HOME>/projects/

qmd collection 등록 상태: (qmd collection list 출력)

⚠ 중요: 새 memento 경로는 **다음 세션부터** 적용됩니다.
현재 세션을 종료하고 재시작한 후 정상 동작을 확인해주세요.

ResilioSync를 일시 중지했다면 재개해주세요.
```

**렌더 규칙**:
- `<자동조회_접미사>`: `ATLASSIAN_AID`가 비어있지 않으면 `(자동 조회)`, 비어있으면 `(자동 조회 실패 — review-week 첫 실행에서 재시도)`.
