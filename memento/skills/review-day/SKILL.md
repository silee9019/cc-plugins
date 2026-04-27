---
name: review-day
description: 하루 마감 의례. 오늘 Focus Today 완료/미완료 분류 + 파일 이동 + 비일일노트 정리 + 내일 업무 준비를 한 번에 수행. 저녁/퇴근 시점 하루 레벨 의례(작업 완료 정리는 checkpoint, 진행 중 상태 저장은 handoff).
when_to_use: 사용자가 "하루 마감", "오늘 회고", "마무리", "오늘 끝내자", "wrap up", "퇴근", "day-end", "review today"를 언급할 때 트리거.
user-invocable: true
---

> **인터뷰 원칙**: 결정에 필요한 정보를 자체 도구로 최대한 수집한 후, 여전히 모호한 지점이 있으면 가정하지 말 것. `AskUserQuestion`으로 한 번에 하나의 질문만 하고, 답을 받은 직후 다음 단계로 진행한다. 여러 결정을 일괄 처리하지 않는다.

# 하루 마감 의례 (review-day)

오늘을 매듭짓고 내일로 넘긴다. 두 구간으로 구성:

1. **오늘 Focus Today 마감** - 완료/미완료 분류, 미완료 처리, 비일일노트 정리
2. **내일 업무 준비** - `planning` skill을 `tomorrow --orchestrated`로 호출하여 내일 Focus Today 초안 생성

**Review 섹션 자동 생성은 v2.16.0부터 폐지**. Focus Today는 v2.16.1부터 `# 오늘 꼭(Focus)` 단일 섹션 (legacy 두 섹션 자연 마이그레이션). 회고가 필요한 사용자는 `10 Reflection/` 하위에 별도 파일로 직접 작성한다.

**다른 스킬과 구분**: 작업 완료 정리는 `checkpoint`, 진행 중 상태 저장은 `handoff`. review-day는 저녁/퇴근 시점의 하루 레벨 의례다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/memento-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault_path`, `daily_notes_path`, `daily_note_format`, `daily_archive_path`, `daily_archive_format`, `inbox_folder_path`, `file_title_format`, `display_name_ko`, `display_name_en`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/memento:setup`을 먼저 실행해주세요." 안내 후 중단 |

**사용자 식별 컨텍스트 주입**: 식별 필드 중 비어있지 않은 값이 있으면 내부 컨텍스트에 2-3줄 블록으로 고정.

### Step 2: Active Reminders 주입

`<vault_path>/<memento_root>/user/active-reminders.md` 존재 여부 확인.

| 케이스 | 처리 |
|--------|------|
| 파일 없음 | 조용히 건너뛰기 |
| 파일 있음 + `expires_at` >= 오늘 | 본문을 읽어 "## Active Reminders" 헤딩과 함께 컨텍스트 프리앰블로 출력 |
| 파일 있음 + `expires_at` < 오늘 | "⚠ Active reminders 만료 ({expires_at})" 1줄 경고 후 주입 생략 |

### Step 3: 오늘 Focus Today 읽기

1. 오늘 날짜로 Focus Today 경로를 생성한다 (`{daily_notes_path}/{daily_note_format}` → 기본값 `01 Working/{YYYY}-{MM}-{DD}-focus.md`).
2. Obsidian vault 경로를 파악하여 파일을 직접 읽는다.

**Focus Today가 없는 경우**: "오늘 Focus Today가 없습니다." 안내 후 중단.

### Step 4: 완료/미완료 분류

Focus Today `# 오늘 꼭(Focus)` 섹션의 모든 체크박스를 추출한다 (모든 라인이 체크박스). wikilink가 있는 항목은 가리키는 todo 파일 frontmatter `status`를 교차 확인하여 분류; wikilink 없이 아이콘 prefix만 있는 정보성 체크박스(`- [ ] ⚠ ...`, `- [ ] ⏰ ...`)는 todo 파일 이동 대상이 아니라 체크 상태만 갱신한다. legacy(평면 불릿 또는 두 섹션 `# 오늘 꼭` + `# 오늘 집중`) 파일도 합산해 동일 처리.

**체크박스 패턴**:
```
- [ ] [[<daily_notes_path>/{YYYY-MM-DD}/{slug}|{표시 이름}]]
- [x] [[...]]
```

