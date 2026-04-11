---
description: Memento 메모리+멘토 시스템 초기 설정 (통합 config 생성 + vault 이전 + silee-planner 병합 + qmd 등록 + capture 룰 설치)
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# Memento Setup

memento 데이터를 Obsidian vault 내부로 이전하고, Memory + Mentor 통합 config를 기록한다.
silee-planner config가 존재하면 Mentor 키를 병합하고 active-reminders.md를 vault 내부로 이전한다.
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

**기존 config 파싱** (있을 때):

```sh
PREV_VERSION=$(sed -n 's/^setup_version: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_VAULT_PATH=$(sed -n 's/^vault_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_MEMENTO_ROOT=$(sed -n 's/^memento_root: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
# Mentor 키 (통합 이후)
PREV_DAILY_PATH=$(sed -n 's/^daily_notes_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_DAILY_FORMAT=$(sed -n 's/^daily_note_format: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_WEEKLY_PATH=$(sed -n 's/^weekly_notes_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_WEEKLY_FORMAT=$(sed -n 's/^weekly_note_format: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_MONTHLY_PATH=$(sed -n 's/^monthly_notes_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_INBOX=$(sed -n 's/^inbox_folder_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_INPROGRESS=$(sed -n 's/^in_progress_folder_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_RESOLVED=$(sed -n 's/^resolved_folder_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_DISMISSED=$(sed -n 's/^dismissed_folder_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_FILE_TITLE=$(sed -n 's/^file_title_format: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_AUTHOR=$(sed -n 's/^author_email: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_REPOS=$(sed -n 's/^repos_base_path: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_ATLASSIAN_URL=$(sed -n 's/^atlassian_site_url: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
PREV_ATLASSIAN_CLOUD=$(sed -n 's/^atlassian_cloud_id: *"\(.*\)"$/\1/p' "$CONFIG_FILE" | head -1)
```

### Step 2a: silee-planner config 탐지 및 Mentor 키 수집

silee-planner가 쓰던 config에서 Mentor 키들을 읽어 통합 config에 병합할 준비를 한다.

```sh
SP_CONFIG="$HOME/.claude/plugins/data/silee-planner-cc-plugins/config.md"
SP_VAULT=""
SP_DAILY_PATH=""
SP_DAILY_FORMAT=""
SP_WEEKLY_PATH=""
SP_WEEKLY_FORMAT=""
SP_MONTHLY_PATH=""
SP_INBOX=""
SP_INPROGRESS=""
SP_RESOLVED=""
SP_DISMISSED=""
SP_FILE_TITLE=""
SP_AUTHOR=""
SP_REPOS=""
SP_ATLASSIAN_URL=""
SP_ATLASSIAN_CLOUD=""

if [ -f "$SP_CONFIG" ]; then
  SP_VAULT=$(sed -n 's/^vault: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_DAILY_PATH=$(sed -n 's/^daily_notes_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_DAILY_FORMAT=$(sed -n 's/^daily_note_format: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_WEEKLY_PATH=$(sed -n 's/^weekly_notes_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_WEEKLY_FORMAT=$(sed -n 's/^weekly_note_format: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_MONTHLY_PATH=$(sed -n 's/^monthly_notes_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_INBOX=$(sed -n 's/^inbox_folder_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_INPROGRESS=$(sed -n 's/^in_progress_folder_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_RESOLVED=$(sed -n 's/^resolved_folder_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_DISMISSED=$(sed -n 's/^dismissed_folder_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_FILE_TITLE=$(sed -n 's/^file_title_format: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_AUTHOR=$(sed -n 's/^author_email: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_REPOS=$(sed -n 's/^repos_base_path: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_ATLASSIAN_URL=$(sed -n 's/^atlassian_site_url: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  SP_ATLASSIAN_CLOUD=$(sed -n 's/^atlassian_cloud_id: *"\(.*\)"$/\1/p' "$SP_CONFIG" | head -1)
  echo "[memento] silee-planner config 발견 — Mentor 키 병합 준비"
fi
```

