# Naming Rules — frame/object 이름 컨벤션

frame/object 의 `name` 필드는 캔버스 줌아웃 시 사람이 그 노드가 무엇인지 즉시 식별하는 단일 수단이다. id 는 시스템용, name 은 사람용. 이 문서는 노드 종류별 이름 형식을 표준화한다.

## 핵심 원칙

1. **이름은 캔버스 줌아웃 시 식별자 역할** — id 는 시스템용, name 은 사람용
2. **카테고리 prefix → 위치 → 역할** 순서로 정보 적층
3. **모든 top-level frame 은 카테고리 식별 가능** — prefix 또는 영역 라벨로
4. **screen body 자식 frame 은 단순 role 단어** — 이중 식별 불필요
5. **Lane 텍스트 카드 = SSOT(reusable=true)** — 별개 스토리보드 슬라이드의 카드는 Lane 카드의 ref instance(파생). 변경은 항상 Lane 카드에서, ref 가 자동 동기화

## 노드 종류별 이름 형식

| 노드 종류 | 이름 형식 | 예시 |
|:---|:---|:---|
| **영역 라벨** (top-level, zone 시작점) | `[Zone] <영역명>` | `[Zone] Storyboard`, `[Zone] Reference Archive`, `[Zone] Wireframes`, `[Zone] Components` |
| **화면 슬라이드** (top-level, 풀사이즈) | `<Lane code> · <step #/N> — <짧은 제목>` | `R1 · 1/5 — 변환 작업대`, `R4 · 2/3 — 만료 링크` |
| **와이어프레임** (top-level) | `Wireframe v<버전>-<코드> — <제목>` | `Wireframe v1-X — AC 추출 작업대`, `Wireframe v1-Y — AC 카탈로그` |
| **Lane 라벨 frame** (좌측 540 컬럼) | `Lane <code> — <시나리오/관점명>` | `Lane R1 — 요구사항 추출`, `Lane Reference — Clip 메타포 (legacy)` |
| **컴포넌트** (reusable, top-level) | `Component — <이름>` | `Component — App Header`, `Component — Section Check Tree` |
| **컴포넌트 variant 카드** (Component Showcase zone, 자연 크기) | `<Component>/<VariantLabel>` | `FileBrowser/Empty`, `FileBrowser/N items`, `ConversionTable/Loading`, `ConversionTable/Completed` |
| **컴포넌트 sub-zone 헤딩** (Showcase zone 내 컴포넌트별 라벨) | `▌ <Component>` (수직 막대 + 컴포넌트명) | `▌ FileBrowser`, `▌ ConversionTable` |
| **다이얼로그 컴포넌트** (reusable) | `Dialog — <목적>` | `Dialog — Conversion Confirm`, `Dialog — Cancel Confirm` |
| **별개 스토리보드 슬라이드** (top-level) | `Storyboard — <축 이름>` | `Storyboard — 새 모델 축 (R1~R4)` |
| **Lane 텍스트 카드 frame** (SSOT, reusable=true) | `Card · <Lane code>·<step>` | `Card · R1·1`, `Card · R1·3-error` |
| **스토리보드 카드** (별개 스토리보드 슬라이드 안, ref instance, 파생) | (이름 생략 — ref 가 본체 이름 자동 표시) | — |
| **텍스트 카드 위 외부 라벨** (lane row 안, 카드 위쪽 텍스트) | content = `<Lane code>-<step>` | `R1-01`, `R1-03-error` |
| **텍스트 카드 안 step 번호 텍스트** | content = 카드 안 step (간단 형식) | `01`, `03 · BRANCH`, `03a` |
| **텍스트 카드 안 제목 텍스트** | content = 화면 짧은 제목 (화면 name 의 "—" 우측과 동일) | `변환 작업대` |
| **미니맵 행 frame** (lane 안, main row) | `Minimap Row · main` | (분기 multi row 시 main 명시) |
| **분기 미니맵 행 frame** (lane 안, 분기 row) | `Minimap Row · <branch tag>` | `Minimap Row · error`, `Minimap Row · block`, `Minimap Row · cancel` |
| **풀사이즈 행 frame** (lane 안 — 옵션 A) | `Fullsize Row` | (단순 role) |
| **화살표** (path / icon_font) | `Arrow` | (단순) |
| **screen body 자식** (Header / Body / Footer 등) | role 단어 | `Header`, `Body`, `Footer`, `Sidebar Filters`, `AC Work Pane`, `Main` |
| **System 페이지** (Design System 전체) | `Design System — <서브타이틀>` | `Design System — Tokens & Components (Brutally Minimal v0.1)` |

