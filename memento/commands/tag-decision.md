---
description: 세션 중 즉시 결정 태깅. 대화에서 내린 결정을 user/decisions/에 기록.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: (없음, 대화형)
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다.

# 결정 태깅 (tag-decision)

세션 중 내린 결정을 즉시 `user/decisions/`에 기록한다. 결정이 내려진 바로 그 순간에 호출.

**접점 3층 중 1층 (즉시)**: 이 커맨드는 결정이 내려진 순간 사용자가 직접 호출. 2층(checkpoint 자동 감지)과 3층(review-day 안전망)은 별도.

**트리거 키워드**: "결정 태깅", "이거 결정으로 남겨", "tag decision", "결정 기록", "리본 달기"

## Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md`를 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root` 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

`MEMENTO_HOME` = `{vault_path}/{memento_root}`
`DECISIONS_DIR` = `{MEMENTO_HOME}/user/decisions/`
`RAW_LOG` = `{MEMENTO_HOME}/projects/{project_id}/memory/YYYY-MM-DD-log.md` (오늘 날짜, `daily_log_format` 적용)

**project_id 계산**: session-start.sh와 동일 로직 (git remote → owner-repo, fallback → cwd, lowercase).

## Step 2: 결정 내용 파악

세션 대화 맥락에서 결정 내용을 자동 추출한다:

- **H1 제목**: 간결한 한 줄 (파일의 `# 제목`으로 사용)
- **본문**: 1~2문단. 첫 문장을 한줄 요약으로 작성
- **summary**: frontmatter용. 한영 병기 권장 (검색 recall 보완)
- **tags**: 관련 키워드 배열 추정
- **source_turn_range**: 결정이 논의된 대화 구간의 대략적 시각 범위 (분 단위)

추출 결과를 사용자에게 보여주고 확인받는다. 수정 요청이 있으면 반영.

## Step 3: 4조건 스키마 게이트

결정 정의 4조건에 비춰 자체 점검한다:

1. **선택**: 사용자가 명확히 선택한 것 (대안 중 하나를 고른 흔적)
2. **변경**: 코드/행동/규칙이 바뀌는 것 (단순 의견/브레인스토밍 제외)
3. **지속**: 이 세션 이후에도 참조/적용되어야 할 것
4. **요약 가능**: 1~2문장으로 요약 가능한 것

| 결과 | 처리 |
|------|------|
| 4조건 모두 충족 | Step 4로 진행 |
| 미충족 조건 있음 | 미충족 조건을 명시하고 AskUserQuestion: "그래도 태깅할까요? (y/n)" — **차단 아님, 사용자 주권** |

## Step 4: 중복 검사

`DECISIONS_DIR` 내 최근 7일 이내 생성된 파일을 스캔한다:

1. 각 파일의 frontmatter에서 `created`, `summary`, 파일명 slug를 읽는다
2. 다음 조건 중 하나라도 매칭되면 경고:
   - **slug base 일치**: 새 결정의 slug와 기존 파일의 slug base가 동일
   - **summary 유사**: 토큰 겹침 60%↑ (공백 분리 토큰 기준, 조사/접미사 무시)

| 결과 | 처리 |
|------|------|
| 유사 결정 없음 | Step 5로 진행 |
| 유사 결정 있음 | AskUserQuestion: "기존 결정 `{파일명}`과 유사합니다. 진행 / 건너뛰기 / 기존 결정 보기" — **차단 아님, 경고만** |

## Step 5: Slug 생성 + 파일명 결정

결정 내용에서 영문 slug를 도출한다:

- **규칙**: 3~5 영단어, kebab-case, 결정의 핵심 의미에서 도출
- **예시**: "qmd fork 불필요" → `qmd-fork-unnecessary`
- **파일명**: `decision_note_format` 적용. config.md 기본값은 `"{YYYY}-{MM}-{DD}-decision-{slug}.md"` (오늘 날짜 + `decision-` prefix + slug)
- **예**: `2026-04-20-decision-qmd-fork-unnecessary.md`
- **충돌 처리**: 동일 파일명 존재 시 suffix `-2`, `-3` 자동 부여

