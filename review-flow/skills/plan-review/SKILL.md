---
name: plan-review
description: |
  설계/계획 단계의 품질 검토. codex 병렬 리뷰와 교차 비교로 설계 결함을 조기 발견.
  트리거: "설계 리뷰", "plan review", "계획 검토", "구현 전 리뷰", "이 설계 괜찮아?",
  "플랜 리뷰", "design review", "이 방향 맞아?", "아키텍처 리뷰",
  "구현해도 될까?", "이대로 진행해도 돼?", "설계 피드백", "RFC 리뷰", "ADR 리뷰"
---

# Plan Review

설계/계획을 구조화된 기준으로 검토하고, codex 병렬 리뷰와 교차 비교하여 보고서를 생성한다.

## 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| 대상 | N | 리뷰할 설계 문서 경로 또는 대화 컨텍스트 내 설계. 없으면 현재 대화에서 가장 최근 설계/계획을 사용 |

## Workflow

### Step 1: 리뷰 대상 파악

인자가 있으면 해당 파일을 Read. 없으면 현재 대화 컨텍스트에서 설계/계획 내용을 식별한다.

리뷰 대상이 불명확하면 AskUserQuestion으로 확인:
- "어떤 설계/계획을 리뷰할까요?"

### Step 2: 프로젝트 컨텍스트 수집

1. CLAUDE.md를 Read하여 프로젝트 가이드라인 파악
2. README.md, ARCHITECTURE.md 등 아키텍처 문서가 있으면 Read
3. `${CLAUDE_PLUGIN_ROOT}/reference/review-criteria.md`에서 plan-review 기준 로드

### Step 3: 병렬 리뷰 실행

**Claude 자체 리뷰**와 **codex 리뷰**를 병렬로 실행한다.

#### 3a. Claude 자체 리뷰

review-criteria.md의 plan-review 기준 5개 관점으로 설계를 평가:

1. **요구사항 충족**: 빠진 요구사항, 암묵적 가정
2. **단순성 (YAGNI)**: 과잉 설계, 불필요한 추상화
3. **아키텍처 정합성**: 기존 패턴/컨벤션 부합, 기존 코드 재사용
4. **엣지케이스**: 경계 조건, 에러 시나리오, 비기능 요구사항
5. **검증 전략**: 테스트 계획, 성공 기준

각 관점에서 발견한 이슈에 심각도를 부여:
- **Critical (BLOCK)**: 이대로 구현하면 반드시 문제 발생
- **Important (WARN)**: 수정하지 않으면 품질 저하 우려
- **Suggestion**: 개선하면 좋지만 필수는 아님

#### 3b. Codex 병렬 리뷰 (선택적)

`/codex` 스킬이 사용 가능한 경우, consult 모드로 동일한 설계를 독립 검토 요청한다.
codex 스킬이 없으면 이 단계를 건너뛰고 Claude 자체 리뷰만으로 보고서를 생성한다.

codex에 전달할 프롬프트:
```
다음 설계/계획을 검토해주세요.
관점: 요구사항 충족, 단순성, 기존 패턴 정합성, 엣지케이스, 검증 전략.
각 발견 사항에 Critical/Important/Suggestion 심각도를 부여해주세요.

[설계 내용]
```

### Step 4: 교차 비교 & 보고서 작성

양쪽 결과를 비교하여 다음을 식별:
- **합의**: Claude와 Codex가 모두 지적한 사항 → 신뢰도 높음
- **Claude만 지적**: Claude 고유 발견
- **Codex만 지적**: Codex 고유 발견

총평 판정:
- **PASS**: Critical 0건, Important 2건 이하
- **WARN**: Critical 0건, Important 3건 이상
- **BLOCK**: Critical 1건 이상

### Step 5: 보고서 출력

```markdown
# Plan Review Report

## 총평: PASS | WARN | BLOCK
<1-2문장 요약>

## 왜 (Why) — 리뷰 배경
- 리뷰 대상 설계의 목적과 맥락
- 관련 프로젝트 가이드라인

## 무엇을 (What) — 발견 사항

### 리뷰 소스
- [x/o] Claude 자체 리뷰
- [x/o] codex review

### 합의 (Claude + Codex 동의)
- [심각도] 설명

### Claude만 지적
- [심각도] 설명

### Codex만 지적
- [심각도] 설명

### 강점
- 잘된 부분

## 어떻게 (How) — 권장 조치
1. [조치] → 검증: [방법]
2. ...
```
