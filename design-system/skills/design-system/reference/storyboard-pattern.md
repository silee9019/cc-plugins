# 스토리보드 패턴 — 텍스트 카드 미니맵

**미니맵 = 텍스트 카드** (작은 frame + 카드 안에 step 번호 · 짧은 제목 텍스트, 카드 위 외부 라벨 = `<Lane code>-<step>`). 본 화면의 시각 미니어처가 아니다.

**SSOT 정책**: Lane 안 텍스트 카드 = **원본**(`reusable: true`). 별개 스토리보드 슬라이드 안 카드 = **파생**(`type: ref`, Lane 카드를 가리킴). 같은 본체를 가리키므로 Lane 카드 변경 시 스토리보드 카드는 자동 동기화 — 변경은 항상 Lane 카드(SSOT)에서.

이 패턴은 lane 안 미니맵 행, 별개 스토리보드 슬라이드, 둘 다 모두 valid. 표현 방식 3 옵션을 시안 용도에 따라 선택한다.

## 표현 방식 3 옵션

| 옵션 | 표현 방식 | 적합 시점 |
|:---|:---|:---|
| A | 화면 슬라이드 자체 + lane 위 텍스트 카드 행 | design work 중심 (한 시나리오 깊게) |
| B | 별개 스토리보드 슬라이드(lane × steps 격자) + 풀사이즈 화면들은 별도 영역 | narrative review 중심 (presentation·회의·온보딩) |
| <u>**C**</u> | <u>**둘 다** (lane 안 미니맵 + 별개 스토리보드 슬라이드)</u> | <u>**두 용도 다 — 권장 기본값**</u> |

권장 이유:
- C: lane 안 미니맵(SSOT)은 design work 중 시나리오 컨텍스트 유지에 유용. 별개 스토리보드 슬라이드(파생, ref instance 모음)는 stakeholder review/presentation 1 화면 narrative 전달에 유용. **Lane 카드 변경 시 스토리보드는 자동 동기화** (ref).
- A: design work 만 한다면 충분. 그러나 stakeholder 회의용 보드를 시안 안에 두고 싶을 때마다 별도로 만들어야 함.
- B: presentation 만 한다면 충분. 그러나 한 시나리오 디자인 작업 시 lane = 시나리오 컨텍스트가 약해짐. B 단독은 SSOT가 스토리보드 슬라이드 자체.

### 옵션 도면

```
옵션 A — design work 중심
┌─ Lane R1 — 변환·요구사항 추출 ──────────────────────────┐
│ [라벨]  [Card 1/5] → [Card 2/5] → [Card 3/5] → ...     │
│         [풀사이즈 1320×920 화면 5장]                     │
└────────────────────────────────────────────────────────┘

옵션 B — narrative review 중심
┌─ [Zone] Storyboard — 새 모델 축 ─────────────────────────┐
│  Lane R1  [Card] → [Card] → [Card] → [Card] → [Card]   │
│  Lane R2  [Card]                                       │
│  Lane R4  [Card] → [Card] → [Card]                     │
└────────────────────────────────────────────────────────┘
(별도 영역) [Zone] Wireframes / [Zone] Fullsize Screens

옵션 C — 둘 다 (권장 기본값, SSOT 정책)
- 각 Lane 영역에 옵션 A 미니맵 행 (reusable=true, SSOT) + 풀사이즈
- [Zone] Storyboard 영역에 옵션 B 슬라이드 1장 — 카드는 모두 Lane 카드 ref instance (파생)
- Lane 카드(원본) 변경 → 스토리보드 카드(ref) 자동 반영
```

## 패턴 1 — Lane 텍스트 카드 행 만들기 (SSOT)

Lane 안에 reusable=true 텍스트 카드 행. 본 시안의 narrative SSOT.

