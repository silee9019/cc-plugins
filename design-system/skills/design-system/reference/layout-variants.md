# 화면(screen) Layout Variant 7개

화면 = top-level frame, prefix `01 — ...` / `EX 01 — ...`, width 1280. 화면 안 콘텐츠 layout은 다음 7개 variant 중 하나로 분류된다. 신규 화면 디자인이나 기존 화면 표준화 시 이 분류로 매핑.

---

## 1. Centered (Hero) — 단일 메시지 중앙

```
┌────────────────────────────────────┐
│  [App Header]                      │
├────────────────────────────────────┤
│                                    │
│             ┌──────────┐           │
│             │   icon   │           │
│             │ message  │           │
│             │  [CTA]   │           │
│             └──────────┘           │
│                                    │
└────────────────────────────────────┘
```

- **body**: `padding: 40 단일`, `gap: 24`, `justifyContent: center`, `alignItems: center`, `layout: vertical`
- **자식**: 보통 `mc-empty-hero` ref 1개
- **카드 폭**: `card-narrow 600` (hero box)
- **사용**: 빈 상태(empty), 워밍업, 일시정지, 단일 작업 완료/실패 안내

---

## 2. Stack — 카드 세로 쌓기 (1-column)

```
┌────────────────────────────────────┐
│  [App Header]                      │
├────────────────────────────────────┤
│       ┌──────────────────┐         │
│       │  card 1          │         │
│       └──────────────────┘         │
│       ┌──────────────────┐         │
│       │  card 2          │         │
│       └──────────────────┘         │
│       ┌──────────────────┐         │
│       │  card 3          │         │
│       └──────────────────┘         │
│       ┌──────[footer]──┐           │
│       │  [cancel] [ok] │           │
│       └────────────────┘           │
└────────────────────────────────────┘
```

- **body**: `padding: [32, 40]`, `gap: 24`, `alignItems: center`, `layout: vertical`
- **자식**: 카드 vertical stack + 마지막 footer-actions
- **폭 변형 3종**: `card-narrow 600` / `card-default 880` / `card-wide 1080`
- **사용**: 폼/리스트/Settings/대부분의 메인 화면

폭 변형 결정 가이드:
- `narrow 600` — 단순 폼 / 안내 카드 (입력 필드 1~2개)
- `default 880` — 일반 메인 / 다중 카드 (Sessions 리스트, Settings)
- `wide 1080` — 큰 업로드/프리뷰 / 콘텐츠 풍부 단일 카드

---

## 3. Sidebar-Left — 좌 사이드 + 메인

```
┌────────────────────────────────────┐
│  [App Header]                      │
├────────────────────────────────────┤
│  ┌────────┐  ┌──────────────────┐  │
│  │sidebar │  │  main            │  │
│  │  list  │  │  workspace       │  │
│  │  rows  │  │                  │  │
│  │        │  │                  │  │
│  └────────┘  └──────────────────┘  │
└────────────────────────────────────┘
```

- **body**: `padding: [24, 28]`, `gap: 24`, `layout: horizontal`, `alignItems: stretch`
- **자식**: sidebar(고정 폭) + main(`fill_container`)
- **폭**: `sidebar-default 520` 또는 `sidebar-narrow 320` + main `fill`
- **사용**: 화자 라벨링, 좌측 navigation/list 패널 + 우측 작업 영역

---

## 4. Sidebar-Right — 메인 + 우 사이드 (+ 옵션 strip)

```
┌────────────────────────────────────┐
│  [App Header]                      │
│  ━━━ metric strip ━━━━━━━━━━━━━━━ │ ← 선택적 상단 strip
├────────────────────────────────────┤
│  ┌──────────────────┐  ┌────────┐  │
│  │  main            │  │side    │  │
│  │  preview         │  │ export │  │
│  │  output          │  │options │  │
│  └──────────────────┘  └────────┘  │
└────────────────────────────────────┘
```

- **body**: `padding: [24, 28~32]`, `gap: 24`, `layout: horizontal`
- **자식**: main `fill_container` + sidebar `sidebar-narrow 320`
- **strip 옵션**: 상단 metricStrip(metric pill 모음) — 결과·요약 화면에서만
- **사용**: 결과 + Export 옵션, preview + 액션 사이드바

