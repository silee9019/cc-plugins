---
description: tutor 설정 (Obsidian vault, 학습 노트 경로)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# tutor 설정

Obsidian vault와 학습 노트 저장 경로를 설정하여 `~/.claude/plugins/data/tutor-cc-plugins/config.md`에 저장한다.

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

### Step 2: 기존 설정 확인 및 버전 비교

기존 설정 파일을 찾는다:

`~/.claude/plugins/data/tutor-cc-plugins/config.md`

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | 기존 값을 기본값으로 사용. 아래 **버전 비교** 분기 적용 후 Step 3으로 진행 |
| 파일 없음 | Step 3으로 진행 (신규 설정) |

**`setup_version` 파싱** (1번 파일이 존재할 때):

```sh
CONFIG_PATH="$HOME/.claude/plugins/data/tutor-cc-plugins/config.md"
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

**분기 처리**:

| 케이스 | 동작 |
|--------|------|
| config 있음 + `setup_version` 없음 | "이전 버전 기록 없음 — 업그레이드로 간주합니다" 안내 후 진행 |
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

### Step 4: 학습 노트 경로 설정

AskUserQuestion으로 학습 노트 경로를 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `study_base_path` | 학습 노트 루트 폴더 | `30 Resources/study` |
| `quiz_results_path` | 퀴즈 결과 저장 폴더 | `30 Resources/study/_quiz-results` |
| `dashboard_path` | 학습 대시보드 노트 경로 | `30 Resources/study/_dashboard.md` |

- 기존 설정이 있으면 해당 값을 기본값으로 제안
- 사용자가 기본값을 수락하면 해당 값 사용

### Step 5: 설정 파일 생성

`~/.claude/plugins/data/tutor-cc-plugins/config.md` 경로에 설정 파일을 생성한다.
디렉토리가 없으면 먼저 생성.

**config.md 형식** (frontmatter 최상단에 `setup_version` 추가):

```yaml
---
setup_version: "<PLUGIN_VERSION>"
vault: "<선택된 vault 이름>"
study_base_path: "<학습 노트 루트 폴더>"
quiz_results_path: "<퀴즈 결과 저장 폴더>"
dashboard_path: "<대시보드 노트 경로>"
---
```

### Step 6: 설정 요약 출력

설정 완료 후 아래 형식으로 요약 출력:

```
tutor 설정 완료:
  setup_version:      <PLUGIN_VERSION>
  vault:              <vault 이름>
  study_base_path:    <학습 노트 루트 폴더>
  quiz_results_path:  <퀴즈 결과 저장 폴더>
  dashboard_path:     <대시보드 노트 경로>
  config:             ~/.claude/plugins/data/tutor-cc-plugins/config.md
```
