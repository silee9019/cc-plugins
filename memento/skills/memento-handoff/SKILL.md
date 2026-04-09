---
name: memento-handoff
description: "세션 종료 시 핸드오프 문서 생성. 다음 세션이 즉시 이어서 작업 가능하도록 컨텍스트, 진행 상태, 미완료 작업, 결정 사항을 구조화."
user_invocable: true
---

# Memento Session Handoff

세션 종료 시 다음 세션을 위한 핸드오프 문서를 생성한다.
**목표**: 다음 세션이 이 문서만 읽으면 즉시 작업을 이어갈 수 있어야 함.

## 트리거 조건

- `/memento:memento-handoff` 명시 호출
- "핸드오프", "세션 정리", "다음 세션 준비", "인수인계", "handoff" 키워드 발화

## 워크플로우

### Step 1: 세션 컨텍스트 수집

현재 세션에서 다음 정보를 수집한다:

1. **작업 목록 상태**: TaskList로 현재 Todo 상태 확인
2. **대화 흐름 요약**: 세션 중 주요 토픽, 결정, 전환점
3. **미완료 작업**: 시작했으나 끝내지 못한 작업
4. **보류 사항**: 사용자 확인 대기, 외부 의존 등
5. **발견한 사실**: 세션 중 새로 알게 된 코드베이스/프로젝트 정보
6. **파일 변경 내역**: `git status`, `git diff --stat` 으로 확인
7. **plan 파일 확인**: 세션 대화 컨텍스트에서 plan mode 사용 여부 확인. plan mode가 사용된 경우, 시스템 메시지에 명시된 plan 파일 경로를 기록한다 (예: `~/.claude/plans/xxx.md`). 사용하지 않았으면 "없음"으로 기록.

> **주의**: `~/.claude/plans/`를 Glob으로 스캔하지 않는다 — 다른 세션의 plan 파일과 섞일 수 있다. 반드시 현재 세션 컨텍스트에서 확인된 경로만 사용.

### Step 2: 핸드오프 문서 작성

아래 템플릿으로 핸드오프 문서를 작성한다.

```markdown
# Session Handoff — {YYYY-MM-DD} {토픽 요약}

## 세션 요약
<!-- 1~3문장으로 이 세션에서 무엇을 했는지 -->

## 현재 상태
<!-- 작업이 어디까지 진행되었는지. "여기까지 했고, 여기서부터 이어가면 됨" -->

## 미완료 작업
<!-- 체크리스트 형식. 다음 세션에서 바로 시작할 수 있도록 구체적으로 -->
- [ ] 작업 설명 — 필요한 컨텍스트
- [ ] ...

## 결정 사항
<!-- 이 세션에서 내린 결정과 근거. 다음 세션에서 번복하지 않도록 -->
| 결정 | 근거 | 영향 |
|------|------|------|

## 보류 사항
<!-- 사용자 확인 대기, 외부 의존 등 -->

## 참조 파일
<!-- 다음 세션에서 읽어야 할 파일 목록 -->
- `path/to/file` — 이유

## 재개 방법
<!-- 다음 세션 시작 시 구체적으로 어떻게 시작하면 되는지 -->
```

### Step 3: 저장 (직접 Write)

**Write 도구로 직접 실행한다.** 서브에이전트에 위임하지 않는다 — 핸드오프는 메인 세션이 완료해야 정확성이 보장된다.

1. **WORKING.md 덮어쓰기**: `~/.claude/memento/projects/<project-id>/WORKING.md`에 핸드오프 내용 저장
   - Write 도구로 전체 내용 교체 (덮어쓰기)
   - WORKING.md는 "현재 진행 중인 작업" 문서 — 다음 세션 시작 시 자동 로드됨

2. **일일 로그 append**: `~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md`에 세션 요약 append
   - memento-core End-of-Task Checkpoint 형식 사용

### Step 4: 컴팩션

compact.mjs를 실행하여 컴팩션 트리를 전파한다.

이 SKILL.md가 `<plugin-root>/skills/memento-handoff/SKILL.md`에 위치하므로, compact.mjs 경로는 이 파일 기준 `../../scripts/compact.mjs`의 절대 경로로 해석한다.

```bash
bun run <이 SKILL.md 기준 ../../scripts/compact.mjs 의 절대 경로>
```

> **Cooldown**: compact.mjs 내부에 3시간 cooldown gate가 있다 (`.compaction-state.json` 기반). 마지막 실행 후 3시간 이내면 자동 스킵. 빈번한 호출에 부작용 없음 — 무조건 실행해도 안전.

### Step 5: 보고

핸드오프 완료 보고와 다음 세션 안내를 함께 출력한다.

#### 5-1. 핸드오프 완료 보고

- 저장 완료 확인 (WORKING.md + 일일 로그)
- 컴팩션 결과 (실행됨 / cooldown 스킵)
- 미완료 작업 건수

#### 5-2. 세션 참조 경로

다음 세션에서 참조할 수 있는 파일 경로를 출력:

- **WORKING.md**: `~/.claude/memento/projects/<project-id>/WORKING.md`
- **일일 로그**: `~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md`
- **계획서**: Step 1에서 확인한 plan 파일 경로 (있는 경우만)

#### 5-3. 다음 세션 프롬프트

사용자가 복사-붙여넣기 할 수 있도록 **코드블록**으로 출력:

~~~
```
## 이전 세션 이어하기

### 컨텍스트
- 주제: {세션 토픽 요약}
- 핸드오프: {WORKING.md 절대 경로}
- 계획서: {plan 파일 절대 경로 또는 "없음"}
- 일일 로그: {YYYY-MM-DD.md 절대 경로}

### 미완료 작업
- [ ] {작업 1 — 파일명, 구체적 다음 액션}
- [ ] {작업 2}

### 재개 방법
{핸드오프 문서의 "재개 방법" 섹션 내용 그대로}
```
~~~

> memento SessionStart hook이 WORKING.md를 자동 로드하므로 이 프롬프트 없이도 컨텍스트는 복원된다. 명시적으로 이어하기를 지시하고 싶을 때 유용.

## Do / Don't

| Do | Don't |
|----|-------|
| 미완료 작업을 구체적으로 (파일명, 줄번호, 다음 액션) | "나머지 작업 마저 하기" 같은 모호한 설명 |
| 결정 사항에 근거를 함께 기록 | 결정만 기록하고 왜 그렇게 결정했는지 누락 |
| git 상태(uncommitted changes) 포함 | 커밋되지 않은 변경사항 무시 |
| 다음 세션 시작 시 첫 명령어 제안 | "계속하면 됩니다" 같은 두루뭉술한 안내 |
| WORKING.md는 덮어쓰기 (최신 상태만) | WORKING.md에 히스토리 누적 |
| 일일 로그는 append (영구 기록) | 일일 로그 덮어쓰기 |
| WORKING.md, 일일 로그는 Write 도구로 직접 작성 | 서브에이전트에 핸드오프 저장을 위임 |
| compact.mjs는 무조건 실행 (cooldown이 알아서 판단) | cooldown 시간을 직접 계산하여 실행 여부 결정 |
| plan 파일이 없으면 해당 항목 생략 | plan 없음을 에러로 취급 |
| plan 파일은 세션 컨텍스트에서 확인된 경로만 사용 | `~/.claude/plans/`를 Glob 스캔하여 추측 |
| 다음 세션 프롬프트를 코드블록으로 출력 | 프롬프트를 산문 형태로 풀어쓰기 |
| `<plugin-root>`를 SKILL.md 기준 절대 경로로 해석 | `<plugin-root>` 문자열을 그대로 실행 |
