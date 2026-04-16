---
name: checkpoint
description: "작업 완료 + 정리. 완료 기록, 메모리 정리, WORKING.md 완료 항목 제거, 커밋/푸시, PR 제안. 작업 단위가 끝났을 때 호출."
user_invocable: true
---

# Checkpoint - 작업 완료 + 정리

작업을 의식적으로 마무리할 때 호출. 완료 기록, 메모리 정리, 커밋/푸시, PR 제안까지.

handoff는 진행 중 상태를 저장하는 가벼운 행위. checkpoint는 작업을 끝내고 정리하는 의식적 행위.

## 호출 기준

작업 단위 = 의식적으로 시작하고 완료를 선언할 수 있는 독립적 목표가 있는 작업.

작업 단위가 아닌 것(Jira 필드 변경, 이슈 링크 등 단순 조작)은 다음 checkpoint outcome에 자연스럽게 포함.

## Raw 로그 포맷

```markdown
## [done: {주제 요지}]
- outcome: {무엇이 바뀌었는가}
- references: {관련 파일 경로}
```

## 핵심 동작

1. 완료 항목 감지 + Issue Box/Daily Note Tasks 완료 처리
2. raw 로그 append (`## [done: ...]`, 2 field)
3. 결정 후보 감지 (세션 내 결정을 후보로 제안, 확인 시 `user/decisions/` 태깅)
4. Daily Note Log append (프로젝트별 서브섹션)
5. 캘린더 동기화 (오늘 일정 중 미반영 항목)
6. WORKING.md 정리 (완료 건 제거, 추가는 안 함)
7. 커밋/푸시/PR 제안

상세 절차는 `commands/checkpoint.md` 참조.

## Rules

- 교훈 추출은 checkpoint에서 하지 않음 (review-day의 역할)
- "임시 저장 vs 세션 종료" 모드 질문 없음
- WORKING.md에 새 항목 추가 안 함 (그건 handoff)
- 캘린더 동기화는 매 호출 수행