## Step 6: 스코프 선택

AskUserQuestion으로 프로젝트 스코프를 선택받는다:

```
이 결정의 적용 범위를 선택하세요:

1. 전역 (*) — 모든 프로젝트에서 참조 [Recommended]
2. 현재 프로젝트만 ({project_id})
3. 여러 프로젝트 선택
4. Other (자유 입력)
```

| 선택 | 처리 |
|------|------|
| 1 | `projects: ["*"]` |
| 2 | `projects: ["{project_id}"]` |
| 3 | `{memento_root}/projects/*/` 디렉토리 스캔 → 목록 표시 → 멀티선택 |
| 4 | 자유 입력값을 배열로 파싱 |

## Step 7: 기간 선택

AskUserQuestion으로 기간을 선택받는다:

```
결정의 유효 기간을 선택하세요:

1. 2주 (2w) [기본값]
2. 1주 (1w)
3. 1개월 (1m)
```

선택에 따라 `lifetime`과 `expires` (오늘 + 기간) 계산.

**"영구" 없음** — 영구 원칙은 `user/ROOT.md` 수동 승격 경로로만 (`/memento:promote-decision`).

## Step 8: 결정 파일 작성

`{DECISIONS_DIR}/{파일명}` 에 Write:

```markdown
---
type: decision
created: {YYYY-MM-DD}
source_project: {project_id}
source_session_id: ~
source_turn_range: ["{시작 시각}", "{종료 시각}"]
projects: {선택된 스코프 배열}
lifetime: {선택된 기간}
expires: {계산된 만료일}
expired: false
tags: {추정된 태그 배열}
summary: {한영 병기 요약}
revoked: false
revoked_at: ~
revoked_reason: ~
---

# {H1 제목}

{본문 1~2문단}
```

## Step 9: Raw 로그 마커 append

`RAW_LOG` 파일의 tail에 HTML 주석 마커를 한 줄 append한다:

```
<!-- promoted: user/decisions/{파일명} -->
```

- **append-only**: 파일 중간 삽입 금지
- **목적**: checkpoint 후보 감지 시 이미 태깅된 결정을 빠르게 스킵하기 위한 hint
- **권위 없음**: 구간 재구성/dedupe의 권위는 frontmatter `source_turn_range` + `source_session_id`에 있음

RAW_LOG 파일이 아직 없으면 (오늘 첫 로그) 파일 생성 후 마커 append.

메트릭 이벤트 기록 (Bash 실행):
```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/metrics-db.sh" "$MEMENTO_HOME"
metrics_init
metrics_emit "llm" "tag_decision" "$PROJECT_ID" '{"slug":"SLUG","scope":"SCOPE","lifetime":"LIFETIME"}'
```
SLUG, SCOPE, LIFETIME은 실제 값으로 치환. `$MEMENTO_HOME`과 `$PROJECT_ID`는 세션 컨텍스트의 값 사용.

## Step 10: 완료 보고

```
결정 태깅 완료:
  파일: {DECISIONS_DIR}/{파일명}
  스코프: {projects 값}
  만료: {expires} ({lifetime})
  다음 세션 시작 시 자동 주입됩니다.
```

## Do / Don't

| Do | Don't |
|----|-------|
| 세션 맥락에서 결정 내용 자동 추출 후 확인 | 처음부터 사용자에게 내용을 타이핑하게 하기 |
| 4조건 미충족 시 경고만 (사용자 주권 존중) | 4조건 미충족을 이유로 태깅 차단 |
| 중복 경고 시 기존 결정 보기 옵션 제공 | 중복이면 자동으로 건너뛰기 |
| summary에 한영 병기 권장 | 한국어만 또는 영어만 강제 |
| slug를 결정 의미에서 자연스럽게 도출 | 한국어 transliteration이나 해시 사용 |
| raw 로그 tail에 마커 append | raw 로그 중간에 마커 삽입 |
