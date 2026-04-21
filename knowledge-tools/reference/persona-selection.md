# 페르소나 자동 선택 가이드 (design-meeting)

`design-meeting` 스킬이 주제 유형에 따라 자동 선택하는 벤치 멤버 구성. SKILL.md의 "페르소나 시스템" 표와 반드시 동기화한다.

## 코어 멤버 (항상 참여)

모든 주제 유형에서 반드시 참여:

- `ontologist` — 본질 분석 (opus)
- `sw-expert` — 체계 분석 (opus)
- `user-proxy` — 경험 수집 (sonnet)

## `bench_policy` 플래그

| 값 | 동작 |
|----|------|
| `strict` | 벤치 전원 모든 라운드 참여 강제. 최대 커버리지. |
| `advisory`(기본) | 벤치는 Step 2·4에 참여. facilitator가 발언권 배분 조절 가능. |
| `off` | 코어 멤버만. 경량 결정/자기참조 주제/빠른 회전 시. |

복수 유형에 걸치는 주제는 유형 태그를 set으로 수집하고 벤치도 **합집합**으로 구성한다. 중복은 제거.

## 주제 유형별 벤치 셋

### 용어/네이밍

대상의 이름을 결정해야 할 때.

| 멤버 | 이유 |
|------|------|
| `linguist` | 의미론 분석, 한영 대응, 뉘앙스 비교 |
| `backend-dev` | 코드 네이밍 (클래스, 변수, API 경로) |
| `frontend-dev` | UI 레이블, TypeScript 타입명 |
| `designer` | 사용자 멘탈 모델과 레이블의 정합성 |

Step 4 strategy: `name-vote` (정의 정합성 검토 → 후보 이름 도출 → 최종 투표 1회).

### 개념 정의

두 개 이상의 개념 사이 구별이 필요하거나, 용어의 본질을 확립할 때.

| 멤버 | 이유 |
|------|------|
| `linguist` | 유사어 의미 범위 비교 |
| `tech-writer` | 문서화 관점 명확성 |
| `architect` | 구조적 경계와 관계 |

Step 4 strategy: `definition-debate` (반례 수집 → 경계 재조정 → 합의).

### 기술 선택

라이브러리, 프레임워크, 도구 등을 선택해야 할 때.

| 멤버 | 이유 |
|------|------|
| `architect` | 시스템 제약, 아키텍처 정합성 |
| `backend-dev` | 구현 복잡도, 코드 품질 |
| `devops` | 운영/배포 영향, 모니터링 |

Step 4 strategy: `tradeoff-matrix` (기준 정의 → 대안별 채점 → 절충안).

### 아키텍처

시스템 구조, 컴포넌트 분리, 계층 설계 등.

| 멤버 | 이유 |
|------|------|
| `architect` | 구조 설계의 주 분석자 |
| `backend-dev` | 구현 관점 피드백 |
| `devops` | 운영/확장성 |
| `security` | 보안 경계, 신뢰 수준 |

Step 4 strategy: `tradeoff-matrix`.

### API 설계

엔드포인트 시그니처, 책임 경계, 버전 전략 등.

| 멤버 | 이유 |
|------|------|
| `architect` | 책임 경계, 계약 안정성 |
| `backend-dev` | 구현 복잡도, 호환성 |
| `frontend-dev` | 소비자 관점 사용성 |
| `tech-writer` | 계약 문서화, 스펙 명확성 |

Step 4 strategy: `decision-debate` (대안 제시 → 제약/비용 분석 → 선택 근거).

### 데이터 모델

스키마 설계, 엔티티 관계, 저장 전략 등.

| 멤버 | 이유 |
|------|------|
| `architect` | 전체 시스템에서의 데이터 흐름 |
| `data-engineer` | 스키마, 인덱스, 파이프라인 |
| `backend-dev` | ORM, 쿼리 패턴, API 연동 |

Step 4 strategy: `decision-debate`.

### UI/UX 결정

사용자 인터페이스, 인터랙션, 정보 구조 등.

| 멤버 | 이유 |
|------|------|
| `designer` | 멘탈 모델, 정보 아키텍처 |
| `frontend-dev` | 컴포넌트 구조, 구현 가능성 |
| `pm` | 비즈니스 요구, 이해관계자 |

Step 4 strategy: `decision-debate` 또는 `tradeoff-matrix`.

### 메타-설계 (스킬/프로세스/프로토콜)

이 스킬 자체 개선, 워크플로우 재설계, 프로토콜 정의 등. **재귀 주제 태그 주의**.

| 멤버 | 이유 |
|------|------|
| `architect` | 시스템적 설계 원칙 |
| `tech-writer` | 문서 일관성, 절차 명확성 |
| `pm` | 이해관계자·로드맵 |
| `qa-engineer` | 실패 시나리오, 품질 기준 |

Step 4 strategy: `risk-register` (실패 시나리오 수집 → 완화책 → 잔여 위험).

재귀 주제에서는 `user-proxy`가 Step 1에서 "가정" 대신 원안 문서 인용만 허용.

## 사용자 커스텀

AskUserQuestion으로 자동 추천 목록을 보여주고:
- 추가하고 싶은 멤버
- 제거하고 싶은 멤버

를 확인한다. 전체 벤치 풀:
`linguist`, `architect`, `backend-dev`, `frontend-dev`, `designer`, `pm`, `qa-engineer`, `devops`, `tech-writer`, `test-engineer`, `security`, `data-engineer`