```js
// Lane 안 텍스트 카드 행
cardRow = I(laneId, { type: "frame", layout: "horizontal", gap: 16, padding: [8,12], height: 100 })
U(cardRow, { layout: "horizontal" })

// 텍스트 카드 1장 (reusable=true, SSOT)
card1 = I(cardRow, { type: "frame", layout: "vertical", width: 160, height: 80,
                      padding: 10, gap: 4, fill: "$surface",
                      stroke: { thickness: 1, fill: "$border" }, cornerRadius: 4,
                      reusable: true, name: "Card · R1·1" })
I(card1, { type: "text", content: "01", fontSize: 10, fontWeight: "600",
           fill: "$fg-muted", fontFamily: "Geist Mono, monospace" })
I(card1, { type: "text", content: "변환 작업대", fontSize: 12, fontWeight: "600",
           fill: "$fg", fontFamily: "Geist, Noto Sans KR, sans-serif",
           textGrowth: "fixed-width", width: "fill_container" })

// 카드 위 외부 라벨 (lane 행과 별도, top text)
I(cardRow, { type: "text", content: "R1-01", fontSize: 10, fontWeight: "600",
             fill: "$fg-secondary", fontFamily: "Geist Mono, monospace" })

// 화살표
I(cardRow, { type: "icon_font", iconFontFamily: "lucide", iconFontName: "arrow-right",
             width: 20, height: 20, fill: "$fg-muted" })
```

토큰: `card-mini 160×80`, gap 16, padding 10, cornerRadius 4. 카드 안 텍스트(번호+제목) vs 카드 위 외부 라벨(`<Lane code>-<step>`)의 분담은 `naming-rules.md` "텍스트 카드 안 컨텐츠 표준" 참조.

## 패턴 2 — 별개 스토리보드 슬라이드 (옵션 B / C, ref instance 모음)

`[Zone] Storyboard` 영역에 큰 frame 1장. **카드는 모두 Lane 안 카드의 ref instance** (옵션 C 의 SSOT 정책). lane 좌측에 lane 라벨, 우측에 ref instance 시퀀스.

```js
// 별개 스토리보드 슬라이드 (top-level, frame name "Storyboard — 새 모델 축")
storyboard = I(document, { type: "frame", layout: "vertical", padding: [40, 40],
                            gap: 32, fill: "$bg",
                            stroke: { thickness: 1, fill: "$border" },
                            name: "Storyboard — 새 모델 축" })

// 헤더
I(storyboard, { type: "text", content: "Storyboard — 새 모델 축",
                 fontSize: 28, fontWeight: "700", fill: "$fg",
                 fontFamily: "Satoshi, Noto Sans KR, sans-serif" })

// Lane R1 행
laneR1Row = I(storyboard, { type: "frame", layout: "horizontal", gap: 24, alignItems: "center" })
U(laneR1Row, { layout: "horizontal" })
I(laneR1Row, { type: "text", content: "R1 — 변환·요구사항 추출",
                fontSize: 14, fontWeight: "600", fill: "$fg-secondary",
                fontFamily: "Geist, Noto Sans KR, sans-serif", width: 240,
                textGrowth: "fixed-width" })
laneR1Cards = I(laneR1Row, { type: "frame", layout: "horizontal", gap: 16 })
U(laneR1Cards, { layout: "horizontal" })

// 카드는 ref instance — Lane 카드(reusable=true)를 가리킴
// width/height는 Lane 카드와 동일(160×80) → 좌상단 fragment 함정 회피
I(laneR1Cards, { type: "ref", ref: "<R1·1 카드 본체 id>", x: 0, y: 0 })
I(laneR1Cards, { type: "icon_font", iconFontFamily: "lucide", iconFontName: "arrow-right",
                  width: 20, height: 20, fill: "$fg-muted" })
I(laneR1Cards, { type: "ref", ref: "<R1·2 카드 본체 id>", x: 0, y: 0 })
// ...
```

**SSOT 데이터 흐름**: 카드 텍스트 변경은 Lane 카드(본체)에서만 — `batch_design U(<Lane 카드 자식 text id>, { content: "<새 라벨>" })`. ref instance 는 자동 반영. 본 슬라이드 안에서 직접 텍스트 수정 시도 시 분리(stale)된다.

