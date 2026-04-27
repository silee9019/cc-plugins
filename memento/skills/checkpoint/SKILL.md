---
name: checkpoint
description: "작업 완료 + 정리. 완료 기록, 메모리 정리, WORKING.md 완료 항목 제거, 커밋/푸시, PR 제안. 작업 단위가 끝났을 때 호출."
user-invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다.

# Checkpoint - 작업 완료 + 정리

작업을 의식적으로 마무리할 때 호출. 완료 기록, 메모리 정리, 커밋/푸시, PR 제안까지.

**handoff와 구분**: handoff는 진행 중 상태를 저장하는 가벼운 행위. checkpoint는 작업을 끝내고 정리하는 의식적 행위.

## 트리거

"작업 완료", "마무리", "checkpoint", "정리", "완료하자", "커밋해줘", 작업 단위 종료 시

## 호출 기준 - "작업 단위"란?

- 작업 단위 = 의식적으로 시작하고 완료를 선언할 수 있는 독립적 목표가 있는 작업
- 예: "msteams-fetch 타임존 버그 수정", "Hub ETA 취합 및 공유", "1on1 준비"
- **작업 단위가 아닌 것**: Jira 필드 변경, 이슈 링크, 메모리 저장 같은 단순 조작. 이런 건 더 큰 작업의 일부로 다음 checkpoint outcome에 자연스럽게 포함됨

## Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md`를 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root`, `daily_notes_path`, `daily_note_format`, `daily_archive_path`, `daily_archive_format`, `in_progress_folder_path`, `resolved_folder_path`, `dismissed_folder_path`, `decision_note_format`, `daily_log_format` 등 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**: 식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 고정.

## Step 2: project-id 및 경로 준비

- `RAW_LOG` = `{MEMENTO_HOME}/projects/{project_id}/memory/{today-log}.md` (오늘, `daily_log_format` 적용. 기본: `YYYY-MM-DD-log.md`)
- `TODAY_FOCUS` = `{vault_path}/{daily_notes_path}/{today-focus}.md` (`daily_note_format` 적용. 기본: `YYYY-MM-DD-focus.md`). Focus Today는 v2.16.1부터 `# 오늘 꼭(Focus)` 단일 섹션 (legacy 두 섹션도 호환).
- `DECISIONS_DIR` = `{MEMENTO_HOME}/user/decisions/`, 결정 파일 생성 시 `decision_note_format` 적용 (기본 `YYYY-MM-DD-decision-{slug}.md`)

## Step 3: 완료 항목 감지 + 처리

세션 맥락에서 완료 항목을 감지한다.

**완료 판정 근거** (2개 이상 충족):
- 사용자가 명시적으로 "완료/됐다/끝" 선언
- 관련 파일이 저장되고 검증됨
- 결과물이 실제로 존재 (파일/커밋/PR)

**처리** (todo 파일 = 파일 하나, Focus Today `# 오늘 꼭(Focus)`은 wikilink 인덱스):

1. todo 파일 frontmatter 갱신: `status: resolved` + `resolved_at: {TODAY}`.
   - 경로 추정: Focus Today의 wikilink(`[[<daily_notes_path>/{TODAY}/{slug}|...]]`)를 파싱하거나, `<daily_notes_path>/{TODAY}/*.md` 중 제목/slug 일치하는 파일
   - 파일 이동(`99 Archives/Daily/`로 `git mv`)은 **checkpoint에서 수행하지 않음** — 하루 마감 의례 `review-day`가 일괄 수행
2. Focus Today 체크박스 갱신: `- [ ]` → `- [x]` (`# 오늘 꼭(Focus)` 단일 섹션, legacy 두 섹션도 모두 해당). wikilink 구조는 유지
3. 모호 항목: AskUserQuestion으로 한 건씩 확인

**legacy 평문 체크박스**: 파일 없는 경우 체크박스만 `- [x]`로 갱신.

**WORKING.md 미완료 항목 교차 확인**: 세션 맥락에서 감지되지 않았지만 WORKING.md "미완료 작업"에 남아있는 항목이 있으면, 목록을 보여주고 AskUserQuestion으로 "이 중 완료된 항목이 있나요?" 한 번에 확인. 사용자 응답에 따라 완료 처리 (위와 동일 절차).

## Step 4: raw 로그 append

`RAW_LOG`에 다음 형식으로 append:

```markdown
## [done: {주제 요지}]
- outcome: {무엇이 바뀌었는가, 핵심 결과}
- references: {관련 파일 경로}
```

2 field만. 간결하게.

**요약 기준**: `[done]`의 주제는 사용자가 의도한 작업 목표(설계, 구현, 버그 수정 등)로 잡는다. git 작업(rebase, 버전 재정렬, ff 머지, force push, 브랜치 정리 등)은 독립 `[done]` 항목으로 만들지 않고, 해당 작업의 outcome 끝에 한 줄로 축약한다.

## Step 5: 결정 후보 감지

이 세션에서 내린 결정 후보를 스캔한다. checkpoint의 raw 로그 훑기 pass에 결정 감지를 얹는 방식.

**스캔 소스**: 이 세션의 대화 컨텍스트 + Step 4에서 작성한 raw 로그

**이미 태깅된 결정 스킵**: `RAW_LOG` tail의 `<!-- promoted: user/decisions/*.md -->` HTML 주석 마커를 확인한다. 마커가 가리키는 결정은 이미 `/memento:tag-decision`으로 즉시 태깅됨 → 후보에서 제외.

