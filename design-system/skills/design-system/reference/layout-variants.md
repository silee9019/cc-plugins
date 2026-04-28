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
