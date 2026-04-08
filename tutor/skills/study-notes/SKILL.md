---
name: study-notes
description: |
  학습 자료(URL, PDF, MD, 코드)를 Obsidian 노트로 변환하여 vault에 저장.
  핵심 요약, 주요 개념, 퀴즈 문항을 포함한 구조화된 학습 노트를 생성.
  트리거: "학습 노트", "스터디 노트", "자료 정리", "URL 학습", "study notes",
  "/tutor:study-notes"
---

# 학습 노트 생성

다양한 소스에서 콘텐츠를 추출하고, 구조화된 학습 노트로 변환하여 Obsidian vault에 저장한다.

**Obsidian CLI 레퍼런스**: `@reference/obsidian-cli-reference.md`
**퀴즈 문항 스키마**: `@reference/quiz-schema.md`

## Workflow

### Step 1: 설정 로드

`~/.claude/plugins/data/tutor-cc-plugins/config.md`를 읽어 YAML frontmatter에서 설정값을 로드한다.

- **파일 존재**: `vault`, `study_base_path`, `dashboard_path` 값을 로드. Step 2로 진행.
- **파일 없음**: 아래 안내를 출력하고 중단.

```
tutor 설정이 없습니다. 먼저 /tutor:setup 을 실행해주세요.
```

### Step 2: 소스 판별

사용자 입력에서 소스 유형을 자동 감지한다.

| 소스 유형 | 판별 기준 | 처리 방법 |
|-----------|----------|----------|
| URL | `http://` 또는 `https://`로 시작 | Step 3A |
| 로컬 파일 | 파일 경로 (`.pdf`, `.md`, `.html`, `.txt`) | Step 3B |
| 코드 디렉토리 | 디렉토리 경로 또는 소스코드 파일 | Step 3C |
| 텍스트 직접 입력 | 위 해당 없음 | Step 3D |
| 인자 없음 | 빈 인자 | AskUserQuestion으로 소스를 묻는다 |

### Step 3A: URL 콘텐츠 가져오기

1. WebFetch 도구로 URL 콘텐츠를 가져온다.
   - prompt: "이 페이지의 전체 내용을 가능한 한 상세하게 추출해줘. 제목, 본문, 코드 블록, 목록 등을 모두 포함."
2. WebFetch 실패 시: "이 URL의 콘텐츠를 가져올 수 없습니다. 텍스트를 직접 붙여넣어 주세요." 안내 후 AskUserQuestion으로 텍스트 입력 요청.
3. 성공 시: 원본 URL을 `source`로 기록. Step 4로 진행.

### Step 3B: 로컬 파일 읽기

1. Read 도구로 파일을 읽는다.
   - PDF: `pages` 파라미터 활용. 20페이지 초과 시 분할 읽기 (1-20, 21-40, ...). 100페이지 초과 시 "대용량 PDF입니다. 특정 범위를 지정해주세요." 안내.
   - MD/HTML/TXT: 전체 읽기.
2. 파일 경로를 `source`로 기록. Step 4로 진행.

### Step 3C: 코드 분석

1. Glob으로 대상 디렉토리의 주요 파일을 탐색한다.
   - 패턴: `**/*.{js,ts,py,go,java,rs,rb,swift,kt}` 등
   - 제외: `node_modules`, `.git`, `vendor`, `dist`, `build` 하위
   - `package.json`, `go.mod`, `Cargo.toml` 등 프로젝트 파일도 포함
2. 핵심 파일을 Read로 읽는다 (최대 10개).
3. 디렉토리 경로를 `source`로 기록. Step 4로 진행.

### Step 3D: 텍스트 직접 입력

사용자가 입력한 텍스트를 그대로 콘텐츠로 사용. `source`는 `"direct-input"`. Step 4로 진행.

### Step 4: 주제/카테고리 결정

콘텐츠를 분석하여 주제명과 카테고리를 자동 추출한 뒤, AskUserQuestion으로 확인한다.

**카테고리 예시** (사용자가 자유롭게 지정 가능):
- `programming`, `architecture`, `devops`, `database`, `ai-ml`, `security`, `general`

**질문 형식**:
```
주제명: <자동 추출된 주제명>
카테고리: <자동 추출된 카테고리>

이대로 진행할까요? 수정이 필요하면 알려주세요.
```

### Step 5: 학습 노트 생성

콘텐츠를 아래 형식의 학습 노트로 변환한다.

**퀴즈 문항 형식**: `@reference/quiz-schema.md`의 형식을 **정확히** 따른다.

**노트 구조**:

```markdown
---
created: {YYYY-MM-DD}
source: "{원본 URL 또는 파일 경로}"
source_type: "{url|pdf|md|html|code|direct}"
topic: "{주제명}"
category: "{카테고리}"
tags:
  - study
  - {카테고리}
quiz_ready: true
mastery: 0
quiz_count: 0
total_questions: {생성된 문항 수}
correct_count: 0
last_quiz_date: ""
---

# {주제명}

## 핵심 요약

{원본 콘텐츠에서 핵심 내용을 3-5문장으로 요약}

## 주요 개념

### {개념 1 제목}

{개념 설명. 필요시 코드 블록, 도표 포함}

### {개념 2 제목}

{개념 설명}

... (콘텐츠 분량에 따라 3-10개 개념)

## 퀴즈

> [!quiz]- Q1: {질문}
> - A) {선택지}
> - B) {선택지}
> - C) {선택지}
> - D) {선택지}
> **정답**: {정답 알파벳}
> **해설**: {왜 이것이 정답인지 설명}

> [!quiz]- Q2: {질문}
> ...

... (핵심 개념당 1-2문항, 총 5-15문항)

## 원본 참고

- 출처: {source}
- 생성일: {created}
```

**퀴즈 문항 작성 규칙**:
- 단순 암기가 아닌 이해도를 측정하는 문항
- 오답 선택지도 그럴듯하게 구성 (오개념 반영)
- 해설에 왜 다른 선택지가 틀렸는지도 간략히 포함
- `> [!quiz]-` callout 형식 사용 (Obsidian에서 접기 가능)

### Step 6: Obsidian vault에 저장

Obsidian CLI로 학습 노트를 vault에 저장한다.

```bash
obsidian vault="<vault>" create name="<주제명>" path="<study_base_path>/<카테고리>" content="<학습 노트 전체>"
```

- content 이스케이프: 줄바꿈은 `\n`, YAML frontmatter의 `---`도 content 문자열에 포함
- 파일명에 사용 불가한 문자(`/`, `\`, `:` 등)는 제거 또는 대체

### Step 7: 대시보드 갱신 (스크립트)

Python 스크립트로 전체 노트를 스캔하여 대시보드를 재생성한다.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/scan_notes.py" "<vault>" "<study_base_path>" \
  | python3 "${CLAUDE_PLUGIN_ROOT}/scripts/gen_dashboard.py" > /tmp/tutor-dashboard.md
```

생성된 대시보드를 vault에 저장:
```bash
obsidian vault="<vault>" create name="_dashboard" path="<study_base_path>" content="$(cat /tmp/tutor-dashboard.md)"
```

### Step 8: 완료 안내

```
학습 노트 생성 완료:
  주제: <주제명>
  카테고리: <카테고리>
  퀴즈 문항: <N>개
  저장 위치: <study_base_path>/<카테고리>/<주제명>.md

퀴즈를 시작하려면: /tutor:quiz <주제명>
```