**결정 정의 4조건** (4개 모두 충족해야 후보):
1. 사용자가 명확히 선택한 것 (대안 중 하나를 고른 흔적)
2. 코드/행동/규칙이 바뀌는 것 (단순 의견/브레인스토밍 제외)
3. 이 세션 이후에도 참조/적용되어야 할 것
4. 1~2문장으로 요약 가능한 것

**후보가 없으면**: 조용히 건너뛰기 (Step 6으로 진행).

**후보가 있으면**: 번호 매긴 리스트로 출력 후 AskUserQuestion:

```
결정 후보 {N}건:
1. {요약} — {근거 한 줄}
2. {요약} — {근거 한 줄}

태깅할 항목을 선택하세요 (번호/전부/건너뛰기)
```

**선택된 각 후보 처리** (기본값 사용, 빠른 처리):

1. 영문 slug 생성 (결정 내용에서 3~5 영단어 kebab-case 도출)
2. 중복 검사: `user/decisions/` 최근 7일 스캔, slug base 일치 또는 summary 토큰 겹침 60%↑ 시 경고 (차단 아님)
3. 결정 파일 생성 (`{DECISIONS_DIR}/` + `decision_note_format` 치환, 기본 `YYYY-MM-DD-decision-{slug}.md`):
   - `projects: ["*"]` (전역)
   - `lifetime: 2w`, `expires: {오늘+14일}`
   - `source_project: {project_id}`
   - frontmatter + 본문은 `/memento:tag-decision` Step 8과 동일 스키마
4. `RAW_LOG` tail에 `<!-- promoted: user/decisions/{파일명} -->` 마커 append
5. "결정 태깅: {파일명}" 출력

6. RAW_LOG tail에 통계 마커 append:
   `<!-- decision-candidates: proposed=N, accepted=M -->`
   후보 0건이면 `proposed=0, accepted=0`으로 기록.

7. 메트릭 이벤트 기록 (Bash 실행):
   ```bash
   . "${CLAUDE_PLUGIN_ROOT}/scripts/metrics-db.sh" "$MEMENTO_HOME"
   metrics_init
   metrics_emit "llm" "decision_candidates" "$PROJECT_ID" '{"proposed":N,"accepted":M}'
   ```
   N, M은 실제 숫자로 치환.

**커스텀이 필요한 경우**: checkpoint에서는 스코프(`*`)/기간(`2w`) 기본값으로 빠르게 처리. 나중에 파일을 직접 편집하거나 `/memento:refresh-decisions --verbose`로 확인 가능.

## Step 6: raw 로그에 HH:MM done 기록

Focus Today에는 Log 섹션이 없으므로 시간순 done 기록은 **raw log에만** 남긴다. Step 4의 `## [done: ...]` 블록 외에 별도 시간순 라인이 필요하면 `RAW_LOG`에 다음을 append:

```markdown
- {HH:MM} done: {주제 한 줄}. {핵심 결과 1줄}
```

기본은 Step 4 블록이면 충분하다. 시간 스탬프가 중요한 경우에만 이 줄을 추가.

## Step 7: 캘린더 동기화

일정은 언제든 추가될 수 있으므로 checkpoint마다 확인한다.

1. 회사 일정 컨텍스트 스크립트 실행:
   ```bash
   python3 {PLUGIN_ROOT}/scripts/calendar_context.py --plugin-root {PLUGIN_ROOT}
   ```
2. 오늘 이벤트 중 `RAW_LOG`에 반영되지 않은 항목을 `## [meeting: {제목}]` 블록으로 시각 순 삽입
3. 스크립트 실패 시 조용히 건너뛰기

## Step 8: WORKING.md 정리

WORKING.md에서 **완료된 것을 제거**한다 (추가는 handoff의 역할):

- "미완료 작업"에서 완료 항목 제거
- "결정 사항"에서 이미 반영된 건 제거
- "현재 상태" 갱신 (완료 반영)

원칙: "이 문서에는 아직 해야 할 것만 남아있다."

## Step 9: 커밋/푸시 + PR 제안

```bash
git status --short
```

| 케이스 | 처리 |
|--------|------|
| 변경 없음 | 건너뛰기 |
| uncommitted 변경 있음 | AskUserQuestion: "커밋+푸시" / "커밋만" / "건너뛰기" |

PR이 적절한 경우 (feature branch, 리뷰 필요한 변경):
> "PR을 생성할까요?"

**gitignore 원칙**: `{memento_root}/` 하위는 vault git 커밋 대상이 아님. `git status --short` 결과 그대로 추적 파일만 취급.

## Step 10: 최종 보고

```
checkpoint 완료:
  완료 처리: N건
  raw 로그: {경로}
  Focus Today: {경로}
  WORKING.md: 정리됨 (완료 N건 제거)
  커밋: {상태}
```

## 원칙

- 작업 단위가 끝났을 때만 호출 (단순 조작에는 호출하지 않음)
- 2-field raw 로그 (outcome + references)
- WORKING.md에서 완료 건 제거 (새 항목 추가는 handoff)
- 캘린더 동기화 매 호출
- 커밋/푸시/PR 제안
- 교훈 추출은 review-day에서
- **내부 Task ID 축약 단독 사용 금지**: done 로그·WORKING.md 갱신·커밋 메시지·PR 본문에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9` 같은 축약을 한 문서 내 첫 출현 시 풀어쓰거나 괄호 병기(`Task 2(docx 변환)`). 이후 반복은 단독 허용. Jira 번호(`CND-xxxx`)와 산업 표준 약어는 면제. 상세: 저장소 CLAUDE.md.
