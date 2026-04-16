---
description: 작업 완료 + 정리. 메모리 정리, Daily Note 체크, WORKING.md 완료 항목 제거, 커밋/푸시, PR 제안.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Skill
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다.

# Checkpoint - 작업 완료 + 정리

작업을 의식적으로 마무리할 때 호출. 완료 기록, 메모리 정리, 커밋/푸시, PR 제안까지.

**handoff와 구분**: handoff는 진행 중 상태를 저장하는 가벼운 행위. checkpoint는 작업을 끝내고 정리하는 의식적 행위.

## 호출 기준 - "작업 단위"란?

- 작업 단위 = 의식적으로 시작하고 완료를 선언할 수 있는 독립적 목표가 있는 작업
- 예: "msteams-fetch 타임존 버그 수정", "Hub ETA 취합 및 공유", "1on1 준비"
- **작업 단위가 아닌 것**: Jira 필드 변경, 이슈 링크, 메모리 저장 같은 단순 조작. 이런 건 더 큰 작업의 일부로 다음 checkpoint outcome에 자연스럽게 포함됨

## Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md`를 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `memento_root`, `daily_notes_path`, `daily_note_format`, `in_progress_folder_path`, `resolved_folder_path`, `dismissed_folder_path` 등 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**: 식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 고정 (기존 checkpoint Step 1과 동일).

## Step 2: project-id 및 경로 준비

기존 checkpoint Step 2와 동일. `WORKING`, `RAW_LOG`, `TODAY_DAILY` 경로 계산.

## Step 3: 완료 항목 감지 + 처리

세션 맥락에서 완료 항목을 감지한다.

**완료 판정 근거** (2개 이상 충족):
- 사용자가 명시적으로 "완료/됐다/끝" 선언
- 관련 파일이 저장되고 검증됨
- 결과물이 실제로 존재 (파일/커밋/PR)

**처리**:
- Issue Box: in-progress -> resolved (status 변경 + 파일 이동)
- Daily Note Tasks: `- [ ]` -> `- [x]` + 간단 주석
- 모호 항목: AskUserQuestion으로 한 건씩 확인

## Step 4: raw 로그 append

`RAW_LOG`에 다음 형식으로 append:

```markdown
## [done: {주제 요지}]
- outcome: {무엇이 바뀌었는가, 핵심 결과}
- references: {관련 파일 경로}
```

2 field만. 간결하게.

## Step 5: Daily Note Log append

`TODAY_DAILY`의 `## Log` 섹션에 추가:

```markdown
- {HH:MM} done: {주제 한 줄}. {핵심 결과 1줄}
```

**프로젝트별 서브섹션 정렬**: 기존 checkpoint의 agent 프로젝트별 `### {alias}` 서브섹션 규칙을 따른다. 시각 순 삽입.

## Step 6: 캘린더 동기화

일정은 언제든 추가될 수 있으므로 checkpoint마다 확인한다.

1. 회사 일정 컨텍스트 스크립트 실행:
   ```bash
   python3 {PLUGIN_ROOT}/memento/scripts/work_calendar_context.py --plugin-root {PLUGIN_ROOT}/memento
   ```
2. 오늘 이벤트 중 Daily Note Log `### 미팅` 섹션에 없는 항목을 시각 순으로 삽입
3. 스크립트 실패 시 조용히 건너뛰기

## Step 7: WORKING.md 정리

WORKING.md에서 **완료된 것을 제거**한다 (추가는 handoff의 역할):

- "미완료 작업"에서 완료 항목 제거
- "결정 사항"에서 이미 반영된 건 제거
- "현재 상태" 갱신 (완료 반영)

원칙: "이 문서에는 아직 해야 할 것만 남아있다."

## Step 8: 커밋/푸시 + PR 제안

```bash
git status --short
```

| 케이스 | 처리 |
|--------|------|
| 변경 없음 | 건너뛰기 |
| 미커밋 변경 있음 | AskUserQuestion: "커밋+푸시" / "커밋만" / "건너뛰기" |

PR이 적절한 경우 (feature branch, 리뷰 필요한 변경):
> "PR을 생성할까요?"

**gitignore 원칙**: `_memento/` 하위는 vault git 커밋 대상이 아님. `git status --short` 결과 그대로 추적 파일만 취급.

## Step 9: 최종 보고

```
checkpoint 완료:
  완료 처리: N건
  raw 로그: {경로}
  Daily Note: {경로}
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