**ref instance width/height**: Lane 카드와 동일(160×80) 유지. override 다르게 하면 `batch-design-pitfalls.md` 7번(ref fragment) 함정.

## Lane Label column 사양

각 Lane은 좌측에 세로형 label column을 둔다 (lane 식별 + 한 줄 설명).

```
┌────────────────────┐
│ LANE R1            │ ← tag (fontSize 14, fontWeight 700, fill $fg-muted, letterSpacing 1.5)
│                    │
│ SDS 임포트          │ ← title (fontSize 32, fontWeight 700, fill $fg, fontFamily 헤딩 토큰)
│                    │
│ SDS docx 업로드·   │ ← desc (fontSize 16, fontWeight normal, fill $fg-secondary,
│ pandoc 변환·…       │           lineHeight 1.5, textGrowth fixed-width)
└────────────────────┘
```

규칙:
- 컨테이너: `layout: "vertical"`, `gap: 8`, `padding: [24, 20]`, `fill: "$surface"`, **`justifyContent: "start"`** (top 정렬)
- 컨테이너 width = 540 (storyboard column 표준), height = lane 영역 전체 (풀사이즈 row 수 × 1020 + 미니맵 row 수 × 160 + 여백)
- 텍스트 3줄 구조: tag + title + desc
- **top 정렬 필수**: lane height가 아무리 길어도 텍스트는 column 위쪽에 고정. `justifyContent: "center"` 두면 lane 안 콘텐츠와 vertical 위치가 어긋나 첫 슬라이드와 라벨 매칭이 흐려짐
- 텍스트 크기는 lane 안 미니맵 카드(160×100 정도)·풀사이즈 슬라이드의 콘텐츠와 시각 위계를 명확히 구분할 만큼 큼 — title 32가 미니맵 카드의 11~12 fontSize 대비 약 3×, lane 식별이 줌아웃에서도 잘 보임

## 패턴 3 — lane 하단 풀사이즈 행 (옵션 A / C) — multi-row 적용

lane 안 풀사이즈 화면들을 가로로 배치. **미니맵 row 와 1:1 대응되도록 풀사이즈도 multi-row** 로 둔다 (분기 흐름이 미니맵에만 보이고 풀사이즈는 평행 grid 가 되는 mental model 깨짐 방지).

```
Lane R1 — 요구사항 추출 (height ~3440)
┌────────────────────────────────────────────────────────────┐
│ [Lane 라벨]  Minimap Row · main:   [▭][▭][▭][▭][▭][▭][▭]   │  ← y 미니맵 main
│              Minimap Row · branch1:        ↳[▭]    ↳[▭]    │  ← y 미니맵 분기1
│              Minimap Row · branch2:                ↳[▭]    │  ← y 미니맵 분기2
│              Fullsize Row · main:  ▭ ▭ ▭ ▭ ▭ ▭ ▭            │  ← y 풀사이즈 main
│              Fullsize Row · branch1:    ▭   ▭                │  ← y 풀사이즈 분기1
│              Fullsize Row · branch2:        ▭                │  ← y 풀사이즈 분기2
└────────────────────────────────────────────────────────────┘
```

규칙:
- 풀사이즈 row 각각은 미니맵 row 와 같은 col pitch(예: 1360) 유지 — 분기 시점 카드의 x 좌표가 미니맵·풀사이즈에서 일치
- Lane height 는 (풀사이즈 row 수 × 1020) + (미니맵 row 수 × 160) + 여백 — multi-row 추가 시 lane height 갱신, 그 아래 lane 들 일괄 y 이동 (D 워크플로우 참조)
- 풀사이즈 row frame 이름: `Fullsize Row · main`, `Fullsize Row · <branch tag>`

선택지(SSOT 위치):
- **(옵션 A / C)** 풀사이즈를 lane 안 multi-row 에 두고 그 자체가 SSOT
- **(옵션 B 분리)** 풀사이즈 화면을 별도 영역(`[Zone] Fullsize Screens`)에 두고 lane 안에는 미니맵만 — 풀사이즈 SSOT 는 별도 영역에