## Lane code 규칙

- **Lane 의미 (기본형)**: 기능에 따른 **사용 시나리오** 단위 — "어떤 기능을 사용자가 어떤 흐름으로 쓰는가"
  - 예: `R1 — 변환·요구사항 추출`, `R2 — AC 카탈로그 탐색`, `R4 — 공유·추적성 검증`
  - 절대 원칙은 아님. 시안 의도에 따라 다른 축(데이터 모델 관점 / 상태 모드 / 사용자 역할 등) 가능 — `narrative-placement.md` Step 1 참조
- narrative 축 lane: `R1`, `R2`, `R3`, ... (R = "Row" / "Rail" — 의미 중립 prefix)
- Reference Archive: `Ref` (단어형 — 시각 인지 빠름)
- 격자 (행=여정 × 열=관점): `R1·M2` 형태 dot 결합
- 옛 narrative 의 lane 코드(`Lane 1`, `Lane A` 등)는 새 축 도입 시 일괄 갱신, 잔존 금지

## Step #/N 규칙

- **N = main row(happy path) 의 풀사이즈 화면 수** (분기 row 의 분기 카드는 N 에 포함하지 않음)
- main row 카드 step: `1/N` ~ `N/N`
- main row 의 변형 화면(상태별 — 빈/로딩 등): `1a`, `1b` 같이 알파벳 suffix
- **분기 row 카드 step**: `<main step>-<branch tag>` (예: `3-error`, `3-cancel`, `3-block`). branch tag 는 영문 소문자, 의미 식별자
- 분기 row 안 다중 step 카드: `<main step>-<branch tag>-<sub-#>` (예: `3-error-1`, `3-error-2`) 또는 단순화하여 의미어 (`3-error`, `3-retry`, `3-done`)
- 격자 lane 일 때 step 은 main row 단위로 매김

## Multi row / Multi lane 분기 규칙

- **multi row** 는 분기 흐름의 기본 표현 — lane 안에서 자유롭게 추가. 풀사이즈도 미니맵 row 와 1:1 대응되도록 multi-row 적용
- **multi lane 분기 (R1a/R1b 또는 R1-happy/R1-error)** 는 사용자 명시적 요청 시에만 — 자동 트리거 없음. 다음 신호 발생 시 lane 분기 옵션을 사용자에게 제안:
  1. **분기 후 후속 화면이 시퀀스로 이어짐** (단일 분기 카드는 multi-row OK, 시퀀스 2+ 단계는 lane 분기 신호)
  2. **multi-row 4+ 개 누적** — lane 한 영역 안 식별이 어려워짐
- 사용자 OK 받기 전까지 자동 분기 금지

### 콘텐츠 variant vs 분기 row 위치

variant 와 분기는 다른 row 에 둔다. 기준: "원래 시나리오의 happy path 가 끊겼는가?"

- **콘텐츠 variant** (같은 시나리오의 입력·상태 변형) → 메인 row 유지, step naming `<main step>a/b/c` (예: `1a 빈 파일 브라우저`)
- **분기 (branch)** (액션·결과로 흐름 갈라짐) → 별도 branch row, step naming `<main step>-<branch tag>` (예: `3-error`)

## Reference Archive 화면 이름 규칙

- prefix `Ref ·` 사용: `Ref · 발췌 목록 (Clip)`, `Ref · 다크 모드 데모`
- 괄호 안에 폐기 후보 분류 사유: `(Clip 메타포)`, `(테마 데모)`, `(레거시)`

## 텍스트 카드 안 컨텐츠 표준

카드 위 외부 라벨 + 카드 안 내용 분담:

```
   R1-01                     ← 카드 위 외부 라벨 (lane row 안 별도 텍스트)
                               content = "<Lane code>-<step>"
                               mono 10px, fg-secondary
┌────────────────────┐
│ 01                 │  ← 카드 안 step 번호 (mono 10px, fg-muted)
│ 변환 작업대         │  ← 짧은 제목 (sans 12px bold, fg)
└────────────────────┘
   width 160, height 80
   padding 10, gap 4
   surface bg, border 1px, cornerRadius 4
   reusable: true (Lane 카드인 경우)
```

