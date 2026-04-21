---
name: code-review
display_name: code-review
description: |
  코드 변경의 품질 검토. 기존 리뷰 도구 위임 + 자체 리뷰 + codex 병렬 리뷰로 교차 비교.
  트리거: "코드 리뷰", "code review", "커밋 전 리뷰", "셀프 리뷰", "이 코드 검토해줘",
  "리뷰해줘", "코드 검토", "변경사항 리뷰", "diff 리뷰",
  "PR 리뷰", "머지 전 리뷰", "커밋해도 돼?", "코드 피드백", "check my code"
---

# Code Review

코드 변경을 구조화된 기준으로 검토하고, codex 병렬 리뷰와 교차 비교하여 보고서를 생성한다.
기존 리뷰 도구(pr-review-toolkit, gstack /review)가 있으면 우선 위임한다.

## 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| 대상 | N | 리뷰할 파일 경로. 없으면 `git diff` (staged + unstaged) 사용 |

## Workflow

> Step 0(의도 정합성)이 **Clear & Aligned**로 판정된 경우에만 Step 1 이후의 기술적 리뷰를 수행한다. Misaligned/Unclear인 경우 일반 리뷰를 중단하고 Step 0의 지시에 따른다.

### Step 0: 의도 정합성 검증 (Priority-0)

이번 변경(diff/커밋)이 사용자의 요청/의도를 정확히 반영하는지 가장 먼저 검증한다. `${CLAUDE_PLUGIN_ROOT}/reference/intent-alignment.md`의 프로토콜을 전부 따른다.

1. `${CLAUDE_PLUGIN_ROOT}/reference/intent-alignment.md`를 Read하여 절차 로드
2. 의도 출처 수집
   - 현재 대화 컨텍스트: 이번 변경에 대한 사용자 요청과 목표
   - 관련 이슈/PR 설명, 커밋 메시지, 플랜 파일
   - 프로젝트 CLAUDE.md 규칙
3. 의도-변경 매핑 — 각 요구사항이 diff에서 실제로 반영됐는지, 요청에 없는 과잉 변경이 있는지 매핑 테이블 작성
4. 판정
   - **Clear & Aligned** → Step 1로 진행
   - **Clear but Misaligned** → 일반 리뷰 중단. 정합성 복구 항목을 Fix Plan 형식으로 먼저 사용자에게 제시 (Step 7에서 컨펌)
   - **Unclear** → 회의 주최 (AskUserQuestion 또는 `knowledge-tools:ontology-workshop` 위임) → 명확화 후 Step 0 재실행

Step 0의 결과는 Step 6 보고서의 "Step 0: 의도 정합성 검증" 섹션에 그대로 포함한다.

### Step 1: 변경사항 수집

인자가 있으면 해당 파일을 Read. 없으면:

```bash
git diff          # unstaged 변경
git diff --cached # staged 변경
```

변경이 없으면 사용자에게 안내하고 종료.