## 패턴 4 — 분기 표현: multi row

예외·분기 흐름은 **lane 안 multi row** 로 표현한다. 한 lane 의 미니맵 행을 여러 개 두고, 각 row 가 main 시퀀스 또는 분기 흐름을 담는다. row 사이는 분기 시점에서 떨어지는 화살표(↳)로 연결.

```
Lane R1 — 요구사항 추출
┌──────────────────────────────────────────────────────────┐
│ Row main:    [1/5] → [2/5] → [3/5] → [4/5] → [5/5]       │
│ Row block:           ↳ [2-block]                         │
│ Row error:                    ↳ [3-error] → [3-retry]    │
│ Row cancel:                   ↳ [3-cancel]               │
└──────────────────────────────────────────────────────────┘
```

규칙:
- **Row 1 = main** (happy path), 가장 위
- **분기 row 들은 분기 시점 step 의 아래**에 위치, 분기 시작 카드는 main row 의 분기점 step 과 같은 x 좌표
- 분기 카드 step naming: `<main step>-<branch tag>` (예: `3-error`, `3a-error`)
- **분기점 화살표**: main row 의 분기 step 카드에서 ↳ icon (lucide `corner-down-right`) 으로 분기 row 첫 카드 가리킴
- 분기 row 안 카드 사이 → 일반 가로 화살표 (lucide `arrow-right`)

분기 row frame 이름: `Minimap Row · <branch tag>` (예: `Minimap Row · main`, `Minimap Row · error`, `Minimap Row · block`, `Minimap Row · cancel`).

### Branch 카드 시각 강조

분기 row 의 카드는 메인 row 카드와 시각 구분:
- **stroke**: `$warning` 1.5px (메인은 `$border` 1px)
- **prefix 라벨** (카드 안 첫 줄): `0X · BRANCH` (메인은 단순 `0X` 번호) — `$warning` 색, 10px mono, fontWeight 600
- **분기 화살표**: main row 카드 → 분기 row 첫 카드 화살표는 `corner-down-right` 아이콘 + `$warning` 색
- 분기 row 안 가로 화살표(분기 step 사이)는 일반 `$fg-muted` 색

목적: 캔버스 줌아웃 시 분기 시점·분기 흐름이 즉시 식별. 색은 `error`/`warning`/`atom-auto` 토큰 중 시안의 의미 매핑에 따라 선택 (기본 `warning` 권장).

### 콘텐츠 variant vs 분기 구분

분기(branch)와 콘텐츠 variant(같은 시나리오의 변형)는 다른 row 에 둔다:

- **콘텐츠 variant** = 같은 시나리오의 다른 입력·상태 (예: 변환 시점에 docx 가 큰 경우 / 표 중심 / 이미지 중심) → **메인 row 유지**, step naming `<main step>a/b/c`
- **분기 (branch)** = 사용자 액션 또는 시스템 결과로 흐름이 갈라짐 (예: 변환 차단 / 취소 확인 / 변환 실패) → **별도 branch row**, step naming `<main step>-<branch tag>`

기준: "원래 시나리오의 happy path 가 끊겼는가?" Yes → 분기 / No → variant.

### multi lane 으로 분기

multi-row 로 표현하다 다음 신호가 보이면 **lane 분기 옵션을 사용자에게 제안**:

1. **분기 후 후속 화면이 시퀀스로 이어짐** (예: R1-06 취소 → 후속 화면 1장 이상) — 단일 분기 카드는 multi-row OK, 시퀀스(2+ 단계)는 lane 분기 신호
2. **multi-row 4+ 개 누적** — lane 한 영역 안 식별이 어려워짐

제안 시 옵션 표 룰(표 + 권장안 볼드+밑줄)로:
- naming: `R1a` / `R1b` 또는 의미 기준 `R1-happy` / `R1-error`
- 사용자 명시 OK 시에만 lane 분기 실행. **자동 분기 금지**.

