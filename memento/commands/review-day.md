---
description: 하루 마감 의례. 누락 checkpoint 자동 실행 + 오늘 Daily Note 회고 + 내일 업무 준비를 한 번에 수행.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Skill
argument-hint: (없음)
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# 하루 마감 의례 (review-day)

오늘을 매듭짓고 내일로 넘긴다. 세 구간으로 구성:

1. **누락 checkpoint 실행** — 아직 raw 로그에 기록되지 않은 최근 작업을 `/memento:checkpoint --orchestrated`로 먼저 저장
2. **오늘 Daily Note 회고** — 완료/미완료 분류, 미완료 처리, 비일일노트 정리, Review 섹션 작성
3. **내일 업무 준비** — `/memento:planning tomorrow --orchestrated`로 내일 Daily Note Plan 초안 생성

**트리거 키워드**: "하루 마감", "오늘 회고", "마무리", "오늘 끝내자", "wrap up", "퇴근", "day-end", "review today"

**작업 단위 레벨 정리와 구분**: 주제 전환/잠깐 저장은 `/memento:checkpoint`를 사용한다. review-day는 저녁/퇴근 시점의 하루 레벨 의례다.

## 워크플로우

### Step 0: 누락 checkpoint 감지 및 실행

설정 로드(Step 1) 직전에 수행한다. 세션 중 작업은 있었는데 raw 로그/Daily Note Log에 아직 반영되지 않았을 가능성을 해소한다.

1. **project-id 계산** (session-start.sh 동일 로직):
   ```sh
   PROJECT_ID=$(
     REMOTE=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/' | tr '/' '-' | tr '[:upper:]' '[:lower:]')
     if [ -n "$REMOTE" ]; then
       printf '%s' "$REMOTE"
     else
       git rev-parse --show-toplevel 2>/dev/null | tr '/' '-' | tr '[:upper:]' '[:lower:]'
     fi
   )
   ```

2. **오늘 raw 로그 확인**:
   - 경로: `<memento_home>/projects/<PROJECT_ID>/memory/{YYYY-MM-DD}.md`
   - 파일이 없거나, 마지막 `## [checkpoint: ...]` 항목의 HH:MM이 현재 시각보다 오래 전(예: 30분 이상 gap)
   - 세션 컨텍스트(최근 대화 흐름, Edit/Write 호출 흔적, git status)와 비교해 반영되지 않은 작업 존재

3. **gap 판정**:

   | 조건 | 처리 |
   |------|------|
   | raw 로그 없음 + 세션 중 작업 흔적 있음 | **gap 있음** → checkpoint 호출 |
   | raw 로그 있음 + 마지막 항목 이후 Edit/Write 도구 호출 있음 | **gap 있음** → checkpoint 호출 |
   | raw 로그 마지막 항목이 세션 전체 맥락을 포괄 | **gap 없음** → 건너뛰기 |

4. **gap 있으면 `Skill memento:checkpoint` 호출**:
   - 인자: `--orchestrated` (모호 항목 인터뷰 최소화 + 종료 모드 고정)
   - 호출 결과 요약(`[checkpoint/orchestrated]` 블록)을 내부 컨텍스트에 보관 → Step 10 최종 요약에 포함

5. **gap 없음이면** 조용히 Step 1로 진행.

### Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path`, `file_title_format`, `display_name_ko`, `display_name_en`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**:

식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 2-3줄 블록으로 고정:

```
사용자 식별:
- 표시 이름: "<DISPLAY_KO>" / "<DISPLAY_EN>" (이니셜: <INITIALS>, 닉네임: <NICKNAME>)
- 아이디: <USER_ID> (aliases: <ALIASES>)
- 이메일: <EMAIL>
- Jira accountId: <ATLASSIAN_AID>

Review 분류/해석 시 "나"/"내가"/"본인"은 이 사용자를 가리킨다.
```

빈 값 필드는 괄호/줄 생략. 모든 식별 필드가 빈 값이면 블록 자체 생략.

