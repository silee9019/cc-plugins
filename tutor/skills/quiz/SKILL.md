---
name: quiz
description: |
  학습 노트 기반 4지선다 퀴즈 세션. 약점 드릴, 주제별 퀴즈, 전체 리뷰, 대시보드 조회를 지원.
  진행도를 자동 추적. Python 스크립트로 파싱/계산/집계를 결정론적으로 처리.
  트리거: "퀴즈", "quiz", "학습 테스트", "복습", "drill", "약점 드릴",
  "/tutor:quiz"
---

# 퀴즈

학습 노트의 `> [!quiz]` 문항을 기반으로 4지선다 퀴즈를 진행하고, 결과를 추적한다.

**Obsidian CLI 레퍼런스**: `@reference/obsidian-cli-reference.md`
**퀴즈 문항 스키마**: `@reference/quiz-schema.md`

## Workflow

### Step 1: 설정 로드

`~/.claude/plugins/data/tutor-cc-plugins/config.md`를 읽어 설정값을 로드한다.

- **파일 존재**: `vault`, `study_base_path`, `quiz_results_path`, `dashboard_path` 값을 로드. Step 2로 진행.
- **파일 없음**: 아래 안내를 출력하고 중단.

```
tutor 설정이 없습니다. 먼저 /tutor:setup 을 실행해주세요.
```

### Step 2: 모드 판별

사용자 입력에 따라 모드를 결정한다.

| 인자 | 모드 | 동작 |
|------|------|------|
| `dashboard` | 대시보드 | Step 3A: 학습 현황 요약 표시 |
| `drill` | 약점 드릴 | Step 3B: mastery 낮은 노트 자동 선택 |
| `<주제명>` | 특정 주제 | Step 3C: 해당 노트에서 출제 |
| (없음) | 자동 선택 | Step 3D: 상태 분석 후 최적 모드 제안 |

### Step 3A: 대시보드 표시 (스크립트)

Python 스크립트로 전체 노트를 스캔하여 사용자에게 인라인으로 표시한다 (vault에 저장하지 않음 — gen_dashboard.py는 Step 9에서 vault 저장 시에만 사용).

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/scan_notes.py" "<vault>" "<study_base_path>"
```

출력된 JSON을 읽어 대시보드를 사용자에게 표시:

```
📊 학습 대시보드

전체: {total_notes}개 노트 | 평균 mastery: {avg_mastery}%

카테고리별:
  {emoji} {category}  ({notes}개, 평균 {mastery}%)
  ...

약점 영역 (mastery < 50%):
  - {category}/{note_name} ({mastery}%)
  ...

다음 추천: /tutor:quiz drill
```

대시보드 표시 후 종료.

### Step 3B: 약점 드릴 — 대상 자동 선택 (스크립트)

1. 스캔 스크립트로 전체 노트 통계를 가져온다:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/scan_notes.py" "<vault>" "<study_base_path>"
```

2. JSON 출력에서 mastery가 가장 낮은 노트 1-3개를 자동 선택한다.
   - 모든 노트의 mastery >= 80%이면: "모든 영역이 양호합니다. 전체 리뷰를 진행할까요?" (AskUserQuestion)
3. Step 4로 진행.

### Step 3C: 특정 주제 퀴즈

1. 인자로 받은 주제명으로 노트를 검색한다.
   - `obsidian vault="<vault>" search query="<주제명>"` 실행
   - `study_base_path` 하위 결과만 필터링, `_` prefix 파일/폴더 제외
2. 검색 결과:
   - 1개: 해당 노트 선택. Step 4로 진행.
   - 2개+: AskUserQuestion으로 목록 제시하여 선택.
   - 0개: "해당 주제의 학습 노트를 찾을 수 없습니다." 안내 후 중단.

### Step 3D: 자동 선택 (스크립트)

1. 스캔 스크립트로 전체 노트 통계를 가져온다.
2. 조건에 따라 모드를 제안하고 AskUserQuestion으로 확인:

| 조건 | 제안 |
|------|------|
| mastery < 50% 노트 존재 | "약점 드릴을 추천합니다: {노트 목록}" |
| 퀴즈 미실시 (quiz_count == 0) 노트 존재 | "아직 퀴즈를 풀지 않은 노트가 있습니다: {노트 목록}" |
| 모두 >= 80% | "전체 리뷰를 진행합니다" |