Branch 카드 시각 강조 (분기 row 안 카드):

```
   R1-05-block               ← 외부 라벨 (`<main step>-<branch tag>`)
┌────────────────────┐
│ 05 · BRANCH        │  ← step + BRANCH prefix (mono 10px bold, $warning)
│ 변환 차단           │
└────────────────────┘
   stroke: $warning 1.5px (메인은 $border 1px)
```

토큰: `card-mini 160×80`, step 번호 text style `caption-mono`, 제목 text style `card-title`. Branch 카드는 stroke `$warning` + step prefix 색상 `$warning`.

## 갱신 워크플로우 (이름 일괄 변경)

화면 이름 변경 시 Lane 텍스트 카드(SSOT) 라벨도 따라가야 한다. 별개 스토리보드 슬라이드의 카드(ref instance) 는 Lane 카드 갱신 시 자동 반영.

1. **인벤토리 추출**: `python3 / jq` 로 design.pen 파싱 → 화면 frame name + Lane 텍스트 카드 안 텍스트 매핑 추출
2. **불일치 수집**: 화면 이름 변경됐는데 Lane 카드 라벨 이전 값인 항목 list
3. **분류표 작성**: 사용자에게 표 + 권장 갱신안 제출 (옵션 표 룰 — 표 + 권장안 볼드+밑줄)
4. **batch 적용** (Lane 카드만): `batch_design U(<Lane 카드 자식 text id>, { content: "<새 라벨>" })` 일괄 (25 ops 한도 분할). 스토리보드 슬라이드 안 ref instance 는 자동 반영되므로 별도 갱신 X
5. **시각 검증**: `snapshot_layout(parentId: storyboardId, maxDepth: 2)` + `get_screenshot` 로 Lane 카드와 스토리보드 카드 양쪽 갱신 확인
6. 사용자 ⌘S → commit

### 일괄 갱신 예시 op

```js
// 화면 frame name 갱신
U("hAWFS", { name: "R1 · 1/5 — 변환 작업대" })

// Lane 카드 안 텍스트 갱신 (SSOT)
U("<Lane 카드 step text id>", { content: "01" })
U("<Lane 카드 title text id>", { content: "변환 작업대" })
U("<Lane row 외부 라벨 text id>", { content: "R1-01" })

// 별개 스토리보드 슬라이드 안 ref instance 는 갱신 X — 자동 반영
```

## 안티패턴

- 화면 이름에 lane code 없이 `Slide 1` 같은 단순 인덱스 — 어느 lane 인지 미지
- Lane prefix 가 lane 라벨에만 있고 화면 이름·텍스트 카드 라벨에 없음 — 단독 식별 불가
- 영역 라벨 없음 — 큰 시안에서 줌아웃 시 영역 경계 모호
- `tmp` / `test` / `xxx` placeholder 이름 commit
- 텍스트 카드 안에 화면 미니어처(image / manual mock-up) 그려넣음 — 동기화 끊김 ★ 핵심 (storyboard-pattern.md 안티패턴)
- 텍스트 카드 라벨이 naming rule 안 따르고 자유 텍스트 — 검색·일괄 갱신 불가능
- Lane 카드를 reusable=true 로 두지 않음 — 별개 스토리보드 슬라이드 ref 동기화 깨짐
- 별개 스토리보드 슬라이드 안에 텍스트 카드를 직접 새로 만듦 — SSOT 정책 위반, Lane 카드 변경 시 동기화 끊김
- variant 와 분기를 같은 row 에 섞음 — variant 는 메인 row, 분기는 branch row
- Branch 카드를 메인 카드와 시각 동일 (`$border` stroke + `BRANCH` prefix 누락) — 분기 시점 식별 불가
- 분기 흐름을 별도 lane 으로 자동 분기 — multi lane 은 사용자 명시 요청 시에만 (분기 시퀀스 발생 시 옵션 제안만)
- 분기 row 의 step naming 에 main step 참조 누락 (`error-1` 만 표기) — 분기점 식별 불가, 반드시 `<main step>-<branch tag>`

## 참조

- 스토리보드 표현 방식·텍스트 카드 구조: `storyboard-pattern.md`
- narrative 축·자리배치: `narrative-placement.md`
- 캔버스 영역 좌표: `layout-variants.md` Canvas Zoning