---

## 5. Two-Column — 동등 2분할

```
┌────────────────────────────────────┐
│  [App Header]                      │
├────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐│
│  │  left        │  │  right       ││
│  │  preview     │  │  details     ││
│  │              │  │              ││
│  └──────────────┘  └──────────────┘│
└────────────────────────────────────┘
```

- **body**: `padding: [24, 28]`, `gap: 24`, `layout: horizontal`
- **자식**: left + right 각각 `fill_container`(또는 동일 hardcode 폭)
- **사용**: 좌/우 동등 비교 (대조 보기 / split view)

---

## 6. Three-Column — 좌 사이드 + 메인 + 우 사이드

```
┌────────────────────────────────────┐
│  [App Header]                      │
├────────────────────────────────────┤
│  ┌──┐  ┌──────────────┐  ┌──────┐  │
│  │L │  │  main        │  │  R   │  │
│  │  │  │  workspace   │  │      │  │
│  │  │  │              │  │      │  │
│  └──┘  └──────────────┘  └──────┘  │
└────────────────────────────────────┘
```

- **body**: `padding: [24, 28]`, `gap: 24`, `layout: horizontal`
- **자식**: sidebar-left + main `fill` + sidebar-right
- **사이드 폭**: 각 `sidebar-narrow 320` (좌·우 대칭) 또는 비대칭 (예: 340 / 300)
- **사용**: 라이브 녹음(컨트롤 + 자막 + 화자), 화자 정정 (요약 + 본문 + 옵션)

---

## 7. Dialog Overlay — backdrop + 중앙 dialog

```
┌────────────────────────────────────┐
│  [App Header (dimmed)]             │
├────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░    ┌──────────┐    ░░░░░░░│
│ ░░░░░░░    │  dialog  │    ░░░░░░░│
│ ░░░░░░░    │ message  │    ░░░░░░░│
│ ░░░░░░░    │[actions] │    ░░░░░░░│
│ ░░░░░░░    └──────────┘    ░░░░░░░│
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└────────────────────────────────────┘
```

- **frame**: `layout: none` (absolute), App Header + backdrop 절대 배치
- **backdrop**: `fill: #00000099` (또는 `#00000080`), `justifyContent: center`, `alignItems: center`
- **dialog**: `card-dialog 520`, `cornerRadius: 16`, `padding: 24`, shadow `blur 48 offset (0,24) #00000099`
- **사용**: Export 완료 다이얼로그, Vault 충돌, 저장 실패 — 사용자 결정 필요한 인터럽트

---

## 카드 폭 토큰

| 토큰 | px | 용도 |
|:---|---:|:---|
| `card-narrow` | 600 | Centered hero, Stack 폼/안내 |
| `card-default` | 880 | Stack 메인 폼 / Settings |
| `card-wide` | 1080 | Stack 큰 업로드 / 프리뷰 |
| `card-full` | fill | Sidebar/Two-Col/Three-Col main 영역 |
| `card-dialog` | 520 | Dialog overlay 안 dialog box |

## 사이드바 폭 토큰

| 토큰 | px | 용도 |
|:---|---:|:---|
| `sidebar-narrow` | 320 | Three-Column 좌·우, Sidebar-Right export 옵션 |
| `sidebar-default` | 520 | Sidebar-Left 큰 list 영역 |

## body padding/gap 표준

| 토큰 | padding | gap | 적용 variant |
|:---|:---|:---|:---|
| `body-default` | `[32, 40]` | 24 | Stack (모든 폭 변형) |
| `body-compact` | `[24, 28]` | 20~24 | Sidebar / Two-Col / Three-Col (콘텐츠 밀집) |
| `body-hero` | `40` 단일 | 24 | Centered (hero 화면) |

## variant 결정 가이드

- 단일 메시지·CTA 1개 → **Centered**
- 카드 여러 개 vertical → **Stack** (폭 결정 → narrow / default / wide)
- 좌 list + 우 작업 → **Sidebar-Left**
- 메인 + 우 옵션 (옵션 적음) → **Sidebar-Right** (strip 필요하면 동반)
- 좌·우 동등 비교 → **Two-Column**
- 좌 + 메인 + 우 모두 사이드 → **Three-Column**
- backdrop + 인터럽트 → **Dialog**