3. 사용자 선택에 따라 대상 노트를 결정. Step 4로 진행.

### Step 4: 문항 추출 (스크립트)

선택된 노트를 `parse_quiz.py`로 파싱한다.

**기본 모드** (주제/리뷰):
```bash
obsidian vault="<vault>" read path="<노트경로>" \
  | python3 "${CLAUDE_PLUGIN_ROOT}/scripts/parse_quiz.py" --shuffle
```

**약점 드릴 모드** — 이전 오답 우선 배치:
1. `quiz_results_path`에서 해당 노트의 최근 결과 노트를 찾는다:
```bash
obsidian vault="<vault>" files folder="<quiz_results_path>"
```
2. 노트명에 주제가 포함된 결과 중 최신 1개를 읽어 오답 질문을 추출한다:
```bash
obsidian vault="<vault>" read path="<최근 결과 노트>" \
  | python3 -c "
import sys, re
for line in sys.stdin:
    m = re.match(r'^### Q: (.+)', line)
    if m: print(m.group(1))
" > /tmp/tutor-priority.txt
```
3. 우선 배치 파싱:
```bash
obsidian vault="<vault>" read path="<노트경로>" \
  | python3 "${CLAUDE_PLUGIN_ROOT}/scripts/parse_quiz.py" --shuffle --prioritize /tmp/tutor-priority.txt
```

4. 이전 결과가 없으면 `--shuffle`만 사용.

출력된 JSON 배열을 퀴즈 문항 목록으로 사용. 라운드당 최대 10문항.

### Step 5: 퀴즈 세션 진행

parse_quiz.py 출력의 JSON 배열에서 한 문항씩 AskUserQuestion으로 제시한다.

**문항 제시 형식**:

AskUserQuestion의 question 필드:
```
Q{n}/{총문항}: {question}
```

options 필드에 4개 선택지를 제공:
- label: `A) {a}` ~ `D) {d}`
- description: (빈 문자열)

**정답 확인 후 피드백**:

- 정답: `✅ 정답! {explanation}`
- 오답: `❌ 오답. 정답은 {answer}. {explanation}`

각 문항의 정답/오답을 기록한다.

### Step 6: 결과 요약

세션 종료 후 결과를 출력한다:

```
퀴즈 완료!

점수: {정답수}/{총문항수} ({백분율}%)
주제: {주제 목록}

오답 분석:
  Q{n}: {question} → 정답: {answer}, 내 답: {선택한 답}
  ...
```

### Step 7: 진행도 업데이트 (스크립트)

Python 스크립트로 mastery를 계산하고 frontmatter를 업데이트한다.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/update_mastery.py" "<vault>" "<노트경로>" <정답수> <출제수>
```

여러 노트에서 출제한 경우 각 노트별로 실행한다.

### Step 8: 퀴즈 결과 노트 저장

`quiz_results_path`에 결과 노트를 생성한다.

```bash
obsidian vault="<vault>" create name="{YYYY-MM-DD} {주제}" path="<quiz_results_path>" content="<결과 노트>"
```

**결과 노트 형식**:

```markdown
---
created: {YYYY-MM-DD}
session_type: "{topic|drill|review}"
topics:
  - "{주제1}"
score: "{정답수}/{총문항수}"
percentage: {백분율}
---

# 퀴즈 결과 — {YYYY-MM-DD}

## 점수: {정답수}/{총문항수} ({백분율}%)

## 세션 정보

- 모드: {topic|drill|review}
- 주제: {주제 목록}

## 오답 분석

### Q: {틀린 질문}
- 내 답: {선택한 답}
- 정답: {정답}
- 해설: {해설}
```

### Step 9: 대시보드 갱신 (스크립트)

Python 스크립트로 전체 노트를 스캔하여 대시보드를 재생성한다.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/scan_notes.py" "<vault>" "<study_base_path>" \
  | python3 "${CLAUDE_PLUGIN_ROOT}/scripts/gen_dashboard.py" > /tmp/tutor-dashboard.md
obsidian vault="<vault>" create name="_dashboard" path="<study_base_path>" content="$(cat /tmp/tutor-dashboard.md)"
```

### Step 10: 다음 추천

```
다음 추천:
  - 약점 드릴: /tutor:quiz drill
  - 특정 주제: /tutor:quiz <주제명>
  - 현황 확인: /tutor:quiz dashboard
```
