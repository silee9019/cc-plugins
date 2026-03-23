---
description: issue-box 설정 (Obsidian vault, 폴더 경로, 파일 제목 형식)
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# issue-box 설정

Obsidian vault, 4개 폴더 경로, 파일 제목 형식을 설정하여 `~/.claude/plugins/data/issue-box-cc-plugins/config.md`에 저장한다.

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

### Step 2: 기존 설정 확인 (마이그레이션)

`~/.claude/plugins/data/issue-box-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | Step 3으로 진행 (신규 설정) |
| `inbox_folder_path` 존재 | 기존 값을 기본값으로 사용하여 Step 3으로 진행 |
| `folder_path` 존재, `inbox_folder_path` 없음 | **v2.x → v3.0 마이그레이션**: `folder_path` 값을 `inbox_folder_path` 기본값으로 사용. "기존 설정(v2.x)을 v3.0으로 업그레이드합니다." 안내 출력. Step 3으로 진행 |

### Step 3: Vault 선택

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

기존 설정에 vault가 있으면 해당 값을 기본값으로 제안.

### Step 4: 폴더 경로 설정

AskUserQuestion으로 4개 폴더 경로를 순서대로 묻는다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `inbox_folder_path` | 새로 보관되는 이슈 (open 상태) | `issue-box` |
| `in_progress_folder_path` | 작업 중인 이슈 (in-progress 상태) | `issue-box/진행중` |
| `resolved_folder_path` | 해결된 이슈 (resolved 상태) | `issue-box/완료` |
| `dismissed_folder_path` | 폐기된 이슈 (dismissed 상태) | `issue-box/폐기` |

- 기존 설정이 있으면 해당 값을 기본값으로 제안
- 사용자가 기본값을 수락하면 해당 값 사용

### Step 5: file_title_format 설정

AskUserQuestion으로 파일 제목 형식을 묻는다.

- 기본값: `{category} {title}`
- 사용 가능 변수: `{category}`, `{title}`, `{date}`
- 예시: `{category} {title}` → `bug 로그인 에러 메시지 누락.md`

### Step 6: 설정 파일 생성

`~/.claude/plugins/data/issue-box-cc-plugins/config.md` 경로에 설정 파일을 생성한다.
디렉토리가 없으면 먼저 생성.

**config.md 형식**:

```yaml
---
vault: "<선택된 vault 이름>"
inbox_folder_path: "<inbox 폴더 경로>"
in_progress_folder_path: "<진행중 폴더 경로>"
resolved_folder_path: "<완료 폴더 경로>"
dismissed_folder_path: "<폐기 폴더 경로>"
file_title_format: "<파일 제목 형식>"
---
```

### Step 7: 설정 요약 출력

설정 완료 후 아래 형식으로 요약 출력:

```
issue-box 설정 완료:
  vault:                    <vault 이름>
  inbox_folder_path:        <inbox 폴더 경로>
  in_progress_folder_path:  <진행중 폴더 경로>
  resolved_folder_path:     <완료 폴더 경로>
  dismissed_folder_path:    <폐기 폴더 경로>
  file_title_format:        <파일 제목 형식>
  config:                   ~/.claude/plugins/data/issue-box-cc-plugins/config.md
```
