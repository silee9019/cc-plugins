---
name: code-review
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
```