## Canvas Zoning — 캔버스 영역 좌표 컨벤션 (System-first 5 영역)

큰 시안(시스템·컴포넌트 카탈로그·화면 다수·legacy 화면 등 혼재)은 좌표를 영역별로 분리한다. 시안 열어 줌아웃 했을 때 어떤 영역이 무엇인지가 한눈에 파악되도록.

**system-first 온톨로지 순서** (좌→우 = 추상 시각 system → 구체 narrative):

```
                                X axis (left → right)

  ┌──────────┬─────────────────────┬──────────┬──────────────────────────┬──────────────┐
  │  Design  │  Component          │  IA Map  │   Storyboard             │   Reference  │
  │  System  │  Showcase           │          │   (Lanes R1·R2·…)        │   Archive    │
  │ (tokens) │  (reusable+         │ (사이트맵│   (라벨+미니맵+풀사이즈) │   (legacy)   │
  │          │   variants)         │  /구조도)│                          │              │
  └──────────┴─────────────────────┴──────────┴──────────────────────────┴──────────────┘
       1              2                3                  4                      5
   foundation       parts          structure          screens               legacy
```

| # | 영역 | x 좌표 (예시) | 내용 | 의미·비고 |
|:--:|:---|:---|:---|:---|
| 1 | **Design System** | x: 6000~7000 | 토큰(color·typography·rounded·spacing) + 시스템 카탈로그 페이지 | 모든 디자인의 시각 foundation. 좌측 anchor |
| 2 | **Component Showcase** | x: 8000~11000 | 각 reusable 컴포넌트의 sub-zone (main definition + variants 카드 grid) | DS를 사용해 조립한 부품. variants는 별도 zone 안 만들고 여기에 통합 |
| 3 | **IA Map** | x: 11500~ (showcase 우측) | 사이트맵·정보 구조도·route 트리·navigation 모델 | 부품으로 조립할 화면들의 macro 구조 |
| 4 | **Storyboard** | x: 12000~ | narrative 축 lanes(R1·R2·...) + 미니맵 + 풀사이즈 슬라이드 | IA Map을 narrative로 풀어낸 구체 화면 (메인 작업 영역) |
| 5 | **Reference Archive** | x: 30000+ | legacy / narrative 무관 / 폐기 검토 | 메인에서 충분히 떨어진 외곽 (5000+ gap) |

**system-first 채택 근거**:
- Design System foundation을 우선 정립한 후 컴포넌트 → 화면으로 진행하는 시스템 우선 흐름
- IA Map은 컴포넌트 정의 후 Storyboard로 진입하기 직전, "부품으로 어떤 화면들을 어떤 구조로 만들지" 의 macro 결정
- 좌→우 순서 = 추상도(시스템) → 구체도(인스턴스)

### Component Showcase sub-zone 구조

각 reusable 컴포넌트마다 sub-zone:

```
  ┌──────────────────────────────────────────────────────┐
  │  ▌ FileBrowser                                       │ ← sub-zone 헤딩
  │                                                      │
  │   [FileBrowser]   [FB/Empty]   [FB/1 item]   [FB/N]  │ ← main + variants
  │     (reusable)     (variant)    (variant)     (...)  │
  │                                                      │
  └──────────────────────────────────────────────────────┘

  (gap ~120px)

  ┌──────────────────────────────────────────────────────┐
  │  ▌ ConversionTable                                   │
  │                                                      │
  │   [ConversionTable]   [CT/Loading]   [CT/Completed]  │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

- **main reusable**: 기존 `reusable=true` 컴포넌트 정의 (변경 없음)
- **variants**: 같은 컴포넌트의 visual variant 카드. 자연 크기 허용 (강제 1320×920 없음). 컴포넌트 본연 크기에 맞춰 자유
- **stroke**: 일반 `$border-subtle` (Lane의 branch warning 표기 ❌)
- **naming**: variant 카드 `Component/VariantLabel` — 예: `FileBrowser/Empty`, `FileBrowser/N items`, `ConversionTable/Loading`. (`reference/naming-rules.md`)

### Variant·State 표현 모델 (ref + descendants override)

Pencil `.pen` schema에는 **마스터 컴포넌트 자체에서 variant를 토글해 보는 정식 메커니즘이 없다** (Figma의 component property / variant matrix 같은 기능 부재). 마스터(`reusable: true` frame)는 default 트리 1개만 가지고, "다른 상태"는 ref instance 쪽 `descendants` override로 표현하는 모델.

| 보고 싶은 곳 | 가능 여부 | 방법 |
|:---|:---:|:---|
| 마스터 컴포넌트 자체 (예: TCDpF) | ❌ | 마스터는 항상 default 트리 1개. variant 토글 불가 |
| Component Showcase 캔버스 | ✓ | main(예: VsqcK) + variant card(예: MdzL3) 두 개를 sub-zone 안에 나란히 두는 현재 패턴이 사실상 "matrix 뷰" |
| 시안 안 임의 위치 (Storyboard 슬라이드 등) | ✓ | `ref` + `descendants` override로 어디든 instance 추가 가능 |

즉 "마스터 안에서 한 번에 모든 variant 보기"는 불가, "Showcase에 main + variant 카드 나열해서 한 번에 보기"가 우리 컨벤션이다.

#### 권장 구현 패턴 (sds-web 사례)

```js
// main = TCDpF 마스터 그대로 ref (기본 상태)
mainRef = I("VsqcK", { type: "ref", ref: "TCDpF", width: 360, height: "fill_container" })