**분류 축 2개**:

1. **Focus Today 체크 상태**: `- [x]` 또는 `- [ ]`
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

legacy 포맷(wikilink 없는 평문 체크박스)은 그대로 `- [ ]` / `- [x]`로 분류하되 파일 이동 단계에서는 스킵한다.

### Step 5: 완료 요약

완료된 항목을 요약하여 출력한다:

```
오늘 완료한 일:
- {제목 or 축약어 병기}
총 N건 완료
```

### Step 6: 미완료 항목 처리

미완료 항목이 있으면 각 항목에 대해 AskUserQuestion으로 묻는다:

| 선택지 | 처리 |
|--------|------|
| **내일 이어서** | todo 파일을 `<inbox_folder_path>/{TOMORROW}/{slug}.md`로 `git mv` + frontmatter `status: open` (started_at 유지). Focus Today 체크박스는 그대로. 내일 `planning`이 Inbox에서 재수집 |
| **백로그로 보관** | todo 파일을 `<inbox_folder_path>/{TODAY}/{slug}.md`로 `git mv` + frontmatter `status: open` (started_at 유지, priority는 medium으로 하향 옵션) |
| **완료 처리** | todo 파일을 `<daily_archive_path>/{YYYY}/{MM}/{TODAY}/{slug}.md`로 `git mv` + frontmatter `status: resolved` + `resolved_at: {TODAY}`. Focus Today 체크박스 `- [x]`로 갱신 |
| **삭제** | todo 파일을 `99 Archives/dismissed/{TODAY}/{slug}.md`로 `git mv` + frontmatter `status: dismissed`. Focus Today 체크박스 제거 |

여러 항목을 한 번에 처리할 수 있도록 번호+행동 형식 지원:
- "1,2 내일" / "3 백로그" / "4 삭제"

**`- [x]` 완료 항목**: Step 4 교차 결과에서 체크만 된 것(파일 status: in-progress)은 "완료 처리"로 자동 분류하되 사용자 확인 한 질문으로 일괄 승인.

**legacy 평문 체크박스**: 파일 없는 legacy 항목은 파일 이동 없이 Focus Today 체크박스만 갱신 (`- [x]`) 또는 유지.

### Step 7: Daily Notes 비일일노트 정리

오늘 날짜로 resolve된 `daily_notes_path` 폴더(예: `01 Working/`)에서 비일일노트를 찾아 vault 분류 규칙에 따라 분류한다.

#### 비일일노트 탐색

`daily_notes_path` 폴더를 스캔하여 일일 노트가 아닌 파일을 찾는다:
- 일일 노트 패턴: `{daily_note_format}` (config.md 기본값: `{YYYY}-{MM}-{DD}-focus.md`, 예: `2026-04-24-focus.md`). legacy 아카이브에 `*-planning.md`도 같이 존재할 수 있으나 이는 정리 대상 아님 (이미 archive에 있음).
- 해당 폴더의 모든 `.md` 파일 중 위 패턴에 맞지 않는 파일 = 비일일노트
- todo 파일이 저장되는 `{daily_notes_path}/{YYYY-MM-DD}/` 하위 폴더는 탐색 대상 아님

비일일노트가 없으면 이 Step을 조용히 건너뛴다.

#### 분류 제안

각 비일일노트의 frontmatter(tags, category, project 등)를 읽고, vault 루트 `CLAUDE.md`의 분류 규칙을 참조하여 이동 대상 폴더를 제안한다. 규칙이 없으면 아래 기본 테이블로 AskUserQuestion.

| frontmatter 힌트 | 분류 | 이동 대상 |
|-------------------|------|----------|
| tags: meeting OR project: {name} | 업무 운영 이슈 | 업무 도메인 폴더 (예: `30 Imagoworks/{제품}/`) |
| category: report OR tags: report | 실행 미결정 제안 | `{inbox_folder_path}` (예: `00 Inbox/`) |
| tags: research, tooling | 범용 리서치 | Knowledge 폴더 (예: `11 Knowledge/02 Engineering/`) 또는 `99 Archives/` |
| source_project 있음 | 프로젝트 산출물 | 해당 도메인 폴더 (예: `50 Dev Life/{name}/` 또는 `30 Imagoworks/{제품}/`) |
| 판단 불가 | 사용자에게 질문 | AskUserQuestion |