**스키마 정규화 주의**: silee-planner는 `daily_notes_path`에 `{YYYY}/{MM}` 같은 형식 마커를 포함했으나, 통합 스키마는 **base 경로(`01 Daily Notes`)와 format(`{YYYY}/{MM}/{YYYY}-{MM}-{DD}.md`)을 분리**한다. 감지된 값에 `{` 마커가 포함되어 있으면 아래와 같이 분리한다:

```sh
normalize_notes_path() {
  local path="$1" fmt="$2"
  # path에 {YYYY}가 포함되어 있으면 base만 추출
  case "$path" in
    *"{"*)
      BASE_PATH="${path%%/\{*}"
      # format은 path의 나머지 + 기존 format + .md
      TAIL="${path#${BASE_PATH}}"
      NORMALIZED_FORMAT="${TAIL#/}/${fmt}.md"
      ;;
    *)
      BASE_PATH="$path"
      NORMALIZED_FORMAT="${fmt}"
      ;;
  esac
}
```

병합은 **기존 memento config 값이 있으면 우선**, 없으면 silee-planner 값, 그것도 없으면 기본값 순으로 선택한다 (Step 7에서 실제 기록).

**vault_path 충돌 감지**: `PREV_VAULT_PATH`가 있고 `SP_VAULT` 이름에서 유도된 경로와 다르면 AskUserQuestion으로 확인한다.

### Step 3: vault 탐지 & 선택

`obsidian vaults verbose` 실행하여 vault 목록과 경로 파악.

1. **silee-planner config 우선 참조**: `~/.claude/plugins/data/silee-planner-cc-plugins/config.md`가 있으면 `vault` 값을 1순위 기본값으로 제시.
2. **기존 memento config가 있으면** `PREV_VAULT_PATH`를 1순위로 사용 (Step 2에서 읽음).
3. vault 선택:
   - 0개: "Obsidian vault가 없습니다." 안내 후 중단
   - 1개: 자동 선택
   - 2개+: AskUserQuestion으로 선택

선택된 vault의 **절대경로**를 `VAULT_PATH`에 저장한다. 심볼릭 링크 resolve는:

```sh
VAULT_PATH=$(cd "$selected_vault_path" && pwd -P)
```

### Step 4: memento_root 서브디렉토리 설정

AskUserQuestion으로 vault 내 memento 루트 서브디렉토리를 묻는다.

- 기본값: `_memento` (언더스코어 prefix로 Obsidian 사이드바 상단 고정 + 일반 노트와 시각적 분리)
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
   - `rsync -a --remove-source-files`: 권한/타임스탬프 보존 + 파일 단위 원자성 + 교차 볼륨 안전 + 재실행 시 이어 받기
   - `find -empty -delete`: rsync는 빈 디렉토리를 지우지 않으므로 별도 정리
4. **스킵 선택 시**: 레거시 데이터는 그대로, 새 경로에 빈 구조만 생성 (Step 6)

### Step 6: 디렉토리 구조 생성 (idempotent)

```sh
mkdir -p "$NEW_HOME/user/knowledge"
mkdir -p "$NEW_HOME/projects"
```

프로젝트별 디렉토리(WORKING.md, memory/, knowledge/, plans/)는 session-start.sh가 세션 시작 시 자동 생성하므로 setup에서는 생성하지 않는다 (project_id에 의존하기 때문).

템플릿 파일은 기존 파일이 있으면 덮어쓰지 않는다 (`[ ! -f ]` 가드).

user/ROOT.md가 없으면 템플릿에서 복사:

```sh
if [ ! -f "$NEW_HOME/user/ROOT.md" ]; then
  cp "${CLAUDE_PLUGIN_ROOT}/templates/USER-ROOT.md" "$NEW_HOME/user/ROOT.md"
fi
```