## 이름 일관성 검증 (naming rule 기반)

화면 이름이 변경됐을 때 텍스트 카드 라벨도 따라가야 한다. 자동 ref 동기화는 없고, naming rule 일관성으로 보증.

```bash
# 1. design.pen 파싱 → 화면 frame name + 텍스트 카드 안 텍스트 매핑 추출
python3 -c "
import json
with open('design.pen') as f: doc = json.load(f)
# (top-level frames where name matches '<Lane> · <step> — <title>' pattern)
# (text cards anywhere with 'R[0-9]+ · ' prefix)
# 매칭표 출력
"

# 2. 불일치 항목 수집 — 화면 이름 변경됐는데 카드 라벨 이전 값
# 3. batch_design U(cardTextId, { content: "<새 라벨>" }) 일괄 적용 (25 ops 한도 분할)
# 4. snapshot_layout / get_screenshot 로 시각 검증
# 5. 사용자 ⌘S → commit
```

자세한 갱신 워크플로우는 `naming-rules.md` "갱신 워크플로우 (이름 일괄 변경)" 섹션 참조.

## 작업 순서 (스토리보드 도입 시)

1. **인벤토리** — `snapshot_layout(maxDepth: 0)` 으로 모든 화면 frame 좌표·이름 수집
2. **표현 방식 결정** — 옵션 A·B·C 중 시안 용도에 따라. 권장 기본값 C
3. **lane 정의** — `narrative-placement.md` Step 1 (축 결정) + Step 2 (분류표). lane = 기능 시나리오 단위 권장
4. **이름 일괄 정비** — 새 lane code · step #/N 으로 화면 frame 이름 갱신 (`naming-rules.md` 갱신 워크플로우)
5. **lane 영역 생성** — 라벨 + 미니맵 행 (옵션 A/C)
6. **별개 스토리보드 슬라이드 생성** — `[Zone] Storyboard` 안 1장 (옵션 B/C)
7. **풀사이즈 행 또는 별도 영역** — lane 안 풀사이즈 (옵션 A/C) 또는 `[Zone] Fullsize Screens` (옵션 B)
8. **분기 row 추가** — 분기 시나리오마다 multi row (`Minimap Row · <branch tag>`)
9. **시각 검증** — `get_screenshot(storyboardId)` + `get_screenshot(laneId)` + `snapshot_layout`

## 기존 별개 스토리보드 슬라이드가 있는 경우

- **텍스트 카드면 유지**. 라벨 형식이 naming rule 안 따르면 일괄 갱신만.
- **화면 미니어처(image / manual frame mock-up)면 텍스트 카드로 swap**:
  ```js
  // 기존 미니어처 frame을 텍스트 카드 구조로 교체
  R(oldMiniId, { type: "frame", layout: "vertical", width: 160, height: 80,
                  padding: 10, gap: 4, fill: "$surface",
                  stroke: { thickness: 1, fill: "$border" }, cornerRadius: 4 })
  // 카드 안 텍스트 추가 (lane code + 제목)
  ```
- D 권고 없음 — 폐기가 아니라 swap.

## 안티패턴

