# batch_design 함정 7종 — op 작성 전 필독

`batch_design` 호출은 시안을 직접 변경하므로 잘못된 op는 사용자 작업물 손실로 이어진다. 아래 5건은 **실제 발생한 함정**이며, op 묶음을 짜기 전 항상 점검한다.

각 항목 형식: 증상 / 원인 / 대안 / 검증.

---

## 1. M(move)의 자식 reference 부작용

### 증상
어떤 노드를 `M(node, newParent, idx)`로 새 부모에 옮긴 뒤, 시각적으로 비어 보이는 원본 부모를 `D(원본)`했더니 **이미 옮긴 자식까지 같이 삭제됨**.

### 원인
`M`은 자식을 새 부모의 children에 추가하지만 **원본 부모의 children list에서 빼지 않는다**(observed behavior, 2026-04). 즉 자식이 두 부모에 동시 등록된 상태가 되고, 어느 쪽이든 D하면 같이 사라진다.

### 대안 (권장도 순)

**A. C(copy) + 원본 D 패턴**
```js
newId = C(원본자식, 새부모, { x: 0, y: ... })
// 원본을 통째 D 하면 원본자식도 같이 삭제되지만 newId는 새 부모에서 살아남음
D(원본부모)
```

**B. 자식부터 D, 원본 D**
```js
D(자식id)         // 새 부모로 옮길 게 없는 경우만
D(원본부모)
```

**C. 원본 부모를 비우지 말고 그대로 둠**
컨테이너가 거추장스러우면 `enabled: false` 또는 이름 변경으로 시각만 숨기고 D는 회피.

### 검증
- 옮긴 후 `snapshot_layout(maxDepth:0)` 으로 자식이 새 부모 위치에 정상 배치됐는지 확인
- D 직전 `batch_get(parentId: 원본, readDepth: 1)`로 children list 확인 — 자식이 보이면 위 패턴으로 분리

### 사고 사례
`reference/incidents.md` #001 — 인터미디엇 화면 6개(8a/8b-pre/8c/9a/9b/9c) 영구 손실.

---

## 2. `replace_all_matching_properties` $variable escape 버그

### 증상
모든 인스턴스에서 fill 토큰을 한 번에 갱신하려고 `replace_all_matching_properties(from:"#10B981", to:"$accent-green")`를 호출했더니 fill이 사라지거나 화면이 통째 망가짐.

### 원인
도구가 `to` 인자의 `$` 를 자동 escape해서 `\$accent-green` literal 문자열로 저장. Pencil이 invalid string으로 해석해 fill을 무효 처리.

### 대안
**`batch_design U()` 만 사용.**
```js
U("nodeId", { fill: "$accent-green" })
// 또는 여러 노드면 batch에 U 여러 줄 나열
```

### 검증
- `batch_get(nodeId, readDepth:1)` 로 fill 값이 `$accent-green` 인지 (`\$accent-green` 아님) 확인
- `get_screenshot(nodeId)` 시각 검증

---

## 3. frame width/height에 변수 참조 미적용

### 증상
`U("frameId", { width: "$size-card-default" })` 같은 토큰 참조를 했는데 frame 폭이 0 또는 fit_content(0)로 나온다.

### 원인
Pencil의 frame `width`/`height` 필드는 `SizingBehavior` 타입으로 해석된다. `$variable` 같은 일반 문자열은 `SizingBehavior` 형식(`fit_content` / `fit_content(N)` / `fill_container`)이 아니므로 `fit_content(0)`로 fallback.

### 대안
- **hardcode px**: `width: 880`
- **컨테이너 비율**: `width: "fill_container"` (부모 layout 안에서)
- **콘텐츠 fit**: `width: "fit_content"`

토큰 폭이 필요하면 design.md `components` 섹션에서 폭을 정의하고, 시안에서는 그 매핑된 hardcode 값을 직접 사용 + 변경 시 양쪽 동기.

### 검증
- 변경 후 `snapshot_layout`로 width 실측치 확인
- 0 또는 fit_content(0)이면 hardcode로 대체