### Step 7: config.md 생성 (먼저 — 원자성 확보)

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
# Mentor 레이어 (silee-planner에서 이전)
daily_notes_path: "<DAILY_PATH>"
daily_note_format: "<DAILY_FORMAT>"
weekly_notes_path: "<WEEKLY_PATH>"
weekly_note_format: "<WEEKLY_FORMAT>"
monthly_notes_path: "<MONTHLY_PATH>"
inbox_folder_path: "<INBOX>"
in_progress_folder_path: "<INPROGRESS>"
resolved_folder_path: "<RESOLVED>"
dismissed_folder_path: "<DISMISSED>"
file_title_format: "<FILE_TITLE>"
# 외부 연동 (옵션)
author_email: "<AUTHOR_EMAIL>"
repos_base_path: "<REPOS_BASE>"
atlassian_site_url: "<ATLASSIAN_URL>"
atlassian_cloud_id: "<ATLASSIAN_CLOUD>"
---
```

**값 선택 우선순위** (각 Mentor 키별):

1. `PREV_*` (기존 memento config v2 이상)
2. `SP_*` (silee-planner config, 정규화 후)
3. 기본값:
   - `daily_notes_path`: `"01 Daily Notes"`
   - `daily_note_format`: `"{YYYY}/{MM}/{YYYY}-{MM}-{DD}.md"`
   - `weekly_notes_path`: `"02 Weekly Notes"`
   - `weekly_note_format`: `"{YYYY}/{YYYY} Week-{WW}.md"`
   - `monthly_notes_path`: `"02 Weekly Notes"`
   - `inbox_folder_path`: `"00 Issue Box/00-inbox"`
   - `in_progress_folder_path`: `"00 Issue Box/01-in-progress"`
   - `resolved_folder_path`: `"00 Issue Box/02-done"`
   - `dismissed_folder_path`: `"00 Issue Box/03-dismissed"`
   - `file_title_format`: `"{date} {category} {title}"`
   - 기타(`author_email`/`repos_base_path`/`atlassian_*`): 빈 문자열

**모호한 경우 인터뷰**: `PREV_*`와 `SP_*`가 모두 존재하고 서로 다르면 한 번에 하나씩 AskUserQuestion으로 선택. 예: `"daily_notes_path: memento는 A, silee-planner는 B. 어느 쪽을 쓸까요?"` — 가정하지 말 것.

이 단계가 성공해야 이후 hook/compact 스크립트가 새 경로를 인식한다.
실패 시 setup 전체를 재실행해도 멱등하다.

### Step 7a: silee-planner config deprecation 마킹

병합 성공 후 원본 silee-planner config를 삭제하지 않고 frontmatter에 `deprecated: true` 마커만 추가한다. 데이터 손실 방지용.

```sh
if [ -f "$SP_CONFIG" ] && ! grep -q '^deprecated: true' "$SP_CONFIG"; then
  # frontmatter 첫 줄(---) 다음에 deprecated 마커 삽입
  awk 'NR==1 && /^---$/ {print; print "deprecated: true"; print "deprecated_at: \"'"$(date +%Y-%m-%d)"'\""; print "deprecated_reason: \"merged into memento v2.0.0\""; next} {print}' "$SP_CONFIG" > "$SP_CONFIG.tmp" && mv "$SP_CONFIG.tmp" "$SP_CONFIG"
  echo "[memento] silee-planner config deprecated 마킹 완료"
fi
```

### Step 7b: active-reminders.md 이전

silee-planner가 쓰던 `active-reminders.md`를 vault 내부 `_memento/user/` 아래로 복사한다. ResilioSync로 장비 간 공유 가능해진다.

```sh
SP_REMINDERS="$HOME/.claude/plugins/data/silee-planner-cc-plugins/active-reminders.md"
NEW_REMINDERS="$NEW_HOME/user/active-reminders.md"