#### 확인

AskUserQuestion으로 분류 제안을 한 번에 보여준다. 선택지: "이대로" / "수정" / "건너뛰기".

#### 파일 이동

확인 후 Bash(mv)로 파일을 이동한다. 대상 폴더가 없으면 생성. 결과 출력.

### Step 8: Focus Today + todo 파일 일괄 갱신

Step 6에서 결정된 처리(내일 이어서 / 백로그 / 완료 / 삭제)를 일괄 실행한다.

1. **todo 파일 이동 실행**: 각 항목의 결정에 따라 `git mv` + frontmatter 업데이트.
   - `git mv` 실패 시(예: todo 파일이 실제로는 존재하지 않는 legacy 항목): 파일 이동은 스킵하고 Focus Today 체크박스만 갱신
   - Inbox 대상 폴더(`{TOMORROW}/` 또는 `{TODAY}/`) 없으면 `mkdir -p` 선행
2. **Focus Today 체크박스 갱신** (`# 오늘 꼭(Focus)` 단일 섹션, legacy 두 섹션 모두 해당):
   - 완료: `- [ ]` → `- [x]`
   - 삭제: 줄 제거
   - 내일 이어서/백로그: 그대로 (wikilink는 이전 경로 기준이지만 source 필드에서 참조 가능)
3. 전체 처리 결과를 카운트 (완료 N, 내일 이어서 M, 백로그 K, 삭제 L)

갱신 완료 후 내부 컨텍스트에 "today_focus_updated=<경로>", "todos_moved=[<경로 목록>]"로 보관. 최종 보고는 Step 13에서 합쳐서 출력.

### Step 9: Decision 아카이브 배치 제안

`{MEMENTO_HOME}/user/decisions/` 의 결정 파일 중 오늘 기준으로 생애가 끝난 것을 감지하고 `archive/` 하위로 배치 제안한다.

1. **스캔 대상**: `{MEMENTO_HOME}/user/decisions/*.md` (archive/ 제외). frontmatter를 파싱하여 다음 중 하나라도 충족하면 아카이브 후보:
   - `revoked: true`
   - `expires` 값이 오늘보다 과거
   - `expired: true`
2. **후보 0건**: 조용히 Step 11로 진행.
3. **후보 1건 이상**: 표로 나열 후 AskUserQuestion:
   ```
   다음 결정 파일을 archive/로 이동할까요?
   - {filename} — {사유: revoked / expired (exp {expires}) / expired-flag}

   1. 전부 이동 [Recommended]
   2. 개별 선택
   3. 건너뛰기
   ```
4. **이동 실행**:
   - 대상 경로: `{MEMENTO_HOME}/user/decisions/archive/{filename}`
   - 디렉토리 없으면 `mkdir -p`
   - `git mv` (git 관리 vault 한정). 관리 외면 `mv`
   - 이동된 각 파일 frontmatter에 `archived: {오늘 날짜}` 1줄 추가 (이미 있으면 덮어쓰기)
5. **요약**: "Decision archive 배치: N건 이동 (→ archive/)" 내부 컨텍스트에 저장. Step 13 최종 요약에 포함.

**원칙**:
- 자동 이동 금지 — 반드시 사용자 확인
- active-reminders 파일은 대상 아님
- `archived` 필드가 이미 있는 파일은 이중 제안 금지

### Step 10: Inbox 완료 역동기화

Inbox에 `status: open`으로 남아 있는 항목 중 **이미 다른 경로로 해결된 것**을 탐지한다.

1. `Skill` 도구를 `skill=memento:inbox-sweep`, `args=--orchestrated`로 호출
2. 반환 블록(`[inbox-sweep/orchestrated]`)에서 `candidates` 수 파싱
3. 처리:
   - `candidates=0`: 조용히 Step 11로 진행
   - `candidates ≥ 1`: AskUserQuestion 한 줄:
     ```
     Inbox 완료 후보 N건 발견 (상위: <파일명>, ...). 지금 확인할까요?
     ```
     선택지: `지금 확인` / `나중에 (다음 sweep에서 재후보)` / `주간 회고에서 일괄`
