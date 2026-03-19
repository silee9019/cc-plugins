---
description: issue-box 설정 (Obsidian vault, 폴더 경로, 파일 제목 형식)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# issue-box 설정

Obsidian vault, 저장 폴더, 파일 제목 형식을 설정하여 `~/.claude/plugins/data/issue-box-cc-plugins/config.md`에 저장한다.

## Workflow

### Step 1: Obsidian CLI 설치 확인

`obsidian --version` 실행.

- **설치됨**: Step 2로 진행
- **미설치**: 아래 안내를 출력하고 중단

```
Obsidian CLI가 설치되어 있지 않습니다.

설치 방법:
  brew tap nicosm/tools
  brew install obsidian-cli

설치 후 다시 실행해주세요.
```

### Step 2: Vault 선택

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

### Step 3: folder_path 설정

AskUserQuestion으로 이슈 저장 폴더 경로를 묻는다.

- 기본값: `issue-box` (vault 루트 기준)
- 사용자가 커스텀 경로를 입력하면 해당 값 사용
- 사용자가 기본값을 수락하면 `issue-box` 사용

### Step 4: file_title_format 설정

AskUserQuestion으로 파일 제목 형식을 묻는다.

- 기본값: `{category} {title}`
- 사용 가능 변수: `{category}`, `{title}`, `{date}`
- 예시: `{category} {title}` → `bug 로그인 에러 메시지 누락.md`

### Step 5: 설정 파일 생성

`~/.claude/plugins/data/issue-box-cc-plugins/config.md` 경로에 설정 파일을 생성한다.
디렉토리가 없으면 먼저 생성.

**config.md 형식**:

```yaml
---
vault: "<선택된 vault 이름>"
folder_path: "<폴더 경로>"
file_title_format: "<파일 제목 형식>"
---
```

### Step 6: 설정 요약 출력

설정 완료 후 아래 형식으로 요약 출력:

```
issue-box 설정 완료:
  vault:             <vault 이름>
  folder_path:       <폴더 경로>
  file_title_format: <파일 제목 형식>
  config:            ~/.claude/plugins/data/issue-box-cc-plugins/config.md
```
