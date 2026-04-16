---
description: 수동 재주입 (Format A 전문). 긴 세션에서 다른 세션의 결정을 가져올 때 사용.
allowed-tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
argument-hint: "[--verbose] [--include-revoked]"
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것.

# Refresh Decisions

활성 결정(Active Decisions)을 **Format A (전문)** 형식으로 다시 로드한다. SessionStart에서는 Format B(요약)만 주입되지만, 이 커맨드는 전문을 출력한다.

**인자**:
- `--verbose`: 매칭 안 된 결정 파일도 사유와 함께 표시 (디버깅용)
- `--include-revoked`: 철회된 결정도 포함

## Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md`를 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root` 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

`MEMENTO_HOME` = `{vault_path}/{memento_root}`
`DECISIONS_DIR` = `{MEMENTO_HOME}/user/decisions/`

## Step 2: 현재 프로젝트 ID 확인

session-start.sh와 동일 로직으로 현재 세션의 `PROJECT_ID`를 결정한다:
1. `git remote get-url origin` → `owner-repo` (lowercase)
2. fallback: `git rev-parse --show-toplevel` 기반
3. fallback: cwd 기반

## Step 3: 결정 파일 스캔 + 필터링

`DECISIONS_DIR/*.md` 파일을 순회하며 frontmatter를 파싱한다.

**필터 조건** (모두 충족해야 활성):
1. `revoked: false` (또는 미설정) — `--include-revoked` 시 이 조건 무시
2. `expired: false` (또는 미설정)
3. `expires` 날짜가 오늘 이후이거나 미설정
4. `projects` 배열에 `"*"` 포함 또는 현재 `PROJECT_ID` 포함

**정렬**: `created` DESC, 동률 시 파일명 사전식 ASC
**상한**: 10개 (활성 결정만 카운트)

`--verbose` 모드에서는 필터링으로 제외된 파일도 사유와 함께 "Excluded" 섹션에 표시한다.

## Step 4: Format A 출력

각 활성 결정에 대해 **전문**을 출력한다:

```
## Active Decisions (N active · refreshed at HH:MM KST)

### 1. {H1 제목} (exp {expires})

{본문 전체}

---
source: `user/decisions/{filename}`
created: {created} | projects: {projects} | lifetime: {lifetime}

### 2. ...
```

**0건인 경우**:
```
## Active Decisions (0 active)

활성 결정이 없습니다. `/memento:tag-decision`으로 결정을 태깅하세요.
```

**`--verbose` Excluded 섹션** (0건이 아닐 때만):
```
### Excluded (N files)
- `{filename}`: {사유} (revoked / expired / scope mismatch / ...)
```

## Step 5: 완료

출력 후 별도 저장 없이 종료. 이 커맨드는 조회 전용이다.
