---
name: design-system
description: |
  디자인 시스템 워크플로우 — Pencil MCP(.pen 파일) 표준 루프, batch_design 함정 5종,
  google-labs-code design.md 형식, 화면(screen) layout variant 7가지(Centered / Stack /
  Sidebar-Left / Sidebar-Right / Two-Column / Three-Column / Dialog) + 카드 폭 토큰
  (card-narrow 600 / card-default 880 / card-wide 1080 / card-full / card-dialog 520) +
  사이드바 토큰(320 / 520) + body padding 표준([32,40] / [24,28] / 40) +
  snapshot_layout 기반 전수 조사 → 표준화 절차. 시안 = SSOT, design.md = 토큰
  머신가독 미러. 토큰을 코드(CSS 변수)로 1:1 매핑.
  Use when asked to "Pencil 작업", "시안 편집", ".pen 파일", "batch_design",
  "디자인 시스템", "design.md", "DESIGN.md", "디자인 토큰", "화면 layout",
  "screen audit", "카드 폭", "max-width 일관성", "layout variant", "lane 분리",
  "시안 토큰 CSS로", or 비슷한 디자인 시스템 작업 발화.
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - WebFetch
  - AskUserQuestion
---

# Design System

이 스킬은 **시안(.pen) = 단일 진실 공급원(SSOT)**, **design.md = 토큰 머신 가독 미러**, **코드(CSS·HTML) = 토큰의 1:1 매핑** 이라는 3-layer 모델을 전제로 한다. 시안과 design.md가 어긋나면 시안이 정답이고 design.md를 같은 commit에서 갱신한다. 코드와 토큰이 어긋나면 토큰이 정답이고 코드를 갱신한다.

이 스킬의 책임 범위:
- Pencil MCP(.pen 파일)로 시안 디자인·편집·감사
- google-labs-code 형식 design.md 작성·갱신·lint
- 화면 layout variant 분류·신규 화면 디자인·일관성 표준화
- 시안 토큰을 코드(주로 CSS)로 동기화

이 스킬의 비책임 영역(다른 스킬·도구로 위임): 아이콘 디자인 자체, 모션/transition 시간, 일러스트레이션, 사용자 카피 톤(프로젝트 CLAUDE.md), React/HTMX 컴포넌트 구현 코드.

## HARD GATE

다음 조건에서는 진행 전 반드시 확인·중단한다.

