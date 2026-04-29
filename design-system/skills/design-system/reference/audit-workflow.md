# 화면 일관성 전수 조사·표준화 8단계

다수 화면의 layout / padding / 카드 폭이 들쭉날쭉할 때 토큰 표준에 맞춰 일괄 정리. **읽기·분석은 read-only**(plan mode OK), 일괄 적용은 batch_design (write).

---

## Step 1 — 전수 조사 데이터 수집

대량 화면(20+)이면 MCP 호출보다 **.pen JSON 직접 분석이 빠름**. .pen은 JSON이라 git 객체에서 추출 가능.

```bash
git show HEAD:design/<file>.pen > /tmp/audit.pen
python3 <<'PY'
import json, re
d = json.load(open('/tmp/audit.pen'))
screen_re = re.compile(r'^(0\d|EX|0\d[a-z])')
def is_screen(n):
    return (isinstance(n, dict) and n.get('type')=='frame'
            and bool(screen_re.match(n.get('name',''))) and n.get('width')==1280)
screens = [c for c in d['children'] if is_screen(c)]
print(f"{len(screens)} screens found")
PY
```

⚠️ **사용자 미커밋 변경**이 디스크 .pen에 있을 수 있음. `git status design/`로 확인 — 미커밋 변경이 있다면 사용자에게 commit·stash 권유 후 진행.

대안 (소규모 화면 또는 plan mode 안에서):

```
mcp__pencil__snapshot_layout(maxDepth: 0)         # top-level만
mcp__pencil__snapshot_layout(parentId: <screen>, maxDepth: 3)   # 화면 안 자식
```

## Step 2 — 화면 frame 목록 추출

화면 = top-level frame + width 1280 + name이 화면 prefix(`01`/`EX 01`/`01b` 등). 마스터 카탈로그·디자인 시스템 슬라이드 같은 비화면 frame 제외.

## Step 3 — 화면별 body 노드 식별

각 화면은 보통 다음 구조:

```
screen frame (1280×*)
├── App Header (ref Zkl5E 또는 비슷한 헤더 마스터)
└── body frame (또는 ref iGwk4 같은 hero ref)
```

body 후보: App Header 다음의 첫 frame OR `ref` 인스턴스 (empty-hero 같은 경우 ref 자체가 body).

## Step 4 — body 측정값 수집

각 body의:
- `padding` (단일 / `[h,v]` / 4-side)
- `gap`
- `layout` (vertical/horizontal/none)
- 자식의 `width` (number / `fill_container` / `fit_content`)
- 자식의 `x`/`y` (hardcode 좌표 — flex 흐름 깨짐 신호)

```python
for s in screens:
    body = next((c for c in s['children']
                 if c.get('type')=='frame' or c.get('ref')=='iGwk4'), None)
    if body and body.get('type')=='frame':
        children_w = [c.get('width') for c in body.get('children',[])]
        print(s['name'], body.get('padding'), body.get('gap'),
              body.get('layout'), children_w)
```

## Step 5 — variant 분류

`layout-variants.md`의 7개 variant 중 매핑. body 자식 폭과 layout으로 결정:

| 자식 폭 패턴 | layout | variant |
|:---|:---|:---|
| 단일 600~ + alignItems center + justifyContent center | vertical | Centered |
| 동일 폭 카드 vertical stack | vertical | Stack |
| sidebar 폭 + fill | horizontal | Sidebar-Left/Right |
| 양쪽 fill 또는 동일 | horizontal | Two-Column |
| 좌 사이드 + fill + 우 사이드 | horizontal | Three-Column |
| backdrop fill 자식 | none | Dialog |

## Step 6 — 비표준 발견

표준 토큰에 안 맞는 값 표시:

- **카드 폭** 비표준: 600/880/1080 외 값 (920, 640, 560 같은 ±40 변형)
- **body padding** 비표준: `[32,40]` / `[24,28]` / `40` 외 (24 단일, `[36,40]` 등)
- **gap** 일관성 없음: 같은 variant 안에서 18 / 20 / 22 / 24 혼재
- **layout 누락**: layout 미지정인데 자식이 multi-column 의도 (03/04 같은 Main 직접 사용)
- **자식 x hardcode**: layout 적용 안 되고 x 좌표로 정렬 흉내

비표준 발견 결과는 표로 정리해 사용자 합의에 사용 (예: 폭 920 → 880 통일, gap 18/20/22 → 24).

## Step 7 — 토큰 매핑 + 사용자 합의

매핑 표 작성:

| 화면 | 현재 (padding/gap/widths) | 변경 → (표준) |
|:---|:---|:---|
| 01b | `[32,24]/24/920` | `[32,40]/24/880` |
| 04b | `[28,24]/20/920×3` | `[32,40]/24/880×3` |
| 06 | `24/20/(320,fill,320)` | `[24,28]/20` (compact 유지) |
| 08 | `32/24/1080` | `[32,40]/24/1080` |
| EX02 | `[36,40]/22/560×7` | `[32,40]/24/600×7` |
| EX04 | `24/20/fill×3 (wrapper 600)` | `[32,40]/24` |

`AskUserQuestion`으로 사용자 결정:
- A: 모든 비표준 → 표준 토큰 강제 (가장 강한 일관성)
- B: 의도된 비표준은 보존 (사용자가 `560`을 의도했으면 토큰화 또는 예외 명시)
- C: 카테고리별 부분 적용 (폭만, padding만 등)

## Step 8 — 일괄 적용 + 시각 검증

batch_design 25 op 한도. 큰 변경은 logical section(폭 변경 / padding 변경 / layout 추가)으로 batch 분할.

```
batch 1 — body padding 통일 (10~12 op)
batch 2 — body gap 통일 (5~10 op)
batch 3 — 카드 폭 토큰 정합 (10 op)
batch 4 — layout 누락 보강 (3~5 op)
```

각 batch 후 검증:
- `mcp__pencil__snapshot_layout(parentId: <screen>, maxDepth: 2)` — 좌표·폭 무충돌
- `mcp__pencil__get_screenshot(<screen>)` — 시각 회귀 없음
- design.md 토큰 갱신 (필요 시) → `npx -p @google/design.md design.md lint` errors 0
- **충돌(겹침) 정량 검증** — `snapshot_layout` 결과를 임시 파일로 저장 후 `python3 ${CLAUDE_PLUGIN_ROOT}/skills/design-system/scripts/check_collisions.py --filter "^Slide " --min-width 1000 --top-level-only /tmp/snap.json`. AABB 알고리즘. Lane 확장·시프트·재배치 후 표준화 마무리 단계에서 자동 호출 권장. exit 0 = no collisions, exit 1 = N collision(s) + 겹침 영역(px) 보고

## 결과 보고 형식

워크플로우 종료 시 다음 표로 사용자 보고:

```
표준화 적용 N 화면:
- A. body padding [32,40] 통일: 화면 X, Y, Z
- B. body-compact [24,28] 적용: 화면 P, Q
- C. 카드 폭 카드-default 880 통일: 화면 R
- D. gap 24 통일: 화면 S, T

미해결 (DONE_WITH_CONCERNS):
- aF98Z 1541px 콘텐츠가 lane label 박스 침범 — height 정상화 별도 결정 필요
- 03/04 layout 누락 — Main 직접 사용 구조 변경은 risk가 커서 별도 작업

검증:
- snapshot_layout: 모든 화면 좌표 무충돌
- get_screenshot: 시각 회귀 없음
- design.md lint: errors 0 (warnings N)
```