// variant card = 같은 마스터를 ref하되 특정 slot만 descendants override
emptyRef = I("MdzL3", {
  type: "ref",
  ref: "TCDpF",
  width: 360,
  height: "fill_container",
  descendants: {
    "8EL7U": {  // override할 자식 slot의 ID
      type: "frame",
      name: "fListEmpty",
      layout: "vertical",
      alignItems: "center",
      justifyContent: "center",
      // ... 빈 상태 콘텐츠
    }
  }
})
```

이 패턴의 효과:
- **frame-level 속성 자동 전파**: main 마스터의 padding·stroke·crumb·width·title block 위치 등이 변경되면 모든 variant·instance에 자동 반영
- **slot만 stale**: `descendants[<id>]`로 children 통째 override한 영역만 stale (`batch-design-pitfalls.md` #5)
- **단일 SSOT**: 마스터 1개 + ref instance 다수 → 컴포넌트 정의가 한 곳에 모임

#### 안티패턴 (피하기)

- ❌ **variant card 안에 직접 frame을 그려넣기** (ref 없이) — main 마스터 변경이 전혀 전파되지 않음. 컴포넌트의 시각 정합성 잃음
- ❌ **각 상태마다 별도 reusable component 등록** (FileBrowser/Empty를 별도 마스터로) — main ↔ variant 간 동기화 수동, 노력 큼. **단** 정말로 시각·구조가 크게 다른 경우(예: Mobile vs Desktop)는 별도 마스터가 정당

variant 카드는 **항상 main 마스터를 ref + descendants override로 등록**한다. 직접 그린 frame 금지. 같은 룰이 Storyboard 슬라이드 안 instance에도 적용 — 슬라이드의 빈 상태·error 상태 등은 마스터 ref + descendants override로 표현.

#### 마스터 default = 가장 일반적 상태

마스터 컴포넌트(`reusable: true`)의 default 트리는 **선택 없음·빈 상태·idle 등 "가장 보편적이며 다른 상태들의 base가 되는 모습"**으로 정의한다. selected·hover·focused·loading 같은 특수 상태는 ref instance에서 descendants override로 표현.

이유: 마스터가 default를 selected/특수 상태로 두면, ref instance가 아무것도 override하지 않을 때 그 특수 상태가 그대로 노출된다 → "다른 ref instance도 같은 마스터인데 특수 상태가 default"라는 모순. lane 안 시각 중복의 흔한 원인.

위반 패턴 (CND-1191 사례): TCDpF 마스터 default에 한 행이 selected(stroke-left + convert button 노출)인 채로 두고, "선택 전 화면" R1-01과 "선택 후 화면" R1-03이 둘 다 마스터 ref 그대로 → 시각 동일.

수정 패턴: 마스터의 selected stroke·active button 노출 제거 → "선택 없음"이 default. R1-03만 ref + descendants override로 selected 부여 (`stroke: { left: 3 }`, `convertBtn enabled: true`).

#### 한 Lane 내 시각 중복 금지

스토리보드 lane 안의 슬라이드들은 **모두 시각적으로 변별 가능해야 한다**. 두 슬라이드가 의도(라벨·메타)는 다르지만 픽셀이 동일하면 lane에 두지 않는다 — 개발자가 둘을 별개로 만들어야 한다는 신호가 안 잡힘. 한 슬라이드로 충분히 그 단계를 설명할 수 있는가가 기준.

다른 lane 또는 다른 컨텍스트(예: lane vs Showcase)에서는 같은 시각의 재등장 허용. **lane 안 중복만 금지**.

검증: 인접 슬라이드를 batch_get으로 비교해 frame-level 속성 + descendants override가 모두 동일한 ref instance가 있으면 시각 중복. 마스터 default를 정비(위 룰)하거나 한 슬라이드에 visual override를 부여해 변별. 통합 가능하면 통합.

#### 작은 시각 변화도 Storyboard lane + Showcase variant 양쪽 표현

다이얼로그·overlay·toast 등 **부분 영역 시각 변화도 lane 흐름에서는 별도 풀사이즈 슬라이드로 표현**한다. 변화량이 작아 보이지만 흐름에서는 결정적 단계 — 사용자가 어떤 단계를 거쳐 도달했는지 lane으로 읽혀야 한다.

동시에 **같은 variant를 Showcase에도 카드로 등록**해 main + variants 매트릭스 뷰 보존. Storyboard lane ref와 Showcase variant 카드 양쪽이 같은 마스터를 ref + 동일 descendants override를 가짐 = 의도된 중복(흐름 가독성 + 시스템 매트릭스 동시 충족).

| 위치 | 표현 | 목적 |
|:---|:---|:---|
| Storyboard lane | 마스터 ref + override를 풀사이즈 frame 안에 배치 | 흐름 단계 가독성 |
| Component Showcase sub-zone | 같은 마스터 ref + 같은 override를 카드 한 장으로 | 시스템 매트릭스 (main + variants) |

일관성 유지 (도구 미지원, 수동 검증):
- Storyboard slide의 dialog ref instance와 Showcase variant 카드의 descendants override 키·값이 동일해야 함
- 한쪽이 변경되면 양쪽 동기화
- variant 사례: ConfirmDialog/Block, ConfirmDialog/Progress, ConfirmDialog/Failure, ConfirmDialog/Complete (CND-1191 sds-web)

#### Variant 배치 컨벤션 (V-1 ~ V-5)

##### V-1. 카드 형식 = Wrap frame (필수)

모든 Showcase 카드(main + variants)는 **outer wrap frame** 형식으로 통일. bare ref 단독 금지.

**Wrap frame 사양**:
- `reusable: false`, name `"Component — <Name>"` 또는 `"Component — <Name> / <VariantLabel>"`
- fill `#FAFAFA`, cornerRadius 8, stroke `$border` 1, **padding `[24, 24, 24, 24]` (상하좌우 균일 24)**
- layout `vertical`, gap 18, clip `true`
- 자식: titleRow + 본체(마스터 또는 ref + override)

**titleRow 사양**:
- horizontal, alignItems `end`, justifyContent `space_between`, **padding `[0, 0, 0, 0]`** (wrap이 좌우 24 처리)
- 자식: titleCol(kicker `"COMPONENT"` + title) + meta(`<ref-id>` 또는 `<ref-id> · <variant>`)

**카드 width 결정**: sub-zone 안 모든 카드(main + variants)는 같은 outer width로 통일. width = 가장 큰 본체 width + 48 (좌우 padding 24×2). 작은 variant는 본체가 wrap 안에서 좌측 정렬(default `alignItems: start`).

**main의 트리 형식 옵션** (component 따라 유연):

