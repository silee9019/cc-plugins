---
name: pick-issue
description: "Obsidian vault에서 보관된 이슈를 조회하고, 하나를 선택하여 작업을 시작. 상태를 in-progress로 전환하고 작업에 필요한 컨텍스트를 출력. 사용자가 \"이슈 선택\", \"이슈 고르기\", \"다음 이슈\", \"이슈 시작\", \"뭐 할까\", \"할 일\", \"이슈 목록\", \"열린 이슈\", \"이슈 확인\", \"이슈 완료\", \"이슈 해결\", \"이슈 닫기\", \"이슈 상태\" 언급 시 트리거."
---

# Issue Box — 이슈 선택 및 작업 시작

보관된 이슈 중 하나를 선택하여 작업을 시작한다.
defer → pick → resolve 라이프사이클을 완성하는 스킬이다.

## 트리거 조건

- `/issue-box:pick-issue` 명시 호출
- "이슈 선택", "이슈 고르기", "다음 이슈", "이슈 시작", "뭐 할까", "할 일" 키워드 발화
- "이슈 목록", "열린 이슈", "이슈 확인", "이슈 상태" 키워드 발화
- "이슈 완료", "이슈 해결", "이슈 닫기" 키워드 발화 (완료 처리)

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| category | 필터링할 카테고리 | X | 전체 |
| priority | 필터링할 우선순위 | X | 전체 |

## 상태 라이프사이클

```
open → in-progress → resolved | dismissed
```

| 상태 | 의미 | 전환 시점 | 폴더 |
|------|------|----------|------|
| open | 보관됨, 미착수 | defer-issue에서 생성 시 | `inbox_folder_path` |
| in-progress | 작업 중 | pick-issue에서 선택 시 (자동) | `in_progress_folder_path` |
| resolved | 해결 완료 | 사용자가 완료 처리 시 | `resolved_folder_path` |
| dismissed | 폐기 | 사용자가 폐기 처리 시 | `dismissed_folder_path` |

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/issue-box-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | YAML frontmatter에서 `vault`, `inbox_folder_path`, `in_progress_folder_path`, `resolved_folder_path`, `dismissed_folder_path` 값을 로드 → Step 3으로 건너뜀 |
| `inbox_folder_path` 없고 `folder_path` 있음 | `folder_path` 값을 `inbox_folder_path`로 사용 (v2.x 호환). "설정이 이전 버전입니다. `/issue-box:setup`을 다시 실행해주세요." 안내 출력. `in_progress_folder_path`, `resolved_folder_path`, `dismissed_folder_path`가 없으면 Step 3 이슈 검색은 `inbox_folder_path`만 탐색 |
| 파일 없음 | Step 2로 진행 (obsidian CLI로 탐색) |

### Step 2: Obsidian CLI 확인 및 Vault 파악

> CLI 명령 상세는 `../reference/obsidian-cli-reference.md` 참조.

`obsidian --help` 실행으로 CLI 설치 여부 확인.

- **미설치**: 설치 안내 출력 후 중단

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

### Step 3: 이슈 검색

**open 이슈 수집** (`inbox_folder_path` 하위):

`obsidian vault="<vault>" files folder="<inbox_folder_path>"` 실행하여 파일 목록을 수집한다.
하위 일자별 폴더(`{YYYY-MM-DD}/`)도 재귀적으로 탐색한다.

각 `.md` 파일에 대해 property를 읽어 필터링한다:
- `category` (인자 있으면 해당 카테고리만)
- `priority` (인자 있으면 해당 우선순위만)
- `created`, `source_project` (표시용)

**in-progress 이슈 수집** (`in_progress_folder_path` 하위):

`in_progress_folder_path` 설정이 있으면 동일 방식으로 탐색한다.
in-progress 이슈는 open 이슈 목록 위에 별도 섹션으로 표시한다.

**결과가 0건인 경우**: "해당 조건의 이슈가 없습니다." 안내 후 종료.

### Step 4: 이슈 목록 출력

수집된 이슈를 번호 매긴 테이블로 출력한다.

**in-progress 이슈가 있는 경우** 상단에 별도 안내:

```
⏳ 현재 진행 중인 이슈:
  1. [제목] (category, priority, started_at)
```

**open 이슈 테이블**:

```
## 이슈 목록 (open, N건)

| # | 제목 | 카테고리 | 우선순위 | 생성일 | 프로젝트 |
|---|------|----------|----------|--------|----------|
```

