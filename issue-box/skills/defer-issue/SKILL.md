---
name: defer-issue
description: "세션 대화에서 이슈를 분석·추출하여 Obsidian vault에 보고서로 저장. 나중에 처리할 이슈를 보관(defer)하는 트리아지 도구. 사용자가 \"이슈 정리\", \"이슈 보관\", \"나중에 처리\", \"이슈 추출\", \"문제 기록\", \"이슈 발견\", \"나중에 볼 것\" 언급 시 트리거."
---

# Issue Box — 이슈 추출 및 Obsidian 보관

세션 대화 내용을 분석하여 이슈를 추출하고, Obsidian vault에 상세 보고서로 저장한다.
지금 당장 처리하지 않고 나중에 처리하기 위해 보관(defer)하는 트리아지 도구이다.

## 트리거 조건

- `/issue-box:defer-issue` 명시 호출
- "이슈 정리", "이슈 보관", "나중에 처리", "이슈 추출", "문제 기록", "이슈 발견", "나중에 볼 것" 키워드 발화

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| vault | Obsidian vault 이름 | X | config.md 또는 CLI 탐색 |
| folder | 저장 폴더 경로 | X | config.md 또는 `issue-box` |

## 워크플로우

### Step 1: 설정 로드

`~/.claude/plugins/data/issue-box-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | YAML frontmatter에서 `vault`, `folder_path`, `file_title_format` 값을 로드 → Step 4로 건너뜀 |
| 파일 없음 | Step 2로 진행 (obsidian CLI로 탐색) |

### Step 2: Obsidian CLI 확인 및 Vault 파악

> CLI 명령 상세는 `obsidian-cli-reference.md` 참조.

`obsidian --version` 실행으로 CLI 설치 여부 확인.

- **미설치**: 설치 안내 출력 후 중단

`obsidian vaults verbose` 실행하여 vault 목록과 경로를 파악.

| 케이스 | 처리 |
|--------|------|
| 0개 | "Obsidian vault가 없습니다." 안내 후 중단 |
| 1개 | 자동 선택, 선택된 vault 이름 출력 |
| 2개+ | AskUserQuestion으로 vault 이름 + 경로 목록을 제시하고 선택 요청 |

### Step 3: 폴더 탐색

`obsidian vault="<name>" folders` 실행 후 폴더 목록에서 "issue-box"(대소문자 무시) 포함 폴더를 필터링.

| 케이스 | 처리 |
|--------|------|
| 1개 매칭 | 자동 선택 |
| 2개+ 매칭 | AskUserQuestion으로 매칭된 폴더 목록 제시 후 선택 |
| 0개 매칭 | `issue-box` 폴더를 기본 경로로 사용 (없으면 자동 생성됨) |

### Step 4: 이슈 분석 및 추출

현재 세션의 대화 컨텍스트를 분석하여 이슈를 추출한다.

**추출 대상** (종류 불문):
- 발견된 버그 또는 오류
- 미해결 기술 부채
- 보류된 개선 사항 (TODO, FIXME 언급 포함)
- 논의되었으나 구현하지 않은 기능/변경
- 리스크 또는 주의 사항
- 추후 확인이 필요한 사항
- 기타 대화 중 발견된 모든 유형의 이슈

**각 이슈에서 추출할 항목**:
- **제목**: 간결한 한 줄 (파일명으로도 사용)
- **카테고리**: `bug` / `tech-debt` / `enhancement` / `risk` / `follow-up`
- **우선순위**: `high` / `medium` / `low` (대화 맥락의 긴급도·영향도 기반 추정)
- **요약**: 1-2문장

이슈가 0건인 경우 "현재 세션에서 보관할 이슈가 발견되지 않았습니다." 안내 후 종료.

### Step 5: 이슈 선택

발견된 이슈 전체 목록을 번호 매긴 리스트로 출력.
각 항목에 제목, 카테고리, 우선순위, 요약을 표시.

AskUserQuestion으로 저장할 이슈를 선택받는다:
- 전체 선택 (예: "전부", "all")
- 번호 지정 (예: "1, 3, 5")
- 취소 (예: "취소", "cancel") → 즉시 종료

### Step 6: 보고서 작성 및 저장

> 보고서 포맷 상세는 `report-format.md` 참조.

선택된 각 이슈에 대해 상세 보고서를 작성하고 Obsidian 노트로 저장한다.

**저장 경로**: `{vault}/{folder_path}/{YYYY-MM-DD}/{file_title}.md`
- `folder_path`: config.md 값 또는 Step 3에서 결정된 폴더
- 일자별 하위 폴더 `{YYYY-MM-DD}` 자동 생성
- `file_title`: config.md의 `file_title_format` 적용 (기본값: `{category} {title}`)
- 예: `issue-box/2026-03-19/bug 로그인 에러 메시지 누락.md`

**저장 명령**:

```bash
obsidian vault="<vault>" create name="<file_title>" path="<folder_path>/<YYYY-MM-DD>" content="<보고서>"
```

content에 마크다운을 전달할 때 줄바꿈은 `\n`, 탭은 `\t`로 이스케이프한다.
YAML frontmatter의 `---` 구분자도 content 문자열 안에 포함하여 전달한다.

저장 완료 후 생성된 노트의 파일명과 경로를 출력한다.

## Do / Don't

| Do | Don't |
|----|-------|
| 대화 내용에서 실제로 논의된 이슈만 추출 | 대화에 없는 이슈를 추측하여 생성 |
| 이슈별로 충분한 컨텍스트와 재현 방법 포함 | 제목과 요약만으로 보고서 작성 |
| 카테고리와 우선순위를 대화 맥락 기반으로 판단 | 모든 이슈를 동일 카테고리/우선순위로 설정 |
| 제안 조치를 구체적이고 actionable하게 작성 | "나중에 확인 필요" 같은 모호한 제안 |
| obsidian CLI 명령 실패 시 에러 내용 출력 후 대안 제시 | CLI 에러를 무시하고 진행 |
| config.md 존재 시 vault/폴더 탐색 단계 스킵 | 설정이 있는데도 매번 CLI로 탐색 |