4. `지금 확인` 선택 시 `Skill` 도구를 `skill=memento:inbox-sweep` (인자 없음, 대화형)로 재호출
5. 결과를 내부 컨텍스트에 보관 → Step 13 최종 요약에 포함 ("Inbox 완료 처리: N건" 라인)

### Step 11: 내일 업무 준비

오늘 정리가 확정되면 내일을 준비한다. 직접 로직을 갖지 않고 `planning`을 내일 모드로 위임한다.

1. **`Skill` 도구 호출** (`skill=memento:planning`, `args=tomorrow --orchestrated`):
   - `tomorrow` 인자: 기준 날짜를 내일(+1일)로 오버라이드
   - `--orchestrated` 플래그: 질문 최소화
2. **planning이 수행하는 것**:
   - 내일 Focus Today 경로 계산 (없으면 생성)
   - Active Reminders 주입(있을 때)
   - in-progress/inbox/오늘 미완료 이월 항목을 후보로 선별
   - 내일 Focus Today의 "오늘 집중" 섹션에 초안 작성
3. **호출 결과 요약**을 내부 컨텍스트에 보관 → Step 13 최종 요약에 포함

**건너뛰기 조건**: 내일 Focus Today `# 오늘 꼭(Focus)`이 이미 충분히 채워져 있으면 planning이 자체 판단으로 조용히 건너뛸 수 있다.

### Step 12: WORKING.md 최종 갱신

1. **WORKING.md 최종 갱신**: 미완료 처리 결과를 반영하여 "내일 첫 세션이 바로 시작 가능"한 상태로 정리
   - 내일로 이월되는 항목 반영
   - 완료 항목 제거 (오늘 checkpoint에서 미처리된 것 포함)
   - 참조 파일 업데이트
2. **캘린더 동기화는 수행하지 않는다** — Focus Today에 Log 섹션 없음. 필요한 미팅 메모는 memento-core raw log(`memory/{YYYY-MM-DD}-log.md`)에 사용자 또는 checkpoint가 직접 반영한다.

### Step 13: 최종 마감 요약

두 구간의 결과를 한 블록으로 출력한다:

```
하루 마감 완료:
  [1/2] 오늘 정리:
    - 완료 처리: N건
    - 내일 이월: N건
    - 백로그 보관: N건
    - 비일일노트 이동: N건
    - Decision archive 배치: N건 (해당 시)
    - Inbox 완료 처리: N건 (해당 시)
  [2/2] 내일 준비: N건 후보 선정, 내일 Focus Today 초안 작성됨

참고 파일:
  - @{오늘 Focus Today 경로}
  - @{내일 Focus Today 경로}
  - @{raw 로그 경로}
```

**미팅/캘린더 안내**: review-day 진입 전에 `/memento:checkpoint`가 실행되었으면 raw log 동기화도 이미 수행됨.

## 오케스트레이션 모드 참고

외부 오케스트레이터가 review-day를 `--orchestrated`로 호출할 수 있다. 그런 경우:
- Step 6/7 AskUserQuestion을 최소화 (모호 항목은 "내일 이어서"로 기본 처리)
- Step 7 비일일노트 분류는 확정 분류만 적용, 모호한 건 건너뜀
- 최종 보고는 Step 13 블록 그대로 상위에 반환

## 원칙

- 미완료 항목을 빠짐없이 처리 (여러 항목 한 번에 처리 가능하게)
- **Review 섹션 자동 생성 폐지** (v2.16.0): Focus Today는 v2.16.1부터 `# 오늘 꼭(Focus)` 단일 섹션. 회고가 필요하면 사용자가 `10 Reflection/`에 별도 파일로 직접 작성
- 이월 항목은 그대로 두어 planning에서 수집
- 작업 완료 정리는 `checkpoint`, 진행 중 저장은 `handoff`
- Step 11에서 planning tomorrow로 내일 준비 위임
- CLAUDE.md PARA 규칙 참조하여 비일일노트 분류 (frontmatter 기반)
- **내부 Task ID 축약 표기**: 보고서·요약에서 `T1`~`T9`, `CP1`~`CP9`, `KR1`~`KR9` 같은 축약은 한 문서 내 첫 출현 시 풀어쓰거나 괄호 병기. 이후 반복은 단독 허용.