### Step 1.5: Active Reminders 주입

`<vault_path>/<memento_root>/user/active-reminders.md` 존재 여부 확인.

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

갱신 완료 후 내부 컨텍스트에 "today_daily_updated=<경로>"로 보관. 최종 보고는 Step 10에서 합쳐서 출력한다.

### Step 9: 내일 업무 준비

오늘 Review가 확정되면 내일을 준비한다. 직접 로직을 갖지 않고 `planning`을 내일 모드로 위임한다.

1. **`Skill memento:planning tomorrow --orchestrated` 호출**:
   - `tomorrow` 인자: 기준 날짜를 내일(다음 영업일 기준 아님 — 단순 +1일)로 오버라이드
   - `--orchestrated` 플래그: 오케스트레이션 모드로 질문 최소화 (모호 항목은 기본값/건너뛰기)
2. **planning이 수행하는 것**:
   - 내일 Daily Note 경로 계산 (없으면 생성)
   - Active Reminders 주입(있을 때)
   - in-progress/inbox/오늘 미완료 이월 항목을 후보로 선별
   - 내일 Daily Note의 Plan 섹션에 초안 작성
3. **호출 결과 요약**을 내부 컨텍스트에 보관 → Step 10 최종 요약에 포함

**건너뛰기 조건**: 내일 Daily Note에 이미 Plan 섹션이 충분히 채워져 있으면 planning이 자체 판단으로 조용히 건너뛸 수 있다 (planning.md의 orchestrated 모드 정의 참조).

### Step 10: 최종 마감 요약

세 구간의 결과를 한 블록으로 출력한다:

```
하루 마감 완료:
  [1/3] checkpoint: N건 기록 (누락 {있음|없음})
  [2/3] 오늘 회고:
    - 완료 처리: N건
    - 내일 이월: N건
    - 백로그 보관: N건
    - 비일일노트 이동: N건
    - Review 섹션: 갱신됨
  [3/3] 내일 준비: N건 후보 선정, 내일 Daily Note Plan 초안 작성됨

참고 파일:
  - @{오늘 Daily Note 경로}
  - @{내일 Daily Note 경로}
  - @{raw 로그 경로}
```

**미팅/캘린더 안내**: Step 0에서 checkpoint가 실행되었으면 미팅 동기화도 이미 수행됨. 별도 처리 불필요.

## 오케스트레이션 모드 참고

review-day가 상위에서 직접 호출된 경우가 아닌, 외부 오케스트레이터가 review-day를 `--orchestrated`로 호출할 수도 있다. 그런 경우:
- Step 5/7 AskUserQuestion을 최소화 (모호 항목은 "내일 이어서"로 기본 처리)
- Step 6 비일일노트 분류는 확정 분류만 적용, 모호한 건 건너뜀
- 최종 보고는 Step 10 블록 그대로 상위에 반환

현재는 review-day 자체가 최상위 의례이므로 이 모드가 바로 트리거되는 경우는 드물다. 다만 인자 파싱 시 `--orchestrated`를 인식해두면 미래 확장에 안전하다.

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
| 작업 단위 정리/즉시 완료는 `/memento:checkpoint` 사용 | review-day로 개별 작업 완료 처리 |
| Step 0에서 누락 checkpoint를 먼저 실행 | checkpoint 없이 바로 회고 진입 |
| Step 9에서 planning tomorrow로 내일 준비 위임 | review-day 안에 내일 계획 로직 중복 구현 |
| CLAUDE.md 분류 규칙 참조하여 비일일노트 분류 | 분류 규칙을 스킬 내에 하드코딩 |
| frontmatter 기반 자동 분류 제안 | 파일명만으로 판단 |
| 비일일노트 없으면 조용히 건너뛰기 | "비일일노트가 없습니다" 출력으로 노이즈 |
| 분류 제안을 한 번에 전체 목록으로 확인 | 파일마다 개별 질문 |
