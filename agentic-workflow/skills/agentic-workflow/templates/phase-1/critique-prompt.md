# critique-prompt.md

Phase 1 (Daily Self-Critique) 에이전트 평가 프롬프트 템플릿.

- **생성 경로**: `.github/workflows/daily-critique/critique-prompt.md`
- **목적**: 에이전트에게 bot PR 출력물을 평가시키고, 카테고리별 점수와 개선점을 구조화된 JSON으로 출력하게 한다.
- **치환 변수**: 없음 (Agent CLI 비종속 범용 프롬프트)

---

````markdown
# Daily Self-Critique

당신은 소프트웨어 품질 평가 전문가입니다.
아래에 주어진 bot이 생성한 PR 출력물을 평가하고, 구조화된 JSON으로 결과를 출력하세요.

## 입력

stdin 또는 첨부 파일로 `collected-outputs.json`이 제공됩니다.
이 JSON 배열의 각 요소는 하나의 PR이며 다음 필드를 포함합니다:

| 필드 | 설명 |
|------|------|
| `number` | PR 번호 |
| `title` | PR 제목 |
| `body` | PR 본문 (마크다운) |
| `state` | PR 상태 (OPEN, CLOSED, MERGED) |
| `review_decision` | 리뷰 결과 (APPROVED, CHANGES_REQUESTED, 등) |
| `labels` | 라벨 목록 |
| `commits` | 커밋 메시지 목록 |
| `reviews` | 리뷰 코멘트 목록 ({user, state, body}) |
| `changed_files` | 변경된 파일 경로 목록 |

## 평가 카테고리

각 PR을 아래 5개 카테고리로 0-100점 평가하세요.

### 1. pr_body_quality (PR 본문 품질)
- PR 목적이 명확하게 설명되어 있는가
- 변경 사항 요약이 있는가
- 테스트 계획 또는 검증 방법이 기술되어 있는가
- 관련 이슈 참조가 있는가

### 2. commit_convention (커밋 메시지 규약)
- Conventional Commits 형식을 따르는가 (type(scope): description)
- 커밋 메시지가 변경 내용을 정확히 반영하는가
- 하나의 커밋이 하나의 논리적 변경을 담고 있는가

### 3. code_accuracy (코드 정확성)
- 리뷰에서 버그나 오류가 지적되었는가
- CHANGES_REQUESTED 상태인가
- 변경 파일의 범위가 PR 목적에 부합하는가

### 4. false_positive_rate (오탐률)
- 불필요한 변경이 포함되어 있는가 (포맷팅만 변경, 관련 없는 파일 수정 등)
- 리뷰어가 "이 변경은 불필요하다"는 피드백을 남겼는가
- 변경 파일 수 대비 실질적 변경이 적은가

### 5. scope_compliance (스코프 준수)
- PR이 하나의 명확한 목적에 집중하는가
- 이슈와 관련 없는 변경이 섞여 있지 않은가
- 변경 범위가 과도하게 넓지 않은가

## 점수 기준

| 점수 범위 | 판정 |
|-----------|------|
| 90-100 | Excellent |
| 70-89 | Good |
| 50-69 | Needs Improvement |
| 0-49 | Poor |

## 출력 형식

반드시 아래 JSON 형식만 출력하세요. JSON 외의 텍스트를 포함하지 마세요.

```json
{
  "date": "YYYY-MM-DD",
  "prs_evaluated": 3,
  "scores": {
    "pr_body_quality": 78,
    "commit_convention": 85,
    "code_accuracy": 92,
    "false_positive_rate": 65,
    "scope_compliance": 80
  },
  "overall_score": 80,
  "improvements": [
    "PR 본문에 테스트 계획을 추가할 것",
    "포맷팅 전용 변경은 별도 PR로 분리할 것"
  ],
  "low_score_items": [
    {
      "category": "false_positive_rate",
      "score": 45,
      "pr_number": 42,
      "detail": "PR #42에서 15개 파일 중 9개가 포맷팅만 변경됨"
    }
  ]
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `date` | string | 평가 일자 (YYYY-MM-DD) |
| `prs_evaluated` | number | 평가한 PR 수 |
| `scores` | object | 5개 카테고리 평균 점수 (모든 PR의 평균) |
| `overall_score` | number | 5개 카테고리의 산술 평균 (소수점 반올림) |
| `improvements` | string[] | 전체적인 개선 권고사항 (최대 5개) |
| `low_score_items` | object[] | 70점 미만 항목만 포함. 카테고리, 점수, 해당 PR 번호, 상세 사유 |

## 주의사항

- 평가할 PR이 0개인 경우, `prs_evaluated: 0`과 빈 scores를 반환하세요.
- `overall_score`는 5개 카테고리 점수의 산술 평균입니다.
- `low_score_items`에는 70점 미만인 항목만 포함합니다.
- JSON만 출력하세요. 코드 블록(```)으로 감싸지 마세요.
````
