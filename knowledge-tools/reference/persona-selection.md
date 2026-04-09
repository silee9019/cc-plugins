# 페르소나 자동 선택 가이드

## 코어 멤버 (항상 참여)

모든 분석 유형에서 반드시 참여:
- `ontologist` — 본질 분석
- `sw-expert` — 체계 분석
- `user-proxy` — 경험 수집

## 벤치 멤버 자동 선택

### 용어/네이밍

대상의 이름을 결정해야 할 때.

| 멤버 | 이유 |
|------|------|
| `linguist` | 의미론 분석, 한영 대응, 뉘앙스 비교 |
| `backend-dev` | 코드 네이밍 (클래스, 변수, API 경로) |
| `frontend-dev` | UI 레이블, TypeScript 타입명 |
| `designer` | 사용자 멘탈 모델과 레이블의 정합성 |

### 개념 정의

두 개 이상의 개념 사이 구별이 필요할 때.

| 멤버 | 이유 |
|------|------|
| `linguist` | 유사어 의미 범위 비교 |
| `tech-writer` | 문서화 관점 명확성 |
| `architect` | 구조적 경계와 관계 |

### 기술 선택

라이브러리, 프레임워크, 도구 등을 선택해야 할 때.

| 멤버 | 이유 |
|------|------|
| `architect` | 시스템 제약, 아키텍처 정합성 |
| `backend-dev` | 구현 복잡도, 코드 품질 |
| `devops` | 운영/배포 영향, 모니터링 |

### 아키텍처

시스템 구조, 컴포넌트 분리, 계층 설계 등.

| 멤버 | 이유 |
|------|------|
| `architect` | 구조 설계의 주 분석자 |
| `backend-dev` | 구현 관점 피드백 |
| `devops` | 운영/확장성 |
| `security` | 보안 경계, 신뢰 수준 |

### UI/UX 결정

사용자 인터페이스, 인터랙션, 정보 구조 등.

| 멤버 | 이유 |
|------|------|
| `designer` | 멘탈 모델, 정보 아키텍처 |
| `frontend-dev` | 컴포넌트 구조, 구현 가능성 |
| `pm` | 비즈니스 요구, 이해관계자 |

### 데이터 모델

스키마 설계, 엔티티 관계, 저장 전략 등.

| 멤버 | 이유 |
|------|------|
| `architect` | 전체 시스템에서의 데이터 흐름 |
| `data-engineer` | 스키마, 인덱스, 파이프라인 |
| `backend-dev` | ORM, 쿼리 패턴, API 연동 |

## 사용자 커스텀

AskUserQuestion으로 자동 추천 목록을 보여주고:
- 추가하고 싶은 멤버
- 제거하고 싶은 멤버

를 확인한다. 전체 벤치 풀:
`linguist`, `architect`, `backend-dev`, `frontend-dev`, `designer`, `pm`, `qa-engineer`, `devops`, `tech-writer`, `test-engineer`, `security`, `data-engineer`
