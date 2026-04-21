---
name: review-memento
display_name: review-memento
description: "memento 산출물 품질을 5개 페르소나로 다면 평가하고 개선점을 도출. 주 1회 또는 수시 실행."
user_invocable: true
---

# Review Memento - 산출물 품질 평가

memento 스킬이 만들어낸 산출물(Daily Notes, raw 로그, WORKING.md, ROOT.md, Issue Box)의 품질을 다면적으로 평가하고, 개선 우선순위를 도출한다.

**목적**: memento 시스템의 지속적 개선. 스킬 자체를 계속 더 나아지게 만드는 피드백 루프.

## 트리거

"산출물 평가", "품질 점검", "memento 리뷰", "review-memento", "스킬 개선"

## 기본값

- 평가 기간: 최근 7일
- 페르소나: 전체 5개

## 5개 평가 페르소나

| 페르소나 | 핵심 질문 | 평가 항목 |
|----------|----------|----------|
| **Future Me** | "바로 이어갈 수 있는가?" | WORKING.md 재개성, Daily Note 타임라인 완성도, 미완료 추적 정확성, raw 로그 연속성 |
| **Retrospective Analyst** | "배움을 추출할 수 있는가?" | Review 작성 일관성, 교훈 S/N비(판단 원칙 vs API 메모), 성장 궤적 가시성, 주간 회고 연결성 |
| **Memory Architect** | "효율적으로 저장/검색되는가?" | raw 로그 S/N비, ROOT.md 최신성, Daily Note-raw 로그 중복도, User ROOT.md 승격 현황 |
| **Manager** | "성과를 보고할 수 있는가?" | 성과 추적성(숫자/결과물), 의사결정 근거 명시, 보류 항목 리스크 가시성, 팀 상호작용 기록 |
| **Tool Designer** | "스킬이 목적을 달성하는가?" | 스킬별 목적 달성도, 워크플로우 일관성, Issue Box 소화율, 새 규칙 도입 효과 |

## 절차

### Step 1: 설정 로드 + 산출물 수집

1. config.md 로드
2. 최근 7일간 수집:
   - Daily Notes (`{daily_notes_path}/{today}.md`, 지난 Daily는 `{daily_archive_path}/...`)
   - raw 로그 (`{memento_root}/projects/{id}/memory/YYYY-MM-DD.md`)
   - WORKING.md (현재)
   - ROOT.md (프로젝트 + user)
   - Issue Box (00-inbox, 01-in-progress 파일 목록)
3. 이전 평가 결과 확인 (`{memento_root}/projects/{id}/audit/` 최신 파일)

### Step 2: 페르소나별 평가

각 페르소나에 대해 해당 평가 항목을 0-10으로 점수화. 반드시 **구체적 근거** 포함.

점수 기준:
- 9-10: 모범 사례 수준
- 7-8: 잘 작동하고 있음
- 5-6: 기능은 하지만 개선 여지
- 3-4: 문제가 있어 개선 필요
- 1-2: 목적 달성 못 함

### Step 3: 종합 + 이전 대비 변화

1. 페르소나별 평균 점수 산출
2. 전체 평균 산출
3. 이전 평가 결과가 있으면 변화량 표시 (상승/하락 화살표)

### Step 4: 개선 우선순위 도출

Top 5 개선 항목 도출. 각 항목:
- 문제 설명 (1줄)
- 영향받는 페르소나 + 예상 점수 개선
- 구체적 개선 액션 (실행 가능한 수준)

**교훈 필터링 기준** (Retrospective Analyst 평가 시 적용):
- Review "배운 것"에 넣을 것: 재사용 가능한 판단 원칙, 프로세스 개선, 사고 프레임 전환
- 넣지 말 것: API 레퍼런스 메모, 도구 사용법, 일회성 기술 디테일 (-> 코드 주석 또는 Knowledge 폴더)

### Step 5: 결과 저장 + 캡처

1. 결과를 `{memento_root}/projects/{id}/audit/YYYY-MM-DD.md`에 저장
2. Top 5 개선 항목 중 실행 가능한 것을 Issue Box inbox에 캡처 (`/memento:capture-task`)

## 출력 포맷

```markdown
# Memento Review - {YYYY-MM-DD}

## 종합: {전체 평균}/10 ({이전 대비 변화})

| 페르소나 | 점수 | 변화 | 핵심 이슈 |
|----------|------|------|----------|
| Future Me | X.X | +/-N | ... |
| Retrospective Analyst | X.X | +/-N | ... |
| Memory Architect | X.X | +/-N | ... |
| Manager | X.X | +/-N | ... |
| Tool Designer | X.X | +/-N | ... |

## 개선 우선순위

1. **[문제]** - 영향: [페르소나], 예상 개선: +N
   - 액션: [구체적 실행 항목]
2. ...

## 상세 평가
(페르소나별 항목별 점수 + 근거)
```

## 원칙

- 구체적 근거와 예시로 점수화
- 이전 대비 변화 추적
- 실행 가능한 개선 액션 도출
- 교훈 S/N비 평가 (판단 원칙 vs API 메모 구분)
- 개선 항목은 Issue Box에 캡처하여 실행 추적
- **내부 Task ID 축약 단독 사용 금지**: 평가 보고서·개선 항목 본문에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9` 같은 축약을 한 문서 내 첫 출현 시 풀어쓰거나 괄호 병기. 이후 반복은 단독 허용. 상세: 저장소 CLAUDE.md.