| 옵션 | 설명 | 권장 사용 |
|:---|:---|:---|
| (M-α) wrap의 직접 자식이 마스터 | 마스터 reusable=true 노드를 wrap 안에 트리 자식으로. wrap이 마스터 컨테이너 | 새 컴포넌트 만들 때 / 기존 마스터를 reparent해도 안전한 경우 |
| (M-β) wrap 안에 ref to 마스터 | 마스터는 다른 zone에 두고 main wrap은 ref만 | 마스터를 별도 카탈로그 zone에 두고 싶을 때 |
| (M-γ) wrap이 마스터의 시각적 형제 | 마스터는 top-level, wrap은 시각 decoration. 트리 형제이지만 시각상 wrap 안에 마스터가 보이도록 좌표·크기 정렬 | 기존 마스터 reparent가 위험할 때 (`pitfalls.md` #1 M 함정 회피) |

**variants의 트리 형식**: 항상 wrap 안에 ref to 마스터 + descendants override. 단일 패턴.

**M reparent 안전 패턴** (M-α 적용 시): 새 wrap을 만든 뒤 `M(masterId, wrap, idx)`. 원본 부모(document) D는 절대 호출하지 않음 — pitfalls #1 부작용 회피. ref instance ID는 유지되므로 모든 ref 인스턴스 정상 동작.

##### V-2. Sub-zone 배치 좌표

```
sub-zone heading (▌ Component) at (sub-zone-x, sub-zone-y - 44)
  fontSize 18 / fontWeight 600 / fill $fg

main card     at (sub-zone-x,             sub-zone-y)
variant 1     at (sub-zone-x + pitch,     sub-zone-y)
variant 2     at (sub-zone-x + pitch * 2, sub-zone-y)
...
pitch = card-width + 40 (gap)
```

**카드 크기**: 모든 카드(main + variants) 동일한 outer width 유지. ref 본체 width와 무관하게 wrap frame 외곽 크기로 정렬. ref override는 `width`/`height` 변경 없이 descendants만(`pitfalls.md` #7 fragment 함정 회피).

**Sub-zone 간 vertical pitch**: 가장 큰 카드 outer height + 40~80 gap (heading 26 + heading-card gap 18 포함). 인접 sub-zone heading이 위 sub-zone 카드 끝보다 아래(더 큰 y)에 위치하도록 검증.

##### V-3. Variant 순서

main 첫 번째. variants는 다음 우선순위:

1. **Lane 출현 순서** (Storyboard에서 등장한 순서) 우선 — lane 흐름과 매칭
2. **시각 강도** 차순 (default → loading → error 등) — lane 흐름이 없을 때
3. ABC 정렬은 회피 — 불필요한 alphabet 강제

##### V-4. Variant Wrap-around (줄바꿈)

variants 4개 이상일 때 줄바꿈 가능. 단 row 분리는 sub-zone 안 그루핑(예: status variants vs interaction variants) 의미가 명확할 때만. 일반 wrap-around은 회피 — 한 row가 더 일관적.

##### V-5. 카드 라벨링

- **main 카드**: title `<Name>` (variant suffix 없음). meta에는 마스터 ref ID + ` · main`
- **variant 카드**: title `<Name> / <VariantLabel>`. meta에는 마스터 ref ID + ` · <variantLabel>`
- kicker는 항상 `"COMPONENT"` (대문자, fontFamily Geist Mono, fontSize 11, fontWeight 600, fill `$fg-muted`, letterSpacing 0.9)
- title fontFamily Satoshi(또는 heading 토큰), fontSize 18, fontWeight 700, fill `$fg`
- meta fontFamily Geist Mono, fontSize 11, fontWeight 500, fill `$fg-muted`

### 분류 의사결정 트리 (Storyboard vs Showcase)

```
이 슬라이드는 ...
├─ 다음 흐름 step이 다른가? (분기 outcome)
│  └─ Yes → Storyboard zone, Lane branch row
└─ No (다음 흐름 동일) →
   ├─ 같은 컴포넌트의 visual variant인가? (data·상태 차이)
   │  └─ Yes → Component Showcase zone, 해당 컴포넌트의 sub-zone에 variant 카드로
   └─ No → Storyboard zone, Lane main (대표 1장)
```

### 좌표 사이 pitch 표준

- 슬라이드 가로 pitch: 화면 width + 40 (예: 1320 → 1360)
- 슬라이드 세로 pitch (lane 분리): 화면 height + 200 (예: 920 → 1120) 또는 lane 미니맵·라벨 포함 시 +1000~ (예: 920 → 1920)
- 영역 간 분리: 5000~10000 (줌아웃 시 영역 경계 즉시 인지)

### 영역 라벨

각 영역의 좌상단에 큰 텍스트 라벨을 둔다 (fontSize 32+, fontWeight 700, fontFamily heading 토큰). 시안 첫 진입 시 "여기는 무슨 영역" 이 명시적으로 보이게.

### 영역 추가 시 결정 사항

새 영역(예: "v2 Wireframes", "Migration Plan") 이 생기면:
- 기존 영역 옆에 둘지(시각적 인접성), 아래에 둘지(시간 흐름)
- 경계 분리(5000+)·라벨·border (subtle 1px stroke 권장)
- README 또는 design.md 에 영역 좌표 표 갱신

### Lane 확장 시 다른 lane 일괄 y 이동 워크플로우

한 lane 에 multi-row(미니맵 분기 row 또는 풀사이즈 row)가 추가되어 lane height 가 커질 때:

1. **변경 전 인벤토리** — `snapshot_layout(maxDepth: 0)` 으로 현재 모든 lane 의 y / height 수집
2. **새 height 계산** — 변경 lane 의 신규 height = (미니맵 row 수 × 160) + (풀사이즈 row 수 × 1020) + 여백 (lane 라벨 내부 padding 포함)
3. **delta 산출** — `Δy = 새 height - 기존 height + lane 간 gap`
4. **batch 갱신** (한 batch 안):
   - 변경 lane 자체: `U(laneId, { height: <새 height> })`
   - 변경 lane 의 라벨 frame: `U(laneLabelId, { height: <새 height>, y: <기존 그대로> })` (y 동일, height 만)
   - 그 아래 모든 lane: `U(<lane-id>, { y: <기존 y + Δy> })` 일괄
   - 그 아래 모든 lane 의 라벨 frame: `U(<labelId>, { y: <기존 y + Δy> })` 일괄
5. **검증** — `snapshot_layout` 로 lane 좌표 무충돌 (인접 lane 간 gap 유지) 확인

흔한 누락:
- **lane 라벨 frame의 height 갱신 누락** — lane height 변경됐는데 라벨 frame 은 옛 height 인 채. 시각적으로 라벨이 lane 아래쪽 빈 공간 안 채움
- **그 아래 lane 의 라벨 frame y 이동 누락** — 데이터 lane 은 이동됐는데 라벨 frame 은 옛 y 에 남아 다른 lane 위에 겹침

라벨 frame 은 lane 본체와 같은 grid 에 있는 별도 frame 이므로 본체와 함께 짝으로 갱신.

---

## 매핑 사례 (mlx-meeting-scribe 시안)

| 화면 | variant | 카드 폭 | 사이드바 |
|:---|:---|:---|:---|
| 01 첫 실행 | Stack | narrow 600 | — |
| 01b Sessions 리스트 | Stack | default 880 | — |
| 02 모델 워밍업 | Centered | narrow 600 | — |
| 03 라이브 녹음 | Three-Column | main fill | 340 / 300 |
| 04 화자 라벨링 | Sidebar-Left | main fill | 520 |
| 04c 솔로 스킵 | Centered | narrow 600 | — |
| 05 결과 + Export | Sidebar-Right | main fill | 320 (strip 동반) |
| 05b Export 완료 | Dialog | dialog 520 | — |
| 06 화자 정정 | Three-Column | main fill | 320 / 320 |
| 07 Settings | Stack | default 880 | — |
| 08 동영상 업로드 | Stack | wide 1080 | — |
| 08b 타임라인 | Stack-wide 또는 Two-Col | (콘텐츠 따라) | — |
| 09 오디오 import | Stack | narrow 600 | — |
| EX01~EX09 다이얼로그형 | Dialog | dialog 520 | — |
| EX02/EX03 Stack형 | Stack | narrow 600 | — |
