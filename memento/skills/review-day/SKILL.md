---
name: review-day
description: 하루 마감 의례. 오늘 Daily Note 회고 + 교훈 추출 + 로그 품질 검토 + 내일 업무 준비를 한 번에 수행. 사용자가 "하루 마감", "오늘 회고", "마무리", "오늘 끝내자", "wrap up", "퇴근", "day-end", "review today"를 언급할 때 트리거. 저녁/퇴근 시점 하루 레벨 의례(작업 완료 정리는 checkpoint, 진행 중 상태 저장은 handoff).
user_invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# 하루 마감 의례 (review-day)

오늘을 매듭짓고 내일로 넘긴다. 두 구간으로 구성:

1. **오늘 Daily Note 회고** - 완료/미완료 분류, 미완료 처리, 비일일노트 정리, Review 섹션 작성 + 교훈 추출 + 로그 품질 검토
2. **내일 업무 준비** - `planning` skill을 `tomorrow --orchestrated`로 호출하여 내일 Daily Note Plan 초안 생성

**다른 스킬과 구분**: 작업 완료 정리는 `checkpoint`, 진행 중 상태 저장은 `handoff`. review-day는 저녁/퇴근 시점의 하루 레벨 의례다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `daily_archive_path`, `daily_archive_format`, `inbox_folder_path`, `file_title_format`, `display_name_ko`, `display_name_en`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**: 식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 2-3줄 블록으로 고정 (빈 값 필드 생략, 모든 필드 비면 블록 자체 생략).

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

### Step 3: 완료/미완료 분류 (v2.8.0)

Daily Note의 Tasks 섹션에서 wikilink 체크박스를 추출하고, 각 링크가 가리키는 todo 파일의 frontmatter `status`를 교차 확인하여 분류한다.

**체크박스 패턴**:
```
- [ ] [[<daily_notes_path>/{YYYY-MM-DD}/{slug}|{표시 이름}]]
- [x] [[...]]
```

**분류 축 2개**:

1. **Daily Note 체크 상태**: `- [x]` 또는 `- [ ]`
2. **todo 파일 frontmatter status**: `in-progress` / `resolved` / `blocked` / `open` / `dismissed`

교차 결과:

| 체크 | frontmatter | 해석 |
|------|-------------|------|
| `- [x]` | `resolved` | 완료 (일관) |
| `- [x]` | `in-progress` | 체크는 했으나 파일 미갱신 → 완료로 간주 + 파일 갱신 후보 |
| `- [ ]` | `in-progress` | 진행 중 → 미완료 분류 |
| `- [ ]` | `resolved` | 파일은 완료인데 체크 누락 → 완료로 간주 + 체크 보정 |
| `- [ ]` | `blocked` | 차단 대기 → 미완료 분류 (이유 메모) |
| `- [ ]` | `dismissed` | 철회 → "삭제" 후보로 분류 |

각 항목의 소속 track 헤더(`## [track:{id}]`)도 기록한다. legacy 포맷(wikilink 없는 평문 체크박스)은 그대로 `- [ ]` / `- [x]`로 분류하되 파일 이동 단계에서는 스킵한다.

### Step 4: 완료 요약

완료된 항목을 요약하여 출력한다:

```
오늘 완료한 일:
- [프로젝트] 작업 내용
- [영역] 작업 내용
총 N건 완료
```

### Step 5: 미완료 항목 처리 (v2.8.0)

미완료 항목이 있으면 각 항목에 대해 AskUserQuestion으로 묻는다:

| 선택지 | 처리 |
|--------|------|
| **내일 이어서** | todo 파일을 `<inbox_folder_path>/{TOMORROW}/{slug}.md`로 `git mv` + frontmatter `status: open` (started_at 유지). Daily Note 체크박스는 그대로. 내일 `planning` skill이 Inbox에서 재수집 |
| **백로그로 보관** | todo 파일을 `<inbox_folder_path>/{TODAY}/{slug}.md`로 `git mv` + frontmatter `status: open` (started_at 유지, priority는 medium으로 하향 옵션) |
| **완료 처리** | todo 파일을 `<daily_archive_path>/{YYYY}/{MM}/{TODAY}/{slug}.md`로 `git mv` + frontmatter `status: resolved` + `resolved_at: {TODAY}`. Daily Note 체크박스 `- [x]`로 갱신 |
| **삭제** | todo 파일을 `99 Archives/dismissed/{TODAY}/{slug}.md`로 `git mv` + frontmatter `status: dismissed`. Daily Note 체크박스 제거 |

여러 항목을 한 번에 처리할 수 있도록 번호+행동 형식 지원:
- "1,2 내일" / "3 백로그" / "4 삭제"

**`- [x]` 완료 항목**: Step 3 교차 결과에서 체크만 된 것(파일 status: in-progress)은 "완료 처리"로 자동 분류하되 사용자 확인 한 질문으로 일괄 승인. "완료 처리"와 동일한 이동/갱신 수행.

**legacy 평문 체크박스**: 파일 없는 legacy 항목은 파일 이동 없이 Daily Note 체크박스만 갱신 (`- [x]`) 또는 유지. 이후 순수 텍스트로 남음.

### Step 6: Daily Notes 비일일노트 정리

오늘 날짜로 resolve된 `daily_notes_path` 폴더(예: `01 Working/`)에서 비일일노트를 찾아 vault 분류 규칙에 따라 분류한다.

#### 비일일노트 탐색

오늘 날짜로 resolve된 `daily_notes_path` 폴더를 스캔하여 일일 노트가 아닌 파일을 찾는다:
- 일일 노트 패턴: `{daily_note_format}` (config.md 기본값: `{YYYY}-{MM}-{DD}-planning.md`, 예: `2026-04-09-planning.md`)
- 해당 폴더의 모든 `.md` 파일 중 위 패턴에 맞지 않는 파일 = 비일일노트

비일일노트가 없으면 이 Step을 조용히 건너뛴다.

#### 분류 제안

각 비일일노트의 frontmatter(tags, category, project 등)를 읽고,
vault 루트 `CLAUDE.md`의 분류 규칙을 참조하여 이동 대상 폴더를 제안한다.
vault 루트에 `CLAUDE.md`가 없거나 규칙이 정의되지 않은 경우, 아래 테이블을 기본 규칙으로 사용하되 AskUserQuestion으로 분류를 확인한다.

| frontmatter 힌트 | 분류 | 이동 대상 |
|-------------------|------|----------|
| tags: meeting OR project: {name} | 업무 운영 이슈 | 업무 도메인 폴더 (예: `30 Imagoworks/{제품}/`) |
| category: report OR tags: report | 실행 미결정 제안 | `{inbox_folder_path}` (예: `00 Inbox/`) |
| tags: research, tooling | 범용 리서치 | Knowledge 폴더 (예: `11 Knowledge/02 Engineering/`) 또는 `99 Archives/` (완결/참조 빈도 낮음) |
| source_project 있음 | 프로젝트 산출물 | 해당 도메인 폴더 (예: `50 Dev Life/{name}/` 또는 `30 Imagoworks/{제품}/`) |
| 판단 불가 | 사용자에게 질문 | AskUserQuestion |

업무/개인 구분: 업무 관련 → 업무 도메인(예: `30 Imagoworks/`) 하위. 개인/사이드 프로젝트 → 개인 도메인(예: `50 Dev Life/`) 직접 배치.

#### 확인

AskUserQuestion으로 분류 제안을 한 번에 보여준다:

```
Daily Notes에 정리할 파일이 N개 있습니다:

1. `2026-04-09-hub-404-미팅.md`
   → 30 Imagoworks/33 Dentbird Console/
2. `2026-04-09-report-pricing-개선.md`
   → 00 Inbox/

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
- **배운 것/발견**: 세션 대화에서 추출한 교훈/발견/인사이트. 없으면 빈칸으로 두되 억지로 채우지 않음
  - **넣을 것**: 재사용 가능한 판단 원칙, 프로세스 개선, 사고 프레임 전환
  - **넣지 않을 것**: API 레퍼런스 메모, 도구 사용법, 일회성 기술 디테일 (-> 코드 주석 또는 Knowledge 폴더)
  - 한 세션당 1-3개. 간결하게 한 줄씩
- **로그 품질 검토**: 오늘 Daily Note Log와 raw 로그를 훑어보고, 너무 사소한 기록은 없었는지 검토. 기록 기준을 지속적으로 개량하기 위한 메타 피드백
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

### Step 8: Daily Note + todo 파일 일괄 갱신 (v2.8.0)

Step 5에서 결정된 처리(내일 이어서 / 백로그 / 완료 / 삭제)를 일괄 실행한다.

1. **todo 파일 이동 실행**: 각 항목의 결정에 따라 `git mv` + frontmatter 업데이트.
   - `git mv` 실패 시(예: todo 파일이 실제로는 존재하지 않는 legacy 항목): 파일 이동은 스킵하고 Daily Note 체크박스만 갱신
   - Inbox 대상 폴더(`{TOMORROW}/` 또는 `{TODAY}/`) 없으면 `mkdir -p` 선행
2. **Daily Note Tasks 체크박스 갱신**:
   - 완료: `- [ ]` → `- [x]`
   - 삭제: 줄 제거
   - 내일 이어서/백로그: 그대로 (wikilink는 이전 경로 기준이지만 source 필드에서 참조 가능)
3. **Review 섹션 갱신**: Step 7에서 작성한 Review 전문을 Edit으로 반영
4. 전체 처리 결과를 카운트 (완료 N, 내일 이어서 M, 백로그 K, 삭제 L)

갱신 완료 후 내부 컨텍스트에 "today_daily_updated=<경로>", "todos_moved=[<경로 목록>]"로 보관. 최종 보고는 Step 10에서 합쳐서 출력한다.

### Step 8.5: Decision 아카이브 배치 제안 (v2.9.0)

`{MEMENTO_HOME}/user/decisions/` 의 결정 파일 중 오늘 기준으로 생애가 끝난 것을 감지하고 `archive/` 하위로 배치 제안한다. Phase C의 세 번째 접점(안전망).

1. **스캔 대상**: `{MEMENTO_HOME}/user/decisions/*.md` (archive/ 제외). frontmatter를 파싱하여 다음 중 하나라도 충족하면 아카이브 후보:
   - `revoked: true`
   - `expires` 값이 오늘보다 과거
   - `expired: true`
2. **후보 0건**: 조용히 Step 9로 진행.
3. **후보 1건 이상**: 표로 나열 후 AskUserQuestion:
   ```
   다음 결정 파일을 archive/로 이동할까요?
   - {filename} — {사유: revoked / expired (exp {expires}) / expired-flag}
   ...

   1. 전부 이동 [Recommended]
   2. 개별 선택
   3. 건너뛰기
   ```
4. **이동 실행**:
   - 대상 경로: `{MEMENTO_HOME}/user/decisions/archive/{filename}`
   - 디렉토리 없으면 `mkdir -p`
   - `git mv`로 이동 (git 관리 vault 한정). git 관리 외면 `mv`
   - 이동된 각 파일 frontmatter에 `archived: {오늘 날짜}` 1줄 추가 (이미 있으면 덮어쓰기)
5. **요약**: "Decision archive 배치: N건 이동 (→ archive/)" 내부 컨텍스트에 저장. Step 10 최종 요약에 포함.

**원칙**:
- 자동 이동 금지 — 반드시 사용자 확인
- active-reminders 파일은 대상 아님 (별도 관리)
- `archived` 필드가 이미 있는 파일은 이중 제안 금지 (스캔 단계에서 배제)

### Step 8.6: Inbox 완료 역동기화 (v2.11.0)

Inbox에 `status: open`으로 남아 있는 항목 중 **이미 다른 경로로 해결된 것**을 탐지한다. feature 통합·rename·스코프 흡수로 해결됐으나 원본 Inbox가 닫히지 않은 "ghost open" 방지.

1. `Skill memento:inbox-sweep --orchestrated` 호출
2. 반환 블록(`[inbox-sweep/orchestrated]`)에서 `candidates` 수 파싱
3. 처리:
   - `candidates=0`: 조용히 Step 9로 진행
   - `candidates ≥ 1`: AskUserQuestion 한 줄
     ```
     Inbox 완료 후보 N건 발견 (상위: <파일명>, ...). 지금 확인할까요?
     ```
     선택지: `지금 확인` / `나중에 (다음 sweep에서 재후보)` / `주간 회고에서 일괄`
4. `지금 확인` 선택 시 `Skill memento:inbox-sweep` 대화형 모드로 재호출
5. 결과를 내부 컨텍스트에 보관 → Step 10 최종 요약에 포함 ("Inbox 완료 처리: N건" 라인)

**원칙**:
- orchestrated 단계는 상호작용 없음 (데이터만 수집)
- 사용자 확인은 한 번 (Step 8.6의 질문) → 대화형 재호출 → 각 후보별 per-item 질문
- 자동 resolve 금지

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

**건너뛰기 조건**: 내일 Daily Note에 이미 Plan 섹션이 충분히 채워져 있으면 planning이 자체 판단으로 조용히 건너뛸 수 있다 (planning skill의 orchestrated 모드 정의 참조).

### Step 9.5: 캘린더 동기화 + WORKING.md 최종 갱신

1. **캘린더 동기화**: 오늘 일정 중 Daily Note Log에 미반영 항목이 있으면 추가 (checkpoint에서 이미 반영했을 수 있지만 최종 보완)
2. **WORKING.md 최종 갱신**: 미완료 처리 결과를 반영하여 "내일 첫 세션이 바로 시작 가능"한 상태로 정리
   - 내일로 이월되는 항목 반영
   - 완료 항목 제거 (오늘 checkpoint에서 미처리된 것 포함)
   - 참조 파일 업데이트

### Step 10: 최종 마감 요약

두 구간의 결과를 한 블록으로 출력한다:

```
하루 마감 완료:
  [1/2] 오늘 회고:
    - 완료 처리: N건
    - 내일 이월: N건
    - 백로그 보관: N건
    - 비일일노트 이동: N건
    - Decision archive 배치: N건 (해당 시)
    - Inbox 완료 처리: N건 (해당 시)
    - Review 섹션: 갱신됨
  [2/2] 내일 준비: N건 후보 선정, 내일 Daily Note Plan 초안 작성됨

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

현재는 review-day 자체가 최상위 의례이므로 이 모드가 바로 트리거되는 경우는 드물다. 다만 발화 파싱 시 `--orchestrated`를 인식해두면 미래 확장에 안전하다.

## 원칙

- 미완료 항목을 빠짐없이 처리 (여러 항목 한 번에 처리 가능하게)
- Review 초안을 제안하여 작성 부담 감소. 전문을 AskUserQuestion에 포함하여 확인
- Review 항목에 맥락(왜/결과)을 한 줄로 추가
- "배운 것"은 재사용 가능한 판단 원칙/프레임 전환 중심
- 이월 항목은 그대로 두어 planning에서 수집
- 작업 완료 정리는 `checkpoint`, 진행 중 저장은 `handoff`
- Step 9에서 planning tomorrow로 내일 준비 위임
- CLAUDE.md PARA 규칙 참조하여 비일일노트 분류 (frontmatter 기반)
- **내부 Task ID 축약 단독 사용 금지**: Review 초안·배운 것·보고서에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9` 같은 축약을 한 문서 내 첫 출현 시 풀어쓰거나 괄호 병기(`Checkpoint 1(CP1)`). 이후 반복은 단독 허용. 상세: 저장소 CLAUDE.md.