- 텍스트 카드 자리에 화면 미니어처(image / manual mock-up)를 그려넣음 — 본 화면 변경 시 동기화 끊김 ★ 핵심
- 텍스트 카드 라벨이 naming rule 안 따르고 자유 텍스트 — 검색·일괄 갱신 불가능
- 별개 스토리보드 슬라이드 안에 텍스트 카드를 직접 새로 만듦(SSOT 정책 무시) — Lane 카드(원본) 변경 시 동기화 끊김. **반드시 Lane 카드 ref instance** 로 배치
- 별개 스토리보드 슬라이드의 ref instance width/height 를 Lane 카드와 다르게 override — 좌상단 fragment 만 보이는 함정 (`batch-design-pitfalls.md` 7번)
- 풀사이즈를 single row 로 두고 미니맵만 multi-row — 분기 흐름이 미니맵에만 보이고 풀사이즈는 평행 grid → mental model 깨짐
- 분기 흐름을 별도 lane 으로 자동 분기 — multi lane 은 사용자 명시 요청 시에만 (분기 시퀀스 발생 시 옵션 제안만)
- 분기 row 의 step naming 에 main step 참조 누락 (`error-1` 만 표기) — 분기점 식별 불가, 반드시 `<main step>-<branch tag>`
- variant 와 분기를 같은 row 에 섞음 — variant 는 메인 row, 분기는 branch row
- Branch 카드를 메인 카드와 시각 동일 (`$border` 같은 stroke 색·`BRANCH` prefix 누락) — 분기 시점 식별 불가
- lane 라벨 컬럼 또는 영역 라벨 누락 — 큰 시안에서 줌아웃 시 영역 경계 모호

## 풀스크린 ↔ 미니맵 텍스트 카드 동기 룰

풀스크린 슬라이드와 텍스트 카드(미니맵)는 **항상 동시에 작업한다** — 1:1 매칭 유지.

- 풀스크린 추가 시 미니맵 카드도 같이 추가
- 풀스크린 제거 시 미니맵 카드도 같이 제거
- 풀스크린 step 번호 변경 시 미니맵 카드 step 번호도 같이 갱신
- 풀스크린 콘텐츠 의도 변경 시 미니맵 카드 텍스트도 같이 갱신
- 한쪽만 변경 시 lane 흐름의 미니맵 ↔ 풀스크린 매칭이 어긋나 storyboard 신뢰도 손상

## 와이어프레임 정보 표시는 데이터 흐름 시점과 정합

각 슬라이드의 표시 정보는 **그 시점까지 수집된 데이터로만 구성**한다. 후속 step의 결과를 미리 보여주면 흐름 모순.

사고 사례: R1-03 "docx 선택" 화면 우측 메타 preview에 섹션 트리(pandoc 파싱 결과)를 표시. 그러나 pandoc 변환은 R1-06이라 R1-03 시점엔 파싱 결과 없음 — 표시 모순.

정합 패턴: R1-03은 OS 메타(파일명·크기·수정일·확장자)만 + 섹션 트리는 R1-09 변환 완료 후 R1-10에서 표시.

## 역할 중복 화면 폐기 / 통합

같은 트리거 역할을 수행하는 두 화면이 있으면 한쪽 폐기 또는 다른 화면이 흡수한다.

사고 사례: R1-03 "docx 선택"의 변환 버튼 + R1-04 ConfirmDialog "변환할까요?" — 둘 다 변환 트리거.

정합 패턴:
- R1-03 폐기
- R1-01 후보 탐색이 docx 선택까지 흡수 (FileBrowser row 클릭으로 직관적 선택)
- R1-04 ConfirmDialog가 변환 트리거 단독
- lane 흐름: R1-01 → R1-04 → R1-06 → R1-09 → R1-10

## UI 구현 세부 노출 금지

화면 라벨·콘텐츠에 내부 구현 세부(파일 형식·라이브러리·DB 등)를 그대로 노출하지 않는다. 사용자에게 보일 필요 없는 구현 디테일은 "변환"·"결과" 같은 중립 표현으로.

사고 사례: ConfirmDialog 텍스트에 "Markdown으로 변환할까요?" / "Markdown 76 KB" / "Markdown 열기" — 내부적으로 html을 사용해도 사용자에게 변환 결과 형식은 비공개.

정합 패턴: "변환할까요?" / "76 KB" / "결과 열기" / "변환된 결과는 SDS 데이터베이스에 저장됩니다."

## 참조

- 이름 컨벤션 권위: `naming-rules.md`
- 자리배치 흐름: `narrative-placement.md`
- 캔버스 영역 분리: `layout-variants.md` Canvas Zoning 섹션
- 카드 frame 토큰: `naming-rules.md` "텍스트 카드 안 컨텐츠 표준"
