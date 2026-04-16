---
name: handoff
description: "세션 인계 메모. 현재 작업 상태를 메모리에 저장하고 재개 프롬프트를 구성. 수시 호출 가능. 커밋/정리 없음."
user_invocable: true
---

# Handoff - 세션 인계 메모

작업을 잠시 멈출 때 호출. 메모리를 업데이트하고 다음 세션이 바로 이어갈 수 있는 짧은 재개 프롬프트를 구성한다.

**핵심 원칙**: 커밋도 안 하고, 정리도 안 함. "여기까지 했고, 다음에 이거 하면 됨"만 남기는 것.

**checkpoint와 구분**: checkpoint는 작업을 의식적으로 마무리하고 정리하는 행위. handoff는 진행 중인 상태를 저장하는 행위.

## 트리거

"인계", "잠깐 저장", "handoff", "save progress", 주제 전환 시

## Raw 로그 포맷

```markdown
## [handoff: {주제}]
- state: {현재 어디까지 했는가}
- next: {다음에 이어할 것}
- references: {참고 파일}
```

## 절차

### Step 1: 설정 로드 + project-id

checkpoint.md Step 1-2와 동일한 설정 로드 + project-id 계산 로직.

### Step 2: raw 로그 append

`RAW_LOG`에 `## [handoff: {주제}]` 블록을 append한다. 3 field만 (state/next/references).

세션 맥락에서 자동으로 파악:
- state: 이 세션에서 무엇을 했고 어디까지 진행했는가
- next: 다음에 뭘 해야 하는가
- references: 관련 파일 경로

### Step 3: WORKING.md 갱신

WORKING.md의 다음 섹션을 **추가/수정** (제거하지 않음):
- "현재 상태": 진행 상황 업데이트
- "미완료 작업": 새로 발견된 할 일 추가
- "참조 파일": 새 참조 추가

WORKING.md가 없으면 생성. 있으면 해당 섹션만 업데이트.

**제거는 하지 않음** - 완료 항목 제거는 checkpoint의 역할.

### Step 4: Daily Note Log + 재개 프롬프트

1. Daily Note `## Log` 섹션에 한 줄 append:
   ```
   - {HH:MM} handoff: {주제 한 줄}
   ```

2. 재개 프롬프트 출력:
   ```
   다음 내용을 참고해서 작업을 이어서 진행해주세요.

   - 미완료 작업: {N}건
     - {task 1}
     - {task 2}
   - 참고 파일:
     - @{WORKING.md 절대 경로}
     - @{RAW_LOG 절대 경로}
   ```

## 원칙

- 수시로 가볍게 호출
- WORKING.md에 추가/수정만 (완료 항목 제거는 checkpoint)
- 3-field raw 로그 (state/next/references)
- 재개 프롬프트 출력
- Daily Note Log 한 줄 append
