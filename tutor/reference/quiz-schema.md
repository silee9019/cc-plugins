# Quiz Callout Schema

study-notes 스킬과 quiz 스킬이 공유하는 퀴즈 문항 형식.
`parse_quiz.py`가 이 형식을 기준으로 파싱한다.

## 문항 블록

각 문항은 Obsidian callout 블록으로 작성한다:

```
> [!quiz]- Q{N}: {질문 텍스트}
> - A) {선택지 텍스트}
> - B) {선택지 텍스트}
> - C) {선택지 텍스트}
> - D) {선택지 텍스트}
> **정답**: {A|B|C|D}
> **해설**: {해설 텍스트}
```

## 필수 규칙

| 요소 | 규칙 | 예시 | 금지 |
|------|------|------|------|
| 질문 구분자 | 콜론(`:`) | `Q1: 질문` | `Q1. 질문` |
| 선택지 구분자 | 대문자 + `)` | `A) 텍스트` | `(A)`, `a)` |
| 정답 키워드 | `**정답**:` (한국어, 볼드) | `**정답**: B` | `**Answer**:` |
| 해설 키워드 | `**해설**:` (한국어, 볼드) | `**해설**: 설명` | `**Explanation**:` |
| callout prefix | 모든 줄 `> `로 시작 | `> - A) 텍스트` | `- A) 텍스트` |
| 문항 번호 | 1부터 순차 증가 | `Q1`, `Q2`, `Q3` | `Q0`, 중복 번호 |

## Frontmatter 스키마

학습 노트의 YAML frontmatter에 포함되는 퀴즈 관련 필드:

```yaml
quiz_ready: true          # 퀴즈 문항 포함 여부
mastery: 0                # 학습 숙련도 (0-100, EMA)
quiz_count: 0             # 퀴즈 실시 횟수
total_questions: {N}      # 생성된 총 문항 수
correct_count: 0          # 누적 정답 수
last_quiz_date: ""        # 마지막 퀴즈 날짜 (YYYY-MM-DD)
```

## Mastery 계산 공식

`update_mastery.py`가 실행하는 계산:

- **첫 퀴즈** (quiz_count == 1): `mastery = round(정답수 / 출제수 * 100)`
- **이후**: `mastery = round(기존_mastery * 0.6 + 이번_정답률 * 0.4)` (EMA)
