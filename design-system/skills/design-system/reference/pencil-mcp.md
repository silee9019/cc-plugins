# Pencil MCP — 표준 호출 루프

`.pen` 파일은 Pencil 에디터(scheme 2.11)의 노드 트리 JSON. **`pencil` MCP 서버의 도구로만 읽고 쓴다.** `Read`/`Grep`/`Edit` 등 일반 파일 도구는 .pen에 사용 금지(MCP 서버 instructions에 명시).

## 표준 호출 순서

```
get_editor_state(include_schema:true)  ← 항상 첫 호출
   │
   ├─ get_variables           ← 토큰 22개~ 추출 (read-only, 빈도 낮음)
   │
   ├─ batch_get(patterns/nodeIds, readDepth:2~3)  ← 노드 구조 탐색
   │
   ├─ snapshot_layout(maxDepth:0~3, parentId:?)   ← 좌표·폭 측정 (실측)
   │
   ├─ batch_design(operations)         ← 변경 적용 (25 op 한도)
   │
   └─ get_screenshot(nodeId)           ← 변경 시각 검증
```

## 도구별 역할 + plan mode 호환성

| 도구 | 역할 | plan mode | 비고 |
|:---|:---|:---:|:---|
| `get_editor_state` | 활성 .pen + top-level 노드 + reusable 컴포넌트 + schema | ✓ | `include_schema:true` 첫 호출 1회 |
| `open_document` | .pen 파일 열기/새로 만들기 | ✓ | 활성 에디터 없을 때만 |
| `get_variables` | 정의된 토큰 변수 전부 (color/string/number) | ✓ | YAML/CSS 매핑 직전에 호출 |
| `batch_get` | 노드 ID 또는 패턴으로 트리 탐색 | ✓ | `readDepth: 1~3` 권장(>3은 토큰 비대) |
| `snapshot_layout` | 노드 트리의 실제 좌표·width·height (flex 계산 결과) | ✓ | 표준화 감사·overflow 진단에 필수 |
| `get_screenshot` | 노드 시각 렌더링 PNG | ✓ | 중간·종료 검증 |
| `find_empty_space_on_canvas` | 새 frame 둘 자리 찾기 | ✓ | 신규 화면 추가 시 |
| **`batch_design`** | 변경 적용 (I/C/U/R/M/D/G 등 op) | ✗ | **plan mode 차단**, 25 op 한도 |
| `replace_all_matching_properties` | 속성 일괄 치환 | ✗ | **`$variable` escape 버그 — 사용 금지** |
| `set_variables` / `get_chunks` 등 | 토큰 등록 / chunk 관리 | (혼합) | 자세히는 도구 description 참조 |

read-only 도구는 plan mode에서 모두 호출 가능. write 도구는 ExitPlanMode 후 실행.

## batch_design 연산 요약

`batch_design`은 JS-like script 한 블록 — 한 호출 안 여러 op. 각 줄에 다음 함수 하나만 사용 가능.

| 함수 | 시그니처 | 의미 | 주의 |
|:---|:---|:---|:---|
| `I` | `id = I(parent, {...})` | Insert (자식 추가) | parent 명시 필수, 끝에 추가 |
| `C` | `id = C(srcId, parent, {...})` | Copy (복제 + parent 이동) | descendants override 옵션 |
| `U` | `U(id, {...})` | Update 속성 | descendants 키만 변경 |
| `R` | `id = R(idPath, {...})` | Replace 노드(swap) | type 명시 필수 |
| `M` | `M(id, parent, idx)` | Move (parent + index 변경) | **자식 reference 부작용 주의** |
| `D` | `D(id)` | Delete | 자식까지 같이 삭제 |
| `G` | `G(id, "ai"|"stock", "prompt")` | 이미지 생성·적용 | rectangle/frame fill |

자세한 함정과 안전 패턴은 `batch-design-pitfalls.md`.

## 화면 인벤토리를 빠르게 보는 두 방법

대량 화면(20+) 분석 시 MCP 호출은 토큰·시간 소모. 대안:

1. **MCP 경로**: `snapshot_layout(maxDepth:0)` — 모든 top-level 노드의 x/y/width/height만
2. **JSON 직접 분석**: `git show HEAD:design/<file>.pen | jq` 또는 Python — .pen이 JSON이라 git 객체에서 직접 추출. body 자식 width / x 같은 nested 측정에 효율적

```bash
git show HEAD:design/webui-mockup.pen > /tmp/old.pen
python3 -c "
import json
d = json.load(open('/tmp/old.pen'))
for c in d['children']:
    if c.get('type')=='frame' and c.get('width')==1280:
        print(c.get('name'), c.get('x'), c.get('y'), c.get('height'))
"
```

⚠️ 디스크 .pen은 사용자 작업 미커밋 변경을 포함할 수 있음(`git status design/`로 확인). git 버전과 다를 수 있다.

## 디자인 시스템 컨벤션

- 화면(screen) = top-level frame, prefix `01 — ...` / `EX 01 — ...` 같은 형식, width 1280
- 마스터 컴포넌트 = `mc-*` (앱 컴포넌트) / `sb-*` (스토리보드 카드), 보관소 frame 안에 `reusable: true`
- 인스턴스 = `type: "ref"` + `ref: <masterId>` + 선택적 `descendants: { <childId>: { ... } }`
- 토큰 참조 = 문자열 값 앞에 `$` (예: `fill: "$bg-canvas"`)

자세한 명명·배치 규약은 프로젝트 별 design.md 또는 시안 안 `OamJY`(Design System Slide) / `Zmdaq`(IA — Header Model) 같은 슬라이드 frame.

## 인자 형식 함정 7종

`batch_get` / `batch_design` 호출 시 인자 형식 위반은 misleading 에러로 나오는 경우가 많다. 첫 호출 전 본 표 1회 점검.

| # | 함정 | 올바른 형식 | 잘못된 예 / 증상 |
|---|---|---|---|
| 1 | `filePath` required | `batch_get`·`batch_design` 양쪽 모두 명시 | 누락 시 "wrong .pen file" 에러 (실제 원인은 인자 누락) |
| 2 | `patterns` 객체 배열 | `[{name: "regex"}, {reusable: true}, {type: "frame"}]` | 문자열 배열 `["IA Map"]` → "wrong .pen file" |
| 3 | `nodeIds` string array | `["abc", "def"]` | 단일 string·객체 → "is not a string slice" |
| 4 | `width`/`height` enum | `"fit_content"` / `"fill_container"` / `"fit_content(N)"` / 숫자 / `"$variable"` | `"hug-content"`(다른 도구 컨벤션) → Invalid properties |
| 5 | `alignItems` enum | `"start"` / `"center"` / `"end"` | `"baseline"`·`"stretch"` → Invalid properties |
| 6 | `text` 노드 padding 미지원 | text를 frame으로 wrap해 frame에 padding, 또는 부모 `gap` 의존 | text 노드에 직접 `padding: [...]` → unexpected property |
| 7 | operations syntax | `D("nodeId")` / `U("nodeId", {...})` / `binding=I("parentId", {...})`. 인자 = 노드 ID 문자열(double quote) 또는 binding 변수명 | binding 미정의 ID를 quote 없이 사용 → 변수 not defined |

체크리스트 (op 작성 직전):

- [ ] `filePath` 인자 포함했는가?
- [ ] `patterns` 가 객체 배열인가? (문자열 배열 X)
- [ ] `width` 가 fit_content / fill_container / 숫자 / $variable 중 하나인가? (`hug-content` X)
- [ ] `alignItems` 가 start/center/end 중 하나인가?
- [ ] `text` 노드에 padding 직접 부여하지 않았는가? (frame으로 wrap)
- [ ] 노드 ID 문자열은 double quote 으로 감쌌는가?

ToolSearch로 schema 직접 확인하는 게 빠르다: `ToolSearch query:"select:mcp__pencil__batch_get,mcp__pencil__batch_design"`.

**사고 사례**: `incidents.md` #003 — 2026-04-29 sds-web IA Map 작업 시 batch_get 4회 / batch_design 3회 연속 실패.
