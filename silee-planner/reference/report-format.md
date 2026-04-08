# 이슈 보고서 포맷

## YAML Frontmatter

```yaml
---
created: {YYYY-MM-DD}
category: {bug|tech-debt|enhancement|risk|follow-up|task}
priority: {high|medium|low}
status: {open|blocked}                    # 외부 의존 대기 시 blocked, 그 외 open
started_at:                               # status → in-progress 변경 시 {YYYY-MM-DD} 기록
resolved_at:                              # status → resolved/dismissed 변경 시 {YYYY-MM-DD} 기록
blocked_reason:                           # status가 blocked일 때 사유 기록 (예: "인프라 팀 도메인 구성 완료 대기")
source_project: {cwd 기반 프로젝트명}
tags:
  - issue-box
  - {category}
---
```

## 마크다운 본문

```markdown
# {이슈 제목}

## 요약

{1-2문장 요약}

## 컨텍스트

{이슈 발견 경위. 어떤 작업 중 어떤 논의에서 나왔는지.}

## 상세 분석

{기술적 상세. 관련 파일, 코드 패턴, 영향 범위 등.}

## 재현 / 확인 방법

{카테고리에 맞는 확인 방법. 버그라면 재현 단계, 기술 부채라면 확인 방법, 개선 사항이라면 현재 상태.}

## 제안 조치

{권장 해결 방향, 다음 단계. 구체적이고 actionable하게.}

## 관련 파일

- `{파일 경로}` — {관련 이유}
```

## 섹션별 작성 가이드

| 섹션 | 가이드 |
|------|--------|
| 요약 | 핵심만 1-2문장. 제목과 중복하지 않되 보충 정보 포함 |
| 컨텍스트 | 어떤 대화/작업 흐름에서 발견되었는지 경위 기술 |
| 상세 분석 | 코드 레벨의 기술 정보. 파일 경로, 함수명, 영향 범위 등 구체적으로 |
| 재현 / 확인 방법 | 카테고리별 적절한 확인 수단 제시 (재현 단계, 검색 명령, 현재 동작 설명) |
| 제안 조치 | "나중에 확인" 같은 모호한 표현 금지. 구체적 행동 항목으로 작성 |
| 관련 파일 | 실제 경로와 관련 이유를 쌍으로 기술 |

## blocked 상태 가이드

status를 `blocked`로 설정하는 경우:
- 외부 팀/시스템의 작업 완료를 기다리는 경우
- 선행 조건이 충족되어야 진행 가능한 경우
- 추가 자료나 결정을 대기 중인 경우

`blocked_reason`에는 **누가/무엇이 해제 조건인지** 구체적으로 기록한다.
예: "인프라 팀 별도 도메인 구성 완료 후 공유 대기", "PM의 스펙 확정 대기"

blocked 이슈는 `inbox_folder_path`에 유지하며, 조건 충족 시 status를 `open`으로 변경하고 Daily Notes로 가져온다.
