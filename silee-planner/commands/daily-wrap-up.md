---
description: 하루 마감 정리. 오늘 Daily Note의 완료/미완료 항목을 분류하고, 미완료 항목을 처리하며, Review 섹션을 작성.
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# 하루 마감 (daily-wrap-up)

오늘의 Daily Note를 정리하고, 미완료 항목을 처리하며, Review 섹션을 작성한다.

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `daily_notes_path`, `daily_note_format`, `inbox_folder_path`, `file_title_format` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

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
| **내일 이어서** | 그대로 둠. 내일 `/daily-plan`에서 자동 수집됨 |
| **백로그로 보관** | Issue Box에 보관 (capture-task Step A의 "나중에" ���로 사용) |
| **완료 처리** | `- [x]`로 변경 |
| **삭제** | 항목 제거 |

여러 항목을 한 번에 처리할 수 있도록 번호+행동 형식 지원:
- "1,2 내일" / "3 백로그" / "4 삭제"

### Step 6: Review 섹션 작성

완료/미완료 분류 결과를 바탕으로 Review 섹션 초안을 제안한다:

```markdown
## Review
> 하루 마감 시 작성

- 완료: {완료 항목 요약}
- 미완료 → 내일로: {이월 항목 요약}
- 배운 것: {대화 컨텍스트에서 추출 가능한 학습 포인트, 없으면 빈칸}
```

AskUserQuestion으로 초안을 확인받는다:
- "이대로" → Step 7
- 수정 내용 입력 → 반영 후 Step 7

### Step 7: Daily Note 갱신

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
| 백로그 보관 시 간소화된 보고서 사용 | 전체 세션 스캔 워크플로우 반복 |
| 이월 항목은 그대로 두어 daily-plan에서 수집 | 이월 항목을 별도 파일로 분리 |
