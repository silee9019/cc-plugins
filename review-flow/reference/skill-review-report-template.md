# Skill Review Report Template

`skill-review` 스킬의 Step 6(교차 비교 & 보고서 작성)에서 그대로 채워 출력하는 보고서 템플릿. SKILL.md에는 이 파일을 Read 하라는 지시만 두고, 실제 템플릿은 여기서만 관리한다 (중복 정의 방지, progressive disclosure 개선).

## 사용 규칙

- 모든 섹션을 생략 없이 채운다. 해당 없음(N/A)인 경우 `-` 로 표기
- Step 0이 **Clear but Misaligned**면 "무엇을 (What)" 섹션 대신 Fix Plan 필수 수정에 "정합성 복구 항목"을 배치하고, 일반 기술 리뷰 섹션은 건너뜀
- 연속 실패 Error 임계 초과 시, Fix Plan 직전에 `skill-review-criteria.md` §2-4 Step 5의 AskUserQuestion을 삽입하고 사용자가 "중단" 선택 시 `skill-review-criteria.md` §2-5 트러블슈팅 안내 출력 항목만 출력
- 총평 임계값: `PASS` (Critical 0 & Important ≤ 2) / `WARN` (Critical 0 & Important ≥ 3) / `BLOCK` (Critical ≥ 1 or Step 0 Misaligned)

## 템플릿

```markdown
# Skill Review Report

## 총평: PASS | WARN | BLOCK
<1-2문장 요약>

## Step 0: 의도 정합성 검증

### 의도/요구사항 (수집됨)
1. [요구사항 1] — 출처: [대화 / 플랜 / 이슈 / CLAUDE.md]
2. [요구사항 2] — 출처: [...]

### 산출물 매핑
| 요구사항 | 문서 매핑 | 상태 |
|----------|----------|------|
| 요구사항 1 | [예: description 트리거 키워드 "X"] | ✅ 반영 |
| 요구사항 2 | — | ❌ 누락 |
| — | [문서 부분] | ⚠️ 과잉 |

### 판정: Clear & Aligned | Clear but Misaligned | Unclear

## 기준 소스 (Source of Truth)
- 공식 가이드 페치: ✅ 성공 | ⚠️ 캐시 사용(stale 가능성) | 🚨 실패(Tentative)
- 페치된 URL (Step 2 디스커버리 결과):
  - {llms.txt URL}
  - {skills.md 또는 commands.md URL}
  - [기타 관련 페이지]
- 마지막 성공 시각: YYYY-MM-DDTHH:MM+09:00
- 연속 실패 횟수: N
- Fallback 여부: [없음 / 보조 참조 사용]

## 왜 (Why) — 리뷰 배경
- 문서 종류: [스킬 / 커맨드]
- 파일 경로: [...]
- 이 문서의 목적

## 무엇을 (What) — 발견 사항

### 리뷰 소스
- [x/o] 공식 가이드 (라이브 페치)
- [x/o] plugin-dev:skill-reviewer 위임 (공식 가이드로 재검증됨)
- [x/o] 자체 리뷰
- [x/o] codex review

### 합의 (여러 소스 동의)
- [심각도] 설명 — 근거: [공식 가이드 URL#섹션]

### 공식 가이드와 위임 결과 불일치
- [항목] 위임: X / 공식: Y → 공식 채택

### 카테고리별 평가
| 카테고리 | Critical | Important | Suggestion |
|----------|----------|-----------|------------|
| Frontmatter 필드 유효성 | 0 | 0 | 0 |
| Description 트리거 | 0 | 0 | 0 |
| 본문 구조/길이 | 0 | 0 | 0 |
| 문체 (명령형, Claude 대상) | 0 | 0 | 0 |
| 동적 기능 사용 | 0 | 0 | 0 |
| 파일 참조 무결성 | 0 | 0 | 0 |

### 강점
- 잘된 부분

## 어떻게 (How) — 권장 조치
1. [조치] → 검증: [방법] → 근거: [공식 가이드 URL/섹션]
2. ...

## 수정 계획 (Fix Plan)

> 이 계획에 대해 **컨펌**하시면 수정을 진행합니다. 수정이 필요하면 **피드백**을 주세요.

### 필수 수정 (Critical + Important)
1. **[파일:라인 또는 섹션]** — [무엇을 어떻게 바꿀지 구체적 액션]
   - 근거: [공식 가이드 URL/섹션 또는 리뷰 발견 근거]
   - 검증: [수정 후 확인 방법]
2. ...

### 선택 수정 (Suggestion)
1. **[...]** — [...]

### 실행 순서
1. 필수 1 → 필수 2 → ...
2. 각 수정 후 검증 단계
3. 전체 재리뷰 권장 여부

### 사용자 액션 요청
- [ ] **컨펌** → 위 계획대로 수정 진행
- [ ] **피드백** → 아래 피드백을 받아 계획 수정 후 재확인
- [ ] **부분 승인** → 특정 항목만 선택하여 수정
```