if [ -f "$SP_REMINDERS" ]; then
  if [ ! -f "$NEW_REMINDERS" ]; then
    cp "$SP_REMINDERS" "$NEW_REMINDERS"
    mv "$SP_REMINDERS" "$SP_REMINDERS.migrated"
    echo "[memento] active-reminders.md → $NEW_REMINDERS 이전 완료 (원본: .migrated 접미사 보존)"
  else
    echo "[memento] $NEW_REMINDERS가 이미 존재 — 이전 스킵 (수동 병합 필요 시 직접 처리)"
  fi
fi
```

### Step 7c: vault `.claude/rules/memento-capture.md` 설치

자연 캡처 룰 파일을 vault에 설치한다. vault CLAUDE.md 룰 시스템이 모든 세션에 자동 주입하므로, 사용자가 "이거 담아둬" 같은 자연어를 쓰면 Claude가 즉시 `/memento:capture-task`를 호출한다. 별도 capture 스킬 신설하지 않음.

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
- 사용자가 이슈를 인지했지만 지금 즉시 처리하지 않을 때 (해결되지 않은 미해결 항목)

행동 원칙:
- 사용자의 흐름을 끊지 말 것. 한 줄 확인 → 호출 → 다음 단계로 즉시 복귀
- 인자에는 사용자가 말한 요지를 가능한 그대로 (요약하지 말 것)
- 이미 진행 중인 작업은 캡처하지 않음 (in-progress와 inbox 구분)
- capture가 자연스럽게 끝나면 원래 대화 흐름으로 복귀
CAPTURE_RULE_EOF

echo "[memento] capture 룰 파일 설치: $CAPTURE_RULE"
```

이 파일은 `memento:setup` 재실행 시마다 덮어쓴다 (룰 내용을 setup이 단일 소스로 관리).

### Step 8: qmd collection 재등록

config.md가 유효한 상태일 때만 수행.

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
     (cd "$NEW_HOME/projects/$PROJECT_ID" && qmd collection add .) || echo "[memento] qmd add project failed — 수동 재시도 필요" >&2
   fi
   ```

qmd 재등록 실패는 치명적이지 않음 — 다음 setup 재실행 시 복구 가능.

### Step 9: 구 캐시 정리

memento 플러그인 캐시 디렉토리를 스캔하여 현재 버전 외 구 버전이 있는지 확인:

```sh
ls -d ~/.claude/plugins/cache/cc-plugins/memento/*/ 2>/dev/null
```

- 구 버전 디렉토리가 존재하면 사용자에게 목록을 보여주고 AskUserQuestion으로 삭제 여부 확인
- 현재 버전만 있으면 "구 캐시 없음" 출력 후 다음 Step으로

### Step 10: 완료 확인 & 요약 출력

```
memento 설정 완료:
  setup_version: <PLUGIN_VERSION>
  vault_path:    <VAULT_PATH>
  memento_root:  <MEMENTO_ROOT>
  new_home:      <VAULT_PATH>/<MEMENTO_ROOT>
  config:        ~/.claude/plugins/data/memento-cc-plugins/config.md

디렉토리 구조:
  user:          <NEW_HOME>/user/
  projects:      <NEW_HOME>/projects/

qmd collection 등록 상태: (qmd collection list 출력)

⚠ 중요: 새 memento 경로는 **다음 세션부터** 적용됩니다.
현재 세션을 종료하고 재시작한 후 정상 동작을 확인해주세요.
SessionStart hook이 주입한 경로는 현재 세션의 system prompt에 고정되어 있습니다.

ResilioSync를 일시 중지했다면 재개해주세요.
```

이후 Layer 1 파일 존재 확인 (WORKING.md는 다음 세션에 생성됨):
- `<NEW_HOME>/user/ROOT.md` 존재 여부
- qmd collection 등록 상태 (프로젝트 + user)