- **시안 .pen 파일이 사용자 디스크에 미커밋 변경 상태일 때 D(삭제) 호출 금지** — 사용자가 작업 중인 콘텐츠는 git에 없을 수 있다. `git status design/`로 확인한 뒤에만 삭제. (사고 사례: `reference/incidents.md` #001)
- **자식 노드를 다른 부모로 옮길 때 M(move) 단독 사용 금지** — M은 자식을 새 부모 children에 추가하지만 원본 부모 children list에서 빼지 않는다. 원본을 D할 때 자식이 같이 삭제됨. **C(copy) + 원본 D** 패턴 사용. (`reference/batch-design-pitfalls.md` 1번)
- **`replace_all_matching_properties` 도구로 `$variable` 입력 금지** — escape 버그로 `\$variable` literal 저장 → 토큰이 깨짐. **batch_design U()만 사용**. (`reference/batch-design-pitfalls.md` 2번)

## Step 0 — 의도 정합성 (Priority-0)

기술적 분석 전에 사용자 요구가 어느 분류인지 먼저 결정하고, 분류와 시안 SSOT가 정합한지 확인한다.

| 분류 | 트리거 발화 예 | 진행 reference |
|:---|:---|:---|
| 시안 신규 디자인 | "화면 추가", "마스터 만들어", "lane 추가" | `reference/pencil-mcp.md` |
| 시안 편집 | "lane 분리", "배치 정리", "토큰 적용" | `reference/pencil-mcp.md` + `batch-design-pitfalls.md` |
| design.md 작성·갱신 | "DESIGN.md 만들어", "디자인 토큰 문서", "디자인 시스템 명세" | `reference/design-md-spec.md` |
| 표준화·감사 | "layout 일관성", "카드 폭 정리", "screen audit" | `reference/layout-variants.md` + `audit-workflow.md` |
| 코드 동기화 | "토큰 CSS로", "시안 따라 화면 구현" | `reference/design-md-spec.md` (CSS 매핑 섹션) |

분류가 모호하면 **AskUserQuestion**으로 명확화. 시안과 design.md가 충돌(Misaligned)하면 시안 우선으로 정합성 회복 후 진행.

## Phase 1 — Context Gathering (read-only, plan mode 호환)

1. **시안 위치 확인** — `Glob design/*.pen` 또는 사용자가 명시한 경로
2. **미커밋 변경 확인** — `git status design/` (HARD GATE 위해 필수)
3. **시안 상태 로드** — `mcp__pencil__get_editor_state(include_schema: true)`
4. **토큰 추출** — `mcp__pencil__get_variables`
5. **화면 인벤토리** — `mcp__pencil__snapshot_layout(maxDepth: 0)` 또는 `git show HEAD:design/*.pen`을 jq/python으로 직접 분석 (대량 화면 분석 시 후자가 빠름)
6. **design.md 존재 여부** — `Read design.md` (있으면 토큰·sections 매핑 확인)

`reference/pencil-mcp.md`의 도구별 역할 표로 어느 호출이 필요한지 결정한다.

## Phase 2 — 분류별 작업 분기

Step 0에서 결정한 분류에 맞춰 reference 문서를 로드 후 작업 단위(op 묶음)를 설계한다.

- **시안 편집**: `reference/batch-design-pitfalls.md`의 5개 함정을 op 작성 전 사전 점검
- **design.md 작성**: `reference/design-md-spec.md`의 schema·section 순서 따라 YAML + 8 sections
- **표준화**: `reference/audit-workflow.md`의 8단계 — 화면 인벤토리 → body 추출 → variant 분류 → 비표준 발견 → 토큰 매핑 → 일괄 적용 → 검증
- **코드 동기화**: design.md 토큰을 CSS 변수로 1:1 매핑 (`--bg-canvas: #0F1117` 등)

## Phase 3 — 변경 적용 (안전 패턴)

batch_design 호출 시 다음 5개 룰을 항상 준수한다.

1. **25 op 한도 분할** — 큰 변경은 logical section 별로 batch를 쪼갠다.
2. **신규 frame 직후 layout 명시** — `I(frame)` 다음 줄에 `U(id, {layout: "vertical"|"horizontal"})` 추가. layout 누락 함정(`pitfalls.md` 4번) 회피.
3. **자식 이동 = C(copy) + 원본 D** — M 단독 금지. (`pitfalls.md` 1번 / `incidents.md` #001)
4. **토큰 적용은 `batch_design U()`만** — `replace_all_matching_properties` 금지. (`pitfalls.md` 2번)
5. **frame width/height에 변수 참조 X** — hardcode px 또는 `fill_container`/`fit_content`. (`pitfalls.md` 3번)

descendants override는 변경 키만 명시하고 children 통째 override는 회피. swap이 필요하면 `R()`. (`pitfalls.md` 5번)

## Phase 4 — 시각 검증

- `mcp__pencil__get_screenshot(nodeId)` — 변경 영역 before/after 스크린샷
- `mcp__pencil__snapshot_layout` — 좌표·폭 무충돌 (lane 침범, 카드 겹침) 확인
- design.md 변경 시 `npx -p @google/design.md design.md lint <file>` — errors 0 (warnings 분석)

검증 실패 시 Phase 3로 돌아가 수정. 3회 연속 실패는 Escalation.

## Phase 5 — 동기화

- 시안 변경 → 같은 commit에서 design.md 갱신 (drift 방지)
- HTML/CSS 코드가 별도 저장소면 토큰을 CSS 변수로 1:1 매핑
- `README.md` / `CLAUDE.md` 의 토큰 표가 있으면 갱신

## Status Protocol (완료 보고 형식)

워크플로우 종료 시 다음 중 하나로 보고한다.

- **DONE** — 모든 phase 완료, 시각 검증 + lint 통과, 변경 commit·push 까지 완료
- **DONE_WITH_CONCERNS** — 완료했으나 후속 결정 필요 (예: aF98Z 1541px 같이 lane label 박스를 넘는 화면 잔여, 표준 외 폭 미해결)
- **BLOCKED** — Phase 진행 불가 (예: 시안 schema 호환 안 됨, 사용자 미커밋 .pen 변경)
- **NEEDS_CONTEXT** — 분류 모호로 AskUserQuestion 필요

각 상태는 1~2 줄 사유 + 시도한 단계 + 권장 다음 액션을 함께 보고한다.

## Escalation

다음 시점에 즉시 중단하고 사용자에게 보고한다.

- **batch_design 호출 3회 연속 실패** — op 작성 전제가 잘못됐을 가능성. 현황·시도 보고 후 사용자 결정 대기.
- **사용자 디스크 미커밋 .pen 변경 상태에서 D 호출 시도** — 데이터 손실 위험. 백업 우선.
- **시안 schema 변경 감지** — `mcp__pencil__get_editor_state(include_schema: true)`로 확인하고 공식 문서 또는 Pencil docs 재확인 후 진행.
- **토큰 없음 / orphaned-tokens 경고가 다수** — design.md `lint` 결과를 사용자와 공유 후 의도 확인.

## Plan Mode Handling

이 스킬의 Phase 1, 일부 Phase 4(read-only) 호출은 plan mode에서 OK:

- read-only: `mcp__pencil__get_editor_state`, `get_variables`, `batch_get`, `snapshot_layout`, `get_screenshot`, `Read`, `Glob`, `Grep`, `Bash`(`git status`, `git show`, `jq`)
- plan mode 차단: `mcp__pencil__batch_design`, `Edit`, `Write`, `git commit`/`push`

Phase 1~2까지는 plan mode에서 분석·계획. ExitPlanMode 후 Phase 3~5 실행.

## Reference Index

| 파일 | 다룰 때 |
|:---|:---|
| [`reference/pencil-mcp.md`](reference/pencil-mcp.md) | Pencil MCP 호출 전반·도구별 역할·plan mode 호환성 |
| [`reference/batch-design-pitfalls.md`](reference/batch-design-pitfalls.md) | **batch_design op 작성 전 필독** — 함정 5종 + 안전 패턴 |
| [`reference/design-md-spec.md`](reference/design-md-spec.md) | design.md 신규 작성·수정·lint·CSS 매핑 |
| [`reference/layout-variants.md`](reference/layout-variants.md) | 화면 layout 분류·신규 화면 디자인·카드/사이드바 폭 토큰 |
| [`reference/audit-workflow.md`](reference/audit-workflow.md) | 다수 화면 일관성 점검·표준화 8단계 |
| [`reference/incidents.md`](reference/incidents.md) | **사고 사례** — 새 작업 시작 전 1회 점검, 같은 사고 재발 방지 |

## Completion

워크플로우 종료 직전 다음을 자체 점검:

- HARD GATE 3개를 모두 준수했는가?
- Phase 4의 시각 검증·lint를 모두 수행했는가?
- 시안 변경이 있다면 design.md를 같은 commit에서 갱신했는가?
- Status Protocol 라벨로 명확히 보고했는가?
- 사고 사례가 발생했다면 `reference/incidents.md`에 추가 기록을 제안했는가?

위 5개를 만족하면 워크플로우를 종료한다.