---

## 4. batch_design 첫 I()의 `layout` 명시 누락 빈번

### 증상
`I(parent, {type:"frame", layout:"horizontal", ...})`로 frame 만들고 그 안에 자식 여러 개 추가했는데, 자식이 가로 배치되지 않고 (0,0)에 적층된다.

### 원인
첫 I() 호출 시점에 `layout` 속성이 결과 노드에 누락되는 케이스가 빈번(설계 시안 전반에서 관찰). 이유는 명확치 않으나 batch 안 같은 frame 안 자식이 있을 때 발생률 높음.

### 대안
신규 frame 생성 직후 즉시 `U(id, {layout: ...})`로 명시 update.

```js
g = I(parent, {type:"frame", layout:"horizontal", gap:8, name:"row"})
U(g, {layout:"horizontal"})   // 보강
I(g, {type:"text", content:"..."})
I(g, {type:"text", content:"..."})
```

### 검증
- `batch_get(frameId, readDepth:1)` 결과에 `layout` 속성이 보이는지 확인
- 보이지 않으면 다시 `U(id, {layout:...})`

---

## 5. descendants children 통째 override

### 증상
인스턴스 customization을 위해 `descendants: { childId: { children: [...] } }`로 children 통째 override했는데, 이후 마스터 컴포넌트를 수정해도 변경이 인스턴스에 반영되지 않는다(stale).

### 원인
`children` 통째 override는 마스터의 자식 트리를 인스턴스 안에서 완전히 대체. 마스터가 자식을 추가/변경해도 인스턴스는 자기 사본을 본다.

### 대안 (변경 폭에 따라)

**A. 변경 키만 명시** — 가장 안전
```js
{ ref: "mc-app-header", descendants: {
  "PZ3Bb/h9I6A": { content: "› settings" },
  "bvvg2/Dk2ln": { fill: "$accent-amber" }
}}
```

**B. 자식 swap이 필요하면 R()**
```js
R(instanceId + "/slotId", { type: "frame", layout: "vertical", children: [...] })
```

**C. 노드 add는 일반 frame slot에**
```js
slot = R(instance + "/slot", {type:"frame", layout:"vertical"})
I(slot, {type:"text", content:"..."})
```

### 검증
- 마스터 자식에 더미 변경 → 인스턴스가 자동 반영되는지 확인
- 안 되면 children override 회피하고 변경 키만 명시 패턴으로 재작성

---

## 6. fontFamily 에 `$font-*` 변수 바인딩 미적용

### 증상
text 노드에 `fontFamily: "$font-sans"` 같이 토큰 변수를 바인딩했는데 fallback 폰트(시스템 sans-serif)로 렌더링되거나 batch_design 응답에 `Font family '$font-sans' is invalid` 경고가 나온다.

### 원인
Pencil 의 text `fontFamily` 필드는 `StringOrVariable` 타입이지만 현 시점에서 변수 바인딩이 정상 적용되지 않는 것으로 관찰된다(2026-04). `$font-sans` 가 그대로 literal 문자열로 처리되고 font 매칭 실패.

### 대안
**Raw font stack 문자열을 직접 사용한다.** design.md / get_variables 에서 정의한 토큰의 *값*(예: `"Geist, Noto Sans KR, system-ui, sans-serif"`)을 시안 text 노드에 그대로 붙여넣는다.

```js
// 안 됨
I(parent, { type: "text", fontFamily: "$font-sans", content: "..." })

// 됨
I(parent, { type: "text", fontFamily: "Geist, Noto Sans KR, sans-serif", content: "..." })
I(parent, { type: "text", fontFamily: "Satoshi, Noto Sans KR, sans-serif", content: "..." })   // heading
I(parent, { type: "text", fontFamily: "Geist Mono, monospace", content: "..." })               // mono
```

