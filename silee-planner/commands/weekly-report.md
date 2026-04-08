---
description: Git 커밋 기반 주간/기간별 업무 보고서 자동 생성. 다수 레포의 커밋을 수집하여 티켓별 정리 및 다각도 리뷰 포함.
allowed-tools: Bash, Read, Write, Edit, Agent, AskUserQuestion
argument-hint: <기간> [레포 목록] [작성자]
---

# 주간 보고서 (weekly-report)

Git 커밋 데이터를 기반으로 기간별 업무 보고서를 자동 생성합니다.

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| 기간 | 시작~종료 날짜 (자연어 또는 YYYY-MM-DD) | O | - |
| 레포 | 대상 저장소 목록 | X | 현재 레포 |
| 작성자 | Git author 이메일 | X | config.md `author_email` 또는 후보군에서 선택 |

**사용 예시**:
```
/silee-planner:weekly-report 2월 21일부터 27일까지
/silee-planner:weekly-report 이번 주 connect-monorepo, eks, terraform-aws
/silee-planner:weekly-report 지난 2주 user@company.com
```

## 워크플로우

### Step 1: 설정 로드 및 인자 파싱

`~/.claude/plugins/data/silee-planner-cc-plugins/config.md` 파일을 읽는다.

| 케이스 | 처리 |
|--------|------|
| 파일 존재 | `vault`, `weekly_notes_path`, `weekly_note_format`, `author_email`, `inbox_folder_path` 값을 로드 |
| 파일 없음 | "설정이 없습니다. `/silee-planner:setup`을 먼저 실행해주세요." 안내 후 중단 |

사용자 입력에서 기간, 레포 목록, 작성자를 추출합니다.

- 날짜가 자연어("이번 주", "지난 2주")면 실제 날짜로 변환
- 레포가 지정되지 않으면 현재 디렉토리의 레포 사용
- 추가 working directory가 있으면 해당 레포도 포함 가능
- **작성자 결정**:
  - 인자로 명시적 지정된 경우 → 그대로 사용
  - 미지정 시 후보군 수집 + 사용자 선택:
    1. 후보 수집 (중복 제거):
       - config.md의 `author_email` (캐시)
       - `git config user.email` (현재 레포)
       - `git config --global user.email` (글로벌)
    2. AskUserQuestion(select)으로 후보 목록 제시 + "직접 입력" 옵션. 캐시값이 있으면 기본 선택
    3. 선택 결과를 config.md의 `author_email` 필드에 업데이트 (Edit 도구로 frontmatter 수정)

### Step 2: 커밋 데이터 수집

각 레포에 대해 **병렬로** general-purpose 에이전트를 실행하여 커밋 데이터를 수집합니다.

```
Agent(subagent_type="general-purpose", model="haiku", prompt="""
cd {repo_path} && git log --all --author="{author}" \
  --since="{start_date}" --until="{end_date}" \
  --format="%H|%ad|%s" --date=format:"%Y-%m-%d %H:%M"

각 커밋에 대해 git show --stat {hash} 실행하여 변경 파일 통계 수집.
모든 커밋 해시, 날짜, 메시지, 변경 파일을 빠짐없이 보고.
""")
```

**모든 레포를 동시에 실행** (Agent tool의 병렬 호출 활용).

### Step 3: 이슈 현황 수집 (선택적)

silee-planner가 보관한 이슈 중 보고 기간 내 생성된 것을 수집한다.
이 Step은 config.md에 `inbox_folder_path`가 없거나 vault가 미설정이면 **자동으로 건너뛴다** (경고 없이 조용히 skip).

> Step 2와 Step 3은 독립적이므로 **병렬 실행 가능**.

**수집 절차**:

1. config.md에서 `vault`, `inbox_folder_path` 읽기
   - 값 없음 → 이 Step 건너뛰고 Step 4로 진행

2. `obsidian vaults verbose` 실행하여 vault 이름 → 파일시스템 경로 매핑
   - obsidian CLI 미설치 또는 vault 미발견 → 조용히 skip

3. `{vault_path}/{inbox_folder_path}/` 하위 일자별 폴더 탐색
   - 폴더명(`{YYYY-MM-DD}`)으로 1차 날짜 필터 (보고 기간 범위)
   - 각 `.md` 파일의 YAML frontmatter 파싱: `created`, `category`, `priority`, `status`, `source_project`
   - frontmatter `created` 값으로 2차 날짜 필터 (정확한 기간 검증)
   - 본문에서 `# {제목}` (h1)과 `## 요약` 섹션 내용 추출

4. 이슈가 0건이면 이슈 현황 섹션을 보고서에 포함하지 않음

### Step 4: 커밋 데이터 분석

수집된 데이터에서:

1. **티켓 추출**: 커밋 메시지에서 `CND-\d+`, `JIRA-\d+` 등 티켓 ID 패턴 추출
2. **날짜별 그룹핑**: 커밋을 날짜 순으로 정렬
3. **파일 카테고리 분류**:
   - `server/**` → 백엔드
   - `client/**` → 프론트엔드
   - `pipelines/**`, `Dockerfile*`, `*.yaml` (k8s) → 인프라/DevOps
   - `.claude/**`, `scripts/**` → DevTooling
4. **투입 비율 계산**: 카테고리별 변경 파일 수 기반 비율 산출

### Step 5: 보고서 생성

아래 구조의 마크다운 보고서를 생성합니다:

```markdown
# 주간 업무 보고서

## Part A — 기간 요약
- 기간, 레포, 커밋/티켓 수, 투입 분야 비율 테이블

## Part B — 다각도 리뷰

### 1. 임팩트 분석 (비즈니스 + 개발자)
  - 비즈니스 임팩트 테이블 (이전→이후→효과)
  - 개발자 임팩트: 지속적으로 적용 가능한 개선 사항
  - 리스크 완화 실적

### 2. 추천 기술 세션
  - 이번 주 작업에서 도출한 세션 주제 (커밋/PR 기반 근거 명시)
  - 각 주제: 주제명, 대상 청중, 핵심 내용 요약, 기대 효과

### 3. 팀 기여도 관점 (업무 repo만)
  - 정량 지표 (커밋 수, PR 수, 파일 수) — 업무(회사) 저장소 커밋만 집계
  - 팀 생산성 기여 (도구 개선, 자동화)
  - 지식 공유/멘토링 기회, 블로그 주제

### 4. 기술적 깊이 관점
  - 기술 스택별 작업 깊이 테이블
  - 기술적 난제와 해결 과정 (문제→원인→시도→해결→교훈)

### 5. 업무 방식 개선 관점
  - 아키텍처 의사결정 패턴, 기술 부채 관리 전략, 팀 간 협업 구조 분석
  - 다음 주에 실험해볼 구체적 접근법

### 6. 자기 피드백 & 경력기술서 관점
  - 핵심 역량별 성과 기술
  - 각 역량에 경력기술서 활용 문구 (이탤릭)

## Part C — 이슈 현황 (Step 3에서 수집된 경우에만)

### 요약 통계
| 카테고리 | 건수 |
|----------|------|

### 이슈 목록
| # | 제목 | 카테고리 | 우선순위 | 상태 | 프로젝트 | 생성일 |
|---|------|----------|----------|------|----------|--------|

### 주요 이슈 상세 (high 우선순위만)

## 부록: 커밋 전체 목록
```

### Step 6: 파일 저장

config.md의 `weekly_notes_path` + `weekly_note_format`을 사용하여 저장 경로를 생성한다.

**경로 변수 치환**:
| 변수 | 값 | 계산 |
|------|-----|------|
| `{YYYY}` | 4자리 연도 | `date "+%Y"` |
| `{MM}` | 2자리 월 (zero-padded) | `date "+%m"` |
| `{WW}` | ISO 8601 주 번호 (zero-padded) | `date -j -f "%Y-%m-%d" "{start_date}" "+%V"` |

**최종 경로**: `{vault_path}/{weekly_notes_path}/{weekly_note_format}.md`
- 예: `02 Weekly Notes/2026/2026 Week-15.md`

**Obsidian vault 위치**: `obsidian vaults verbose`로 vault 이름 → 경로 매핑.

**Obsidian frontmatter** (YAML): 보고서 본문 상단에 반드시 포함

```yaml
---
created: {today}
period_start: {start_date}
period_end: {end_date}
author: {author_email}
repositories:
  - {repo_1}
  - {repo_2}
total_commits: {count}
total_tickets: {count}
tickets:
  - {ticket_1}
  - {ticket_2}
tags:
  - weekly-report
# 이슈가 있는 경우에만 아래 필드 포함
issue_count: {총 이슈 수}
issue_categories:
  bug: {N}
  tech-debt: {N}
  enhancement: {N}
  risk: {N}
  follow-up: {N}
  task: {N}
---
```

Write 도구로 파일을 생성한다. 이미 존재하면 "이미 보고서가 있습니다. 덮어쓸까요?" 질문.

## Do / Don't

| Do | Don't |
|----|-------|
| 커밋 메시지와 변경 파일 기반으로 사실적 서술 | 실제 커밋에 없는 작업을 추측하여 추가 |
| 경력기술서 활용 문구에 구체적 수치/기술명 포함 | "다양한 기술을 활용" 같은 모호한 표현 |
| 개선 기회를 건설적으로 제안 | 비난이나 부정적 평가 |
| 기술적 난제는 문제→시도→해결 과정을 서술 | 결과만 나열하고 과정 생략 |
| 각 관점에서 actionable한 제안 포함 | 일반론적 조언 반복 |
| 개발자 임팩트를 장기적/지속적 관점으로 서술 | 일시적 핫픽스를 지속적 개선으로 과장 |
| 팀 기여도에 업무 레포 작업만 포함 | 개인 프로젝트 커밋을 팀 기여도에 포함 |
| 업무 방식 개선을 커밋/PR 데이터의 구조적 패턴에 기반하여 제안 | 업무 방식을 추측으로 평가 |

## 보고서 품질 기준

- **사실 기반**: 모든 내용은 실제 커밋/파일 변경에서 도출
- **구체적**: 파일명, 기술명, 수치를 포함
- **다각도**: 6가지 관점 (임팩트 → 기술 세션 → 팀 기여도 → 기술 깊이 → 업무 개선 → 자기 피드백)
- **actionable**: 각 관점에서 다음 행동 제안 포함
- **가독성**: 테이블, 코드 블록, 구조화된 마크다운 활용
- **팀 기여도 필터**: 업무(회사) 저장소 커밋만 집계 (개인 프로젝트 제외)
- **잘한 점/아쉬운 점 미생성**: 이 항목은 사용자 직접 작성 영역이므로 보고서에 포함하지 않음
