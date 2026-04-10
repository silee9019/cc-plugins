---
description: 하루 마감 회고. 오늘 Daily Note의 완료/미완료 항목을 분류하고, 미완료 항목을 처리하며, 맥락이 담긴 Review 섹션을 작성.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# 하루 마감 회고 (review-today)

오늘의 Daily Note를 정리하고, 미완료 항목을 처리하며, Review 섹션을 작성한다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path`, `file_title_format` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

### Step 1.5: Active Reminders 주입

`~/.claude/plugins/data/silee-planner-cc-plugins/active-reminders.md` 존재 여부 확인.

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | 조용히 건너뛰기 |
| 파일 있음 + `expires_at` >= 오늘 | 본문을 읽어 "## Active Reminders" 헤딩과 함께 컨텍스트 프리앰블로 출력. Step 6 Review 작성 시 "Reminders에 비춰 오늘 어땠는가" 한 줄 체크포인트 포함 |
| 파일 있음 + `expires_at` < 오늘 | "⚠ Active reminders 만료 ({expires_at})" 1줄 경고 후 주입 생략 |

### Step 2: 오늘 Daily Note 읽기

1. 오늘 날짜로 Daily Note 경로를 생성한다.
2. Obsidian vault 경로를 파악하여 파일을 직접 읽는다 (Read 도구 사용).

**Daily Note가 없는 경우**: "오늘 Daily Note가 없습니다." 안내 후 중단.

### Step 3: 완료/미완료 분류

Daily Note의 Tasks 섹션에서 항목을 분류한다:

- **완료**: `- [x]` 항목
- **미완료**: `- [ ]` 항목

각 항목의 소속 섹션(Projects/Areas/Inbox)도 기록한다.

### Step 4: 완료 요약

완료된 항목을 요약하여 출력한다:

```
오늘 완료한 일:
- [프로젝트] 작업 내용
- [영역] 작업 내용
총 N건 완료
```

### Step 5: 미완료 항목 처리

미완료 항목이 있으면 각 항목에 대해 AskUserQuestion으로 묻는다:

| 선택지 | 처리 |
|--------|------|
| **내일 이어서** | 그대로 둠. 내일 `/plan-today`에서 자동 수집됨 |
| **백로그로 보관** | Issue Box에 보관 (capture-task Step A-4의 백로그 보관 절차 사용) |
| **완료 처리** | `- [x]`로 변경 |
| **삭제** | 항목 제거 |

여러 항목을 한 번에 처리할 수 있도록 번호+행동 형식 지원:
- "1,2 내일" / "3 백로그" / "4 삭제"

### Step 6: Daily Notes 비일일노트 정리

오늘 날짜로 resolve된 `daily_notes_path` 폴더(예: `01 Daily Notes/2026/04/`)에서 비일일노트를 찾아 PARA 규칙에 따라 분류한다.

#### 비일일노트 탐색

오늘 날짜로 resolve된 `daily_notes_path` 폴더를 스캔하여 일일 노트가 아닌 파일을 찾는다:
- 일일 노트 패턴: `{daily_note_format}.md` (예: `2026-04-09.md`)
- 해당 폴더의 모든 `.md` 파일 중 위 패턴에 맞지 않는 파일 = 비일일노트

비일일노트가 없으면 이 Step을 조용히 건너뛴다.

#### 분류 제안

각 비일일노트의 frontmatter(tags, category, project 등)를 읽고,
vault 루트 `CLAUDE.md`의 PARA 분류 규칙을 참조하여 이동 대상 폴더를 제안한다.
vault 루트에 `CLAUDE.md`가 없거나 PARA 규칙이 정의되지 않은 경우, 아래 테이블을 기본 규칙으로 사용하되 AskUserQuestion으로 분류를 확인한다.

| frontmatter 힌트 | 분류 | 이동 대상 |
|-------------------|------|----------|
| tags: meeting OR project: {name} | 업무 운영 이슈 | `20 Areas/Imagoworks/{제품명}/` |
| category: report OR tags: report | 실행 미결정 제안 | `00 Issue Box/00-inbox/` |
| tags: research, tooling | 범용 리서치 | `30 Resources/` (활발히 참조) 또는 `80 Archives/` (완결/참조 빈도 낮음) |
| source_project 있음 | 프로젝트 산출물 | `10 Projects/` 하위 |
| 판단 불가 | 사용자에게 질문 | AskUserQuestion |

Imagoworks 하위 여부: 업무 관련 → `Imagoworks/` 중간 폴더 사용. 개인/사이드 프로젝트 → 직접 배치.

#### 확인

AskUserQuestion으로 분류 제안을 한 번에 보여준다:

```
Daily Notes에 정리할 파일이 N개 있습니다:

1. `2026-04-09-hub-404-미팅.md`
   → 20 Areas/Imagoworks/dentbird-console/
2. `2026-04-09-report-pricing-개선.md`
   → 00 Issue Box/00-inbox/

이대로 이동할까요?
```

선택지: "이대로" / "수정" / "건너뛰기"

#### 파일 이동

확인 후 Bash(mv)로 파일을 이동한다.
- 대상 폴더가 없으면 생성
- 이동 결과를 출력

### Step 7: Review 섹션 작성

완료/미완료 분류 결과와 세션 대화 컨텍스트를 바탕으로 **맥락이 담긴** Review 섹션 초안을 작성한다.

#### Review 작성 원칙
- **완료 항목**: 무엇을 했는지 + 왜 했는지/결과가 뭔지 한 줄 맥락 추가
- **미완료 항목**: 무엇이 남았는지 + 왜 못했는지/다음 단계가 뭔지 한 줄 맥락 추가
- **배운 것/발견**: 단순 수행 사실 나열이 아닌, 세션 대화에서 추출한 교훈/발견/인사이트 작성. 없으면 빈칸으로 두되 억지로 채우지 않음
- **Reminder 체크포인트**: Step 1.5에서 Active Reminders가 주입되었다면, Review 말미에 "Reminders 점검" 한 줄 추가. 각 reminder가 오늘 작동했는지/놓쳤는지 한 줄로 기록 (억지 X, 근거 있을 때만)

#### Review 템플릿

```markdown
## Review
> 하루 마감 시 작성

### 완료
- {섹션}: {작업 내용}. {한 줄 맥락 - 왜 했는지, 결과가 뭔지, 후속 상태}

### 미완료 → 내일로
- {작업}: {왜 못했는지 또는 다음 단계가 뭔지}

### 배운 것 / 발견
- {교훈/발견/인사이트}

### Reminders 점검 (선택)
- {reminder 슬로건}: {작동/놓침 + 근거 한 줄}
```

#### 확인

AskUserQuestion으로 Review **전문(full text)**을 보여주고 확인받는다:
- "이대로" → Step 8
- 수정 내용 입력 → 반영 후 Step 8

### Step 8: Daily Note 갱신

1. 미완료 항목 처리 결과를 반영한다 (완료 체크, 삭제 등).
2. Review 섹션을 갱신한다.
3. Edit 도구로 Daily Note를 업데이트한다.

갱신 완료 후 "Daily Note 마감 완료: {파일 경로}" 출력.

## Do / Don't

| Do | Don't |
|----|-------|
| 미완료 항목을 빠짐없이 처리 | 미완료 항목을 무시하고 Review만 작성 |
| 여러 항목을 한 번에 처리 가능하게 | 항목마다 개별 질문으로 시간 소모 |
| Review 초안을 제안하여 작성 부담 감소 | 사용자에게 Review를 처음부터 작성하게 |
| Review 항목에 맥락(왜/결과)을 한 줄로 추가 | 완료/미완료를 단순 나열만 |
| Review 전문을 AskUserQuestion에 포함하여 확인 | 요약만 보여주고 확인 |
| "배운 것"은 교훈/발견 중심으로 작성 | 수행한 작업을 다시 나열 |
| 백로그 보관 시 간소화된 보고서 사용 | 전체 세션 스캔 워크플로우 반복 |
| 이월 항목은 그대로 두어 plan-today에서 수집 | 이월 항목을 별도 파일로 분리 |
| 작업 중 즉시 완료는 `/silee-planner:finish-task` 사용 | review-today로 개별 작업 완료 처리 |
| CLAUDE.md 분류 규칙 참조하여 비일일노트 분류 | 분류 규칙을 스킬 내에 하드코딩 |
| frontmatter 기반 자동 분류 제안 | 파일명만으로 판단 |
| 비일일노트 없으면 조용히 건너뛰기 | "비일일노트가 없습니다" 출력으로 노이즈 |
| 분류 제안을 한 번에 전체 목록으로 확인 | 파일마다 개별 질문 |
