---
description: tutor 설정 (Obsidian vault, 학습 노트 경로)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# tutor 설정

Obsidian vault와 학습 노트 저장 경로를 설정하여 `~/.claude/plugins/data/tutor-cc-plugins/config.md`에 저장한다.

## Workflow

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

### Step 2: 기존 설정 확인

아래 순서로 설정을 찾는다:

1. `~/.claude/plugins/data/tutor-cc-plugins/config.md` (기존 tutor 설정)
2. `~/.claude/plugins/data/silee-planner-cc-plugins/config.md` (vault 이름만 참조)

| 케이스 | 처리 |
|--------|------|
| 1번 파일 존재 | 기존 값을 기본값으로 사용하여 Step 3으로 진행 |
| 2번 파일만 존재 | `vault` 값만 기본값으로 가져오기. Step 3으로 진행 |
| 둘 다 없음 | Step 3으로 진행 (신규 설정) |

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

**config.md 형식**:

```yaml
---
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
  vault:              <vault 이름>
  study_base_path:    <학습 노트 루트 폴더>
  quiz_results_path:  <퀴즈 결과 저장 폴더>
  dashboard_path:     <대시보드 노트 경로>
  config:             ~/.claude/plugins/data/tutor-cc-plugins/config.md
```
