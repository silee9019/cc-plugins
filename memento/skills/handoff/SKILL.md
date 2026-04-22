---
name: handoff
description: "세션 인계 메모. 현재 작업 상태를 메모리에 저장하고 재개 프롬프트를 구성. 수시 호출 가능. 커밋/정리 없음."
user-invocable: true
---

# Handoff - 세션 인계 메모

작업을 잠시 멈출 때 호출. 메모리를 업데이트하고 다음 세션이 바로 이어갈 수 있는 짧은 재개 프롬프트를 구성한다.

**핵심 원칙**: 커밋도 안 하고, 정리도 안 함. "여기까지 했고, 다음에 이거 하면 됨"만 남기는 것.

**checkpoint와 구분**: checkpoint는 작업을 의식적으로 마무리하고 정리하는 행위. handoff는 진행 중인 상태를 저장하는 행위.

## 트리거

"인계", "잠깐 저장", "handoff", "save progress", 주제 전환 시

## Handoff 파일 포맷

매 handoff는 **별도 파일**로 저장된다 (raw log append 아님). 파일명은 config의 `handoff_note_format`을 따른다 — 기본값: `{YYYY}-{MM}-{DD}-{HHmm}-handoff-{slug}.md`.

```markdown
---
type: handoff
created: {YYYY-MM-DD}
time: {HH:MM}
source_project: {project_id}
topic: {주제}
tags: [handoff, session]
---

# handoff: {주제}

- state: {현재 어디까지 했는가}
- next: {다음에 이어할 것}
- references: {참고 파일}
```

저장 경로: `{MEMENTO_HOME}/projects/{project_id}/memory/{파일명}`
(raw 세션 로그 `YYYY-MM-DD-log.md`와 **같은 디렉토리**에 배치해 compact.mjs가 하루 단위로 함께 수집)

## 절차

### Step 1: 설정 로드 + project-id

checkpoint.md Step 1-2와 동일한 설정 로드 + project-id 계산 로직. `handoff_note_format` 키도 함께 읽는다 (없으면 기본값 사용).

### Step 2: Handoff 파일 생성

1. 세션 맥락에서 다음을 자동 파악:
   - **state**: 이 세션에서 무엇을 했고 어디까지 진행했는가
   - **next**: 다음에 뭘 해야 하는가
   - **references**: 관련 파일 경로
   - **주제(topic)**: 한 줄 요약 (slug 생성의 근거)
2. slug 생성: 한글 허용, 공백만 하이픈으로 치환, 특수문자 제거, 길이 제한(영문 기준 40자, 한글 포함 시 전체 20자 이내). 예: "결제 리팩토링 진행 중" → `결제-리팩토링-진행-중`
3. 파일명 치환: `handoff_note_format`에서 `{YYYY}`/`{MM}`/`{DD}`/`{HHmm}`/`{slug}`를 현재 값으로 치환. `{HHmm}`은 KST 기준 4자리(예: `0930`, `2145`).
4. 동일 분 내 중복 파일이 존재하면 suffix `-2`, `-3`을 slug 뒤에 부여.
5. Write 도구로 위 frontmatter + 본문을 가진 파일을 생성.

**raw log에는 아무것도 append하지 않는다**. handoff 사실 자체는 Daily Note Log(Step 4)에만 반영되고, 실제 내용은 별도 파일에 남는다.

### Step 3: WORKING.md 갱신

WORKING.md의 다음 섹션을 **추가/수정** (제거하지 않음):
- "현재 상태": 진행 상황 업데이트
- "미완료 작업": 새로 발견된 할 일 추가
- "참조 파일": 새 참조 추가 — 방금 만든 handoff 파일 경로도 추가

WORKING.md가 없으면 생성. 있으면 해당 섹션만 업데이트.

**제거는 하지 않음** — 완료 항목 제거는 checkpoint의 역할.

### Step 4: Daily Note Log + 재개 프롬프트

1. Daily Note `## Log` 섹션에 한 줄 append (handoff 파일 경로를 링크로 포함):
   ```
   - {HH:MM} handoff: {주제 한 줄} → @{HANDOFF_PATH 상대 경로}
   ```

2. 재개 프롬프트 출력:
   ```
   다음 내용을 참고해서 작업을 이어서 진행해주세요.

   - 미완료 작업: {N}건
     - {task 1}
     - {task 2}
   - 참고 파일:
     - @{WORKING.md 절대 경로}
     - @{HANDOFF_PATH 절대 경로}
   ```

## 원칙

- 수시로 가볍게 호출
- WORKING.md에 추가/수정만 (완료 항목 제거는 checkpoint)
- 매 handoff = 별도 파일 (time+slug로 식별). 하루에 여러 번 호출해도 덮어쓰기 없음
- 3-field 본문 (state/next/references) + frontmatter 메타
- 재개 프롬프트 출력
- Daily Note Log 한 줄 append (handoff 파일 링크 포함)
- **내부 Task ID 축약 단독 사용 금지**: handoff 본문(state/next)·재개 프롬프트에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9` 같은 축약을 한 문서 내 첫 출현 시 풀어쓰거나 괄호 병기. 이후 반복은 단독 허용. Jira 번호·산업 표준 약어는 면제. 상세: 저장소 CLAUDE.md.