변경 파일 타입을 분석하여 적용할 리뷰 관점을 결정:
- 항상 적용: 코드 품질, 코드 단순화
- diff에 try/catch/except/throw/raise/Error 키워드가 포함된 경우: 에러 핸들링
- 타입/인터페이스 추가 시 (type, interface, class 선언): 타입 설계
- 테스트 파일 변경 시 (*.test.*, *.spec.*, *_test.*): 테스트 커버리지
- 주석/문서 변경 시 (JSDoc, docstring, // 주석 블록): 주석 정확성

### Step 2: 위임 판단

기존 리뷰 도구가 설치되어 있으면 위임한다. 우선순위:

1. **pr-review-toolkit** 존재 확인:
   - `pr-review-toolkit:review-pr` 스킬이 사용 가능한지 확인
   - 있으면 → Skill 도구로 `/pr-review-toolkit:review-pr` 호출
   - 위임 결과를 Step 4에서 codex 결과와 교차 비교

2. **gstack /review** 존재 확인:
   - `/review` 스킬이 사용 가능한지 확인
   - 있으면 → Skill 도구로 `/review` 호출
   - 위임 결과를 Step 4에서 codex 결과와 교차 비교

3. **위임 불가** → Step 3 자체 리뷰로 진행

### Step 3: 자체 리뷰 (위임 불가 시)

`${CLAUDE_PLUGIN_ROOT}/reference/review-criteria.md`에서 code-review 기준을 로드한다.

#### 3a. 프로젝트 컨텍스트 수집

1. CLAUDE.md를 Read하여 프로젝트 가이드라인 파악
2. 린터/포매터 설정 (.eslintrc, pyproject.toml 등) 확인
3. 프로젝트별 기준이 범용 기준과 충돌하면 프로젝트별 기준 우선

#### 3b. 6개 관점 검토

Step 1에서 결정한 적용 가능 관점으로 순차 검토:

Step 1에서 결정한 적용 가능 관점으로 순차 검토한다.

모든 관점에서 발견한 이슈는 공통 심각도로 통일하여 보고:
- **Critical (90-100)**: 버그, 보안 취약점, CLAUDE.md 명시 위반, 무음 실패
- **Important (80-89)**: 유의미한 품질 이슈, 부적절한 에러 메시지, 테스트 치명적 갭
- **Suggestion (60-79)**: 개선 제안, 단순화 가능, 주석 개선

**confidence < 80인 이슈는 Suggestion으로 분류하거나 보고하지 않는다.**

### Step 4: Codex 병렬 리뷰 (선택적)

`/codex` 스킬이 사용 가능한 경우, review 모드로 동일 diff에 대한 독립 리뷰를 실행한다.
codex 스킬이 없으면 이 단계를 건너뛰고 Claude 리뷰(자체 또는 위임) 결과만으로 보고서를 생성한다.

codex에 전달할 프롬프트:
```
다음 코드 변경을 리뷰해주세요.
관점: 버그, 에러 핸들링, 타입 안전성, 테스트 커버리지, 주석 정확성, 코드 단순화.
각 발견 사항에 파일:라인 참조와 Critical/Important/Suggestion 심각도를 부여해주세요.

[diff 내용]
```

### Step 5: 교차 비교 & 보고서 작성

Claude 리뷰(자체 또는 위임 결과)와 codex 결과를 비교:
- **합의**: 양쪽 동의 → 신뢰도 높음
- **한쪽만 지적**: 독립적 발견 → 맥락과 함께 보고

총평 판정:
- **PASS**: Critical 0건, Important 2건 이하
- **WARN**: Critical 0건, Important 3건 이상
- **BLOCK**: Critical 1건 이상

### Step 6: 보고서 출력

```markdown
# Code Review Report

## 총평: PASS | WARN | BLOCK
<1-2문장 요약>

## Step 0: 의도 정합성 검증

### 의도/요구사항 (수집됨)
1. [요구사항 1] — 출처: [대화 / 이슈 / PR / 커밋 메시지]
2. [요구사항 2] — 출처: [...]

### 산출물 매핑
| 요구사항 | 변경 매핑 | 상태 |
|----------|----------|------|
| 요구사항 1 | [파일:라인 또는 파일명] | ✅ 반영 |
| 요구사항 2 | — | ❌ 누락 |
| — | [변경 부분] | ⚠️ 과잉 |

### 판정: Clear & Aligned | Clear but Misaligned | Unclear

## 왜 (Why) — 변경 목적
- 이 변경이 해결하려는 문제

## 무엇을 (What) — 발견 사항

### 리뷰 소스
- [x/o] Claude 자체 리뷰 / pr-review-toolkit 위임 / gstack /review 위임
- [x/o] codex review

### 합의 (양쪽 동의)
- [심각도] 설명 [file:line]

### Claude(또는 위임)만 지적
- [심각도] 설명 [file:line]

### Codex만 지적
- [심각도] 설명 [file:line]

### 파일별 피드백
#### path/to/file.ts
- L42: [BUG/90] 설명
- L78: [STYLE/85] 설명

### 요약
| 카테고리 | Critical | Important | Suggestion |
|----------|----------|-----------|------------|
| 코드 품질 | 0 | 1 | 2 |
| 에러 핸들링 | 0 | 0 | 1 |
| 타입 설계 | 0 | 0 | 0 |
| 테스트 커버리지 | 0 | 1 | 0 |
| 주석 정확성 | 0 | 0 | 0 |
| 코드 단순화 | 0 | 0 | 1 |

### 강점
- 잘된 부분

## 어떻게 (How) — 권장 조치
1. [Critical 수정] → 검증: [방법]
2. [Important 수정] → 검증: [방법]
3. 수정 후 재리뷰 권장 여부

## 수정 계획 (Fix Plan)

> 이 계획에 대해 **컨펌**하시면 위에서 아래 순서로 수정을 진행합니다. 수정이 필요하면 **피드백**을 주세요.

### 필수 수정 (Critical + Important)

#### 1. {피드백 요약 제목 — 어떤 문제/개선인지 한 줄. 파일명 대신 주제}

- **피드백 내용**: {현재 코드/설계가 어떤 상태인지 + 위치(`path/to/file.ext:line` 또는 섹션)}
- **왜 제안했는지**: {발생 가능한 문제 · 위반한 원칙 · 근거가 되는 가이드라인}
- **어떻게 수정하면 좋은지**: {구체적 액션(필요 시 코드/패치 스니펫) + 수정 후 검증 방법}
- **사용자 의도와의 충돌 여부**: *(조건부 — 수집된 사용자 의도·plan·CLAUDE.md 원칙 중 하나라도 이 제안과 상충할 여지가 있을 때만 기술. 없으면 이 bullet 자체를 생략.)* {충돌 지점과 상충 의도의 출처(예: "plan §X에 Y로 명시", "CLAUDE.md 'Z 금지'"), 충돌임에도 제안한 이유 또는 사용자가 의도를 재확인해야 할 지점}

#### 2. {다음 피드백 요약 제목}

- **피드백 내용**: …
- **왜 제안했는지**: …
- **어떻게 수정하면 좋은지**: …
- **사용자 의도와의 충돌 여부**: *(해당 시)* …

### 선택 수정 (Suggestion)

#### 1. {피드백 요약 제목}

- **피드백 내용**: …
- **왜 제안했는지**: …
- **어떻게 수정하면 좋은지**: …
- **사용자 의도와의 충돌 여부**: *(해당 시)* …

### 사용자 액션 요청
- [ ] **컨펌** → 위 계획대로 수정 진행
- [ ] **피드백** → 아래 피드백을 받아 계획 수정 후 재확인
- [ ] **부분 승인** → 특정 항목만 선택하여 수정
```

Step 0이 **Clear but Misaligned**로 판정되어 Step 1~5를 건너뛴 경우, 기술적 발견 사항 섹션은 생략하고 Fix Plan의 필수 수정에 "정합성 복구 항목"을 우선 배치하여 사용자 컨펌을 먼저 받는다.

### Step 7: Fix Plan 컨펌 대기

보고서 출력 직후 `AskUserQuestion`으로 사용자에게 Fix Plan에 대한 액션을 요청한다.

- **컨펌** → Fix Plan의 필수 수정부터 순차 실행. 각 수정 후 검증(테스트/빌드/수동 확인) 결과 요약 보고
- **피드백** → 피드백 반영하여 Fix Plan 재작성 후 Step 7 반복
- **부분 승인** → 사용자가 선택한 항목만 실행

사용자의 추가 지시 없이는 수정을 진행하지 않는다. 컨펌을 받지 않은 리뷰는 "보고서 출력 완료" 상태로 종료한다.

## 출력 규칙

- **내부 Task ID 축약 단독 사용 금지**: 리뷰 보고서·PR 코멘트 제안·Fix Plan에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9`, 에픽 내부 순번 같은 축약을 한 보고서 내 첫 출현 시 단독 사용하지 않는다. 풀어쓰거나 괄호 병기(`Task 2(docx 변환)`, `Checkpoint 1(CP1)`). 이후 같은 보고서 내 반복은 단독 허용. Jira 티켓 번호(`CND-xxxx`)·PR 번호(`#xxxx`)·산업 표준 약어는 면제. 상세: 저장소 CLAUDE.md "사용자 대면 출력 규칙".