토큰값 변경 시(예: 회사 폰트 교체) raw stack 들이 시안 전체에 흩어져 있으므로 일괄 갱신은 `batch_design U()` 로 노드 ID 들을 명시 지정해서 처리. (replace_all_matching_properties 는 함정 2번으로 금지)

### 검증
- batch_design 응답에 `Font family '...' is invalid` 경고 없음 확인
- `get_screenshot(nodeId)` 로 의도한 폰트로 렌더링됐는지 시각 확인
- Pencil 이 변수 바인딩을 정식 지원하기 시작하면 본 함정 항목 제거 + 토큰 바인딩으로 일괄 마이그레이션

---

## 7. ref instance width/height override = 좌상단 fragment 만 표시

### 증상
풀사이즈 화면(예: 1320×920)을 reusable 로 두고 lane 안에 작은 thumbnail 으로 보이려고 `ref instance` width/height 를 200×140 같은 작은 값으로 override 했더니, 본 화면이 비율 유지되어 축소된 게 아니라 **좌상단 200×140 영역만 잘려 보인다** (clip fragment).

### 원인
ref instance 의 width/height 는 *표시 영역의 크기* 이고, 본체 frame 의 width/height(1320×920)는 그대로 유지된 채 표시 영역이 잘린다. 본체 자식 트리는 본체 좌표계 기준이라 좌상단(0,0)부터 200×140 만 visible.

비율 유지 자동 축소(thumbnail) 가 아니다.

### 대안
- **A. ref 본체와 같은 width/height 유지** — 텍스트 카드 같이 작은 본체(160×80)를 ref 로 가리키면 fragment 함정 회피. 스토리보드 슬라이드 패턴(`storyboard-pattern.md` SSOT 정책)이 이 케이스
- **B. 본체를 별도 reusable component 로 만들고 thumbnail 전용 변형** — 큰 화면을 thumbnail 로 보이려면 본체 사본(또는 새 컴포넌트)을 thumbnail 크기로 만들고 그것을 ref. 본체와의 동기화는 별도 워크플로우 필요
- **C. thumbnail 기능을 포기하고 텍스트 카드로 대체** — 시각 미니어처 대신 lane code · step · 제목 텍스트 카드. `storyboard-pattern.md` 의 핵심 패턴

### 검증
- ref instance 추가 후 `get_screenshot(refId)` 로 본체 전체가 보이는지 vs 좌상단만 보이는지 확인
- width/height 가 본체와 다르면 fragment 가능성 항상 의심

### 사고 사례
2026-04-29 sds-web 시안에서 풀사이즈 화면 17개를 200×140 ref instance 로 미니맵 만들었더니 모두 좌상단 fragment 만 보임 → 모두 삭제 후 텍스트 카드(C 대안)로 재작성. (`storyboard-pattern.md` 의 텍스트 카드 패턴 도입 계기)

---

## 사전 점검 체크리스트 (op 작성 직전)

- [ ] 자식을 다른 부모로 옮기는 op가 있는가? → M 대신 C + 원본 D
- [ ] D할 컨테이너의 children이 다른 곳에서 참조되는가? → batch_get으로 확인
- [ ] 토큰 갱신을 일괄로 하려는가? → `replace_all_matching_properties` 금지, `batch_design U()` 만
- [ ] 신규 frame을 만드는가? → I 다음 줄에 `U(id, {layout:...})` 보강
- [ ] frame width/height에 `$variable` 쓰려는가? → hardcode px 또는 fill/fit
- [ ] text fontFamily에 `$font-*` 쓰려는가? → raw font stack 직접 사용
- [ ] ref instance 의 width/height 를 본체와 다르게 override 하려는가? → fragment 함정 — 본체와 동일 크기 유지하거나 별도 thumbnail 컴포넌트
- [ ] descendants에 children 통째 정의하려는가? → 키만 명시, swap은 R()
- [ ] op 25개 한도 안에 들어가는가? → logical section 별로 batch 분할
- [ ] `git status design/` 확인했는가? → 미커밋 변경 있으면 D 신중

위 항목 모두 OK일 때 batch_design 호출.
