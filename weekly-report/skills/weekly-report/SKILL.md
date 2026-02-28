---
name: weekly-report
description: |
  Git 커밋 기반 주간/기간별 업무 보고서 자동 생성.
  다수 레포의 커밋을 수집하여 날짜별/티켓별 정리 및 다각도 리뷰(자기 피드백, 상급자, 교육, 팀 기여도, 기술 깊이)를 포함한 마크다운 보고서 생성.
  사용자가 "주간 보고서", "업무 보고서", "weekly report", "work report" 언급 시 트리거.
---

# Weekly Report (업무 보고서 생성)

Git 커밋 데이터를 기반으로 기간별 업무 보고서를 자동 생성합니다.

## 트리거 조건

- 사용자가 "주간 보고서", "업무 보고서", "weekly report", "커밋 정리", "작업 보고" 등을 언급
- `/weekly-report` 명령 직접 호출

## 인자

| 인자 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| 기간 | 시작~종료 날짜 (자연어 또는 YYYY-MM-DD) | O | - |
| 레포 | 대상 저장소 목록 | X | 현재 레포 |
| 작성자 | Git author 이메일 | X | `git config user.email` |
| 출력 경로 | 보고서 파일 경로 | X | Obsidian vault `01 Weekly Notes/yyyy/yyyy Week-ww.md` |

**사용 예시**:
```
/weekly-report 2월 21일부터 27일까지
/weekly-report 이번 주 connect-monorepo, eks, terraform-aws
/weekly-report 지난 2주 silee@imagoworks.ai
```

## 워크플로우

### Step 1: 인자 파싱

사용자 입력에서 기간, 레포 목록, 작성자를 추출합니다.

- 날짜가 자연어("이번 주", "지난 2주")면 실제 날짜로 변환
- 레포가 지정되지 않으면 현재 디렉토리의 레포 사용
- 작성자가 지정되지 않으면 `git config user.email` 사용
- 추가 working directory가 있으면 해당 레포도 포함 가능

### Step 2: 커밋 데이터 수집

각 레포에 대해 **병렬로** general-purpose 에이전트를 실행하여 커밋 데이터를 수집합니다.

```
Task(subagent_type="general-purpose", model="haiku", prompt="""
cd {repo_path} && git log --all --author="{author}" \
  --since="{start_date}" --until="{end_date}" \
  --format="%H|%ad|%s" --date=format:"%Y-%m-%d %H:%M"

각 커밋에 대해 git show --stat {hash} 실행하여 변경 파일 통계 수집.
모든 커밋 해시, 날짜, 메시지, 변경 파일을 빠짐없이 보고.
""")
```

**모든 레포를 동시에 실행** (Task tool의 병렬 호출 활용).

### Step 3: 커밋 데이터 분석

수집된 데이터에서:

1. **티켓 추출**: 커밋 메시지에서 `CND-\d+`, `JIRA-\d+` 등 티켓 ID 패턴 추출
2. **날짜별 그룹핑**: 커밋을 날짜 순으로 정렬
3. **파일 카테고리 분류**:
   - `server/**` → 백엔드
   - `client/**` → 프론트엔드
   - `pipelines/**`, `Dockerfile*`, `*.yaml` (k8s) → 인프라/DevOps
   - `.claude/**`, `scripts/**` → DevTooling
4. **투입 비율 계산**: 카테고리별 변경 파일 수 기반 비율 산출

### Step 4: 보고서 생성

아래 구조의 마크다운 보고서를 생성합니다:

```markdown
# 주간 업무 보고서

## Part A — 기간 요약
- 기간, 레포, 커밋/티켓 수, 투입 분야 비율 테이블

## Part B — 날짜별 활동 로그
- 날짜별 커밋 테이블 (커밋 해시, 레포, 내용)
- 각 날짜의 핵심 요약 1~2줄

## Part C — 프로젝트(티켓)별 상세 분석
- 각 티켓: 개요, 기술 구현, 변경 범위, 성과 지표
- 가장 큰 작업은 아키텍처 다이어그램 포함

## Part D — 다각도 리뷰
### 1. 자기 피드백 & 경력기술서 관점 (필수)
  - 핵심 역량별 성과 기술
  - 각 역량에 경력기술서 활용 문구 (이탤릭)
  - 강점 / 개선 기회

### 2. 상급자/매니저 관점
  - 비즈니스 임팩트 테이블 (이전→이후→효과)
  - 리스크 완화 실적
  - 관찰 사항 (칭찬 + 개선 제안)

### 3. 교육적/성장 관점
  - 학습 포인트 (이번 주 습득한 기술 지식)
  - 다음 학습 제안
  - 기술 세션 주제 추천

### 4. 팀 기여도 관점
  - 정량 지표 (커밋 수, PR 수, 파일 수)
  - 팀 생산성 기여 (도구 개선, 자동화)
  - 지식 공유/멘토링 기회, 블로그 주제

### 5. 기술적 깊이 관점
  - 기술 스택별 작업 깊이 테이블
  - 기술적 난제와 해결 과정 (문제→원인→시도→해결→교훈)

## 부록: 커밋 전체 목록
```

### Step 5: 파일 저장

Obsidian vault의 Weekly Notes 폴더에 저장합니다.

**경로 규칙**: `{obsidian_vault}/01 Weekly Notes/{yyyy}/{yyyy} Week-{ww}.md`
- `{yyyy}`: 연도 (예: 2026)
- `{ww}`: ISO 주 번호, 2자리 zero-padded (예: 08)
- ISO 주 번호는 `date -j -f "%Y-%m-%d" "{start_date}" "+%V"` 로 계산

**Obsidian vault 위치 탐색**: `find ~ -maxdepth 4 -name ".obsidian" -type d`

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
---
```

## Do / Don't

| Do | Don't |
|----|-------|
| 커밋 메시지와 변경 파일 기반으로 사실적 서술 | 실제 커밋에 없는 작업을 추측하여 추가 |
| 경력기술서 활용 문구에 구체적 수치/기술명 포함 | "다양한 기술을 활용" 같은 모호한 표현 |
| 개선 기회를 건설적으로 제안 | 비난이나 부정적 평가 |
| 기술적 난제는 문제→시도→해결 과정을 서술 | 결과만 나열하고 과정 생략 |
| 각 관점에서 actionable한 제안 포함 | 일반론적 조언 반복 |

## 보고서 품질 기준

- **사실 기반**: 모든 내용은 실제 커밋/파일 변경에서 도출
- **구체적**: 파일명, 기술명, 수치를 포함
- **다각도**: 최소 5가지 관점 (자기 피드백 필수)
- **actionable**: 각 관점에서 다음 행동 제안 포함
- **가독성**: 테이블, 코드 블록, 구조화된 마크다운 활용