정렬: 우선순위 순(high > medium > low), 동일 우선순위 내에서 생성일 역순(최신 우선).
상한: 상위 20건까지 출력. 20건 초과 시 "추가 N건이 있습니다. category 또는 priority 필터를 사용하세요." 안내.

### Step 5: 사용자 행동 선택

AskUserQuestion으로 행동을 묻는다:

- **이슈 선택 (작업 시작)**: 번호 입력 (예: "1", "3번") → Step 6으로 진행
- **상세 보기**: "상세 1", "자세히 2" → 해당 이슈 전문 출력 후 Step 5로 복귀
- **완료 처리**: "완료 1", "해결 2" → Step 7로 진행 (resolved)
- **폐기 처리**: "폐기 1", "dismiss 2" → Step 7로 진행 (dismissed)
- **종료**: "done", "완료", "그만" → 즉시 종료

### Step 6: 이슈 선택 및 작업 시작

1. 선택된 이슈 파일의 전체 내용을 읽는다:

```bash
obsidian vault="<vault>" read path="<file_path>"
```

2. 상태를 in-progress로 전환한다:

```bash
obsidian vault="<vault>" property:set name="status" value="in-progress" path="<file_path>"
obsidian vault="<vault>" property:set name="started_at" value="{YYYY-MM-DD}" path="<file_path>"
```

3. 파일을 `in_progress_folder_path`로 이동한다:

```bash
obsidian vault="<vault>" move path="<file_path>" to="<in_progress_folder_path>/{YYYY-MM-DD}/"
```

`in_progress_folder_path` 설정이 없으면 (v2.x 호환 모드) 이동하지 않고 status만 변경한다.

4. 작업 요약을 출력한다:

```
---
## 작업 시작: {이슈 제목}

**카테고리**: {category} | **우선순위**: {priority} | **프로젝트**: {source_project}

### 요약
{이슈 본문의 "요약" 섹션}

### 해야 할 일
{이슈 본문의 "제안 조치" 섹션을 체크리스트로 변환}
- [ ] 조치 1
- [ ] 조치 2

### 관련 파일
{이슈 본문의 "관련 파일" 섹션}
- `path/to/file.ts` — 이유

### 컨텍스트
{이슈 본문의 "컨텍스트" + "상세 분석" 섹션 요약}
---
```

5. 현재 작업 디렉토리(cwd)와 `source_project`를 비교:
   - **일치**: "현재 프로젝트에서 바로 작업 가능합니다."
   - **불일치**: "이 이슈는 {source_project} 프로젝트의 이슈입니다. 해당 디렉토리로 이동이 필요할 수 있습니다."

### Step 7: 완료 처리

선택된 이슈의 상태를 변경한다.

```bash
obsidian vault="<vault>" property:set name="status" value="<resolved|dismissed>" path="<file_path>"
obsidian vault="<vault>" property:set name="resolved_at" value="{YYYY-MM-DD}" path="<file_path>"
```

파일을 해당 폴더로 이동한다:

| 상태 | 이동 대상 |
|------|----------|
| resolved | `resolved_folder_path` |
| dismissed | `dismissed_folder_path` |

```bash
obsidian vault="<vault>" move path="<file_path>" to="<대상_folder_path>/{YYYY-MM-DD}/"
```

대상 폴더 설정이 없으면 (v2.x 호환 모드) 이동하지 않고 status만 변경한다.

변경 완료 후 변경된 파일명과 새 상태를 출력하고, Step 5로 돌아간다.

## Do / Don't

| Do | Don't |
|----|-------|
| config.md 존재 시 vault/폴더 탐색 단계 스킵 | 설정이 있는데도 매번 CLI로 탐색 |
| property:set으로 상태 변경 | 파일 내용 전체를 다시 작성하여 상태 변경 |
| 작업 요약에서 "제안 조치"를 체크리스트로 변환 | 이슈 전문을 그대로 복사하여 출력 |
| source_project와 cwd 비교하여 안내 | 프로젝트 불일치를 무시 |
| 상위 20건만 출력하고 추가 필터 안내 | 수백 건을 한꺼번에 출력 |
| 상태 변경 시 started_at/resolved_at 날짜도 함께 기록 | status만 변경하고 날짜 필드 누락 |
| in-progress 이슈가 있으면 목록 상단에 별도 안내 | in-progress 상태 이슈를 무시 |
| 폴더 설정 없으면 이동 없이 status만 변경 (v2.x 호환) | 설정 없는데 이동 시도하여 에러 |
