---
name: review-issue
description: "Obsidian vault에 보관된 이슈를 조회·필터링하고 상태를 변경(open → resolved/dismissed). 사용자가 \"이슈 확인\", \"이슈 목록\", \"이슈 리뷰\", \"보관 이슈\", \"열린 이슈\", \"이슈 상태\", \"이슈 닫기\", \"이슈 해결\" 언급 시 트리거."
---

# Issue Box — 이슈 리뷰 및 상태 관리

보관된 이슈를 조회하고, 상세 내용을 확인하며, 상태를 변경한다.
defer → review → resolve 라이프사이클을 완성하는 스킬이다.

## 트리거 조건

- `/issue-box:review-issue` 명시 호출
- "이슈 확인", "이슈 목록", "이슈 리뷰", "보관 이슈", "열린 이슈", "이슈 상태", "이슈 닫기", "이슈 해결" 키워드 발화

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| status | 필터링할 상태 | X | `open` |
| category | 필터링할 카테고리 | X | 전체 |
| priority | 필터링할 우선순위 | X | 전체 |
| folder | 검색 폴더 경로 | X | config.md 또는 `issue-box` |

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/issue-box-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | YAML frontmatter에서 `vault`, `folder_path` 값을 로드 → Step 3으로 건너뜀 |
| 파일 없음 | Step 2로 진행 (obsidian CLI로 탐색) |

### Step 2: Obsidian CLI 확인 및 Vault 파악

> CLI 명령 상세는 `../reference/obsidian-cli-reference.md` 참조.

`obsidian --version` 실행으로 CLI 설치 여부 확인.

- **미설치**: 설치 안내 출력 후 중단

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

### Step 3: 이슈 검색

`obsidian vault="<vault>" files folder="<folder_path>"` 실행하여 폴더 내 전체 파일 목록을 수집한다.

하위 일자별 폴더(`{YYYY-MM-DD}/`)도 재귀적으로 탐색한다.

각 `.md` 파일에 대해 property를 읽어 필터링한다:

```bash
obsidian vault="<vault>" property:read name="status" path="<file_path>"
obsidian vault="<vault>" property:read name="category" path="<file_path>"
obsidian vault="<vault>" property:read name="priority" path="<file_path>"
obsidian vault="<vault>" property:read name="created" path="<file_path>"
obsidian vault="<vault>" property:read name="source_project" path="<file_path>"
```

**필터링 규칙**:
- `status` 인자 (기본값: `open`) — 해당 상태만 포함
- `category` 인자가 있으면 해당 카테고리만 포함
- `priority` 인자가 있으면 해당 우선순위만 포함

**결과가 0건인 경우**: "해당 조건의 이슈가 없습니다." 안내 후 종료.

### Step 4: 요약 리스트 출력

수집된 이슈를 번호 매긴 테이블로 출력한다.

```
## 이슈 목록 (status: open, N건)

| # | 제목 | 카테고리 | 우선순위 | 생성일 | 프로젝트 |
|---|------|----------|----------|--------|----------|
| 1 | ... | bug | high | 2026-03-19 | my-app |
| 2 | ... | tech-debt | medium | 2026-03-20 | my-app |
```

**정렬**: 우선순위 순(high > medium > low), 동일 우선순위 내에서 생성일 역순(최신 우선).

**상한**: 상위 20건까지 출력. 20건 초과 시 추가 필터(category, priority) 사용 안내.

### Step 5: 사용자 행동 선택

AskUserQuestion으로 다음 행동을 묻는다:

- **상세 보기**: 번호 입력 (예: "1", "3") → Step 6으로 진행
- **상태 변경**: "1 resolved", "2 dismissed" → Step 7로 진행
- **일괄 변경**: "all resolved", "1,3,5 dismissed" → Step 7로 진행
- **종료**: "done", "완료" → 즉시 종료

### Step 6: 상세 내용 표시

선택된 이슈 파일의 전체 내용을 읽어 출력한다.

```bash
obsidian vault="<vault>" read path="<file_path>"
```

출력 후 Step 5로 돌아가 추가 행동을 묻는다.

### Step 7: 상태 변경

선택된 이슈의 status property를 변경하고 resolved_at을 기록한다.

```bash
obsidian vault="<vault>" property:set name="status" value="<resolved|dismissed>" path="<file_path>"
obsidian vault="<vault>" property:set name="resolved_at" value="{YYYY-MM-DD}" path="<file_path>"
```

허용 상태값:
- `resolved` — 해결 완료
- `dismissed` — 더 이상 유효하지 않아 폐기

변경 완료 후 변경된 파일명과 새 상태를 출력한다.
변경 후 Step 5로 돌아가 추가 행동을 묻는다.

## Do / Don't

| Do | Don't |
|----|-------|
| config.md 존재 시 vault/폴더 탐색 단계 스킵 | 설정이 있는데도 매번 CLI로 탐색 |
| property:set으로 상태 변경 | 파일 내용 전체를 다시 작성하여 상태 변경 |
| 필터 조건을 명확히 출력 (어떤 status/category로 검색했는지) | 필터 없이 전체 파일을 나열 |
| 상위 20건만 출력하고 추가 필터 안내 | 수백 건을 한꺼번에 출력 |
| obsidian CLI 에러 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
| 상태 변경 시 resolved_at 날짜도 함께 기록 | status만 변경하고 resolved_at 누락 |
