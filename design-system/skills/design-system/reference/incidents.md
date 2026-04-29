# 사고 사례 — 같은 사고 재발 방지

이 문서는 디자인 시스템 작업 중 실제 발생한 사고를 기록한다. 새 작업 시작 전 1회 점검을 권장한다. 같은 패턴이 반복되지 않도록 체크리스트를 함께 제공.

---

## #001 — mlx-meeting-scribe 화면 6개 영구 손실

- **일시**: 2026-04-28
- **프로젝트**: mlx-meeting-scribe (시안: `design/webui-mockup.pen`)
- **심각도**: 사용자 작업물 영구 손실 (git 외부 디스크에서만 존재)
- **손실 자산**: 인터미디엇 화면 6개
  - JZMKx — 08a 동영상 선택됨
  - UAxYe — 08b-pre 업로드 진행 중
  - q18e0W — 08c 분석 큐 진입
  - YB9Wz — 09a 오디오 선택됨
  - D5SEz1 — 09b 업로드 진행 중
  - wNcGn — 09c 라벨링 진입 직전

### 컨텍스트

S3 동영상 / S4 오디오 lane 분리 작업 중, 사용자가 별도 Scenario A/B 컨테이너(`E5n3z`, `e4Vekf`)에 만들어둔 인터미디엇 화면 6개를 메인 lane(y=2531 / y=4212)으로 통합하려고 했다. 통합 후 빈 컨테이너로 보이는 Scenario A/B를 정리(D)하는 흐름.

### 원인 (단계별)

1. `M(JZMKx, "document", 0)` 호출 — 화면을 document 자식으로 옮김
2. 같은 batch에서 `U(JZMKx, {x: 1380, y: 2531})` — 새 좌표 부여
3. 9a~9c, 8a, 8b-pre, 8c 모두 동일 패턴으로 이동
4. 시각적으로 Scenario A/B 컨테이너에 자식이 빠진 듯 보였고, lane label만 남은 것처럼 보임
5. `D("E5n3z")` `D("e4Vekf")` `D("b40O75")` `D("lXfXk")` — 빈 컨테이너 정리
6. **이후 화면 6개 ID로 batch_get 시도 시 "Node not found"** — 영구 삭제 확인

### 핵심 문제

`M(node, parent, idx)` 의 동작이 예상과 다름. 일반적인 move 의미라면:
- 새 부모 children에 추가
- 원본 부모 children에서 제거

실제 관찰:
- 새 부모 children에 reference 추가
- **원본 부모 children에서 제거되지 않음** (자식이 두 부모에 동시 등록)
- 시각적으로는 새 위치에만 보이지만 트리 상으로는 양쪽

따라서 원본 부모를 D할 때 자식까지 같이 삭제됨.

### 결과

- 사용자가 작업하던 6 화면 영구 손실
- git에 commit된 적 없어 git 복구 불가능
- batch_get readDepth 2 시점에 가져온 메타(name / breadcrumb / page-header subtitle / status pill 색)만 남음
- 메타로 placeholder 화면 6개 재생성 (App Header + body title + 부제 + ⚠ amber 복구 안내) — 단, 실제 nested 콘텐츠(twoCol, 진행률 바, 메타데이터 카드 등)는 사용자가 다시 만들어야 함

### 교훈

1. **자식을 다른 부모로 옮길 때 M 단독 사용 금지**. C(copy) + 원본 D, 또는 자식 먼저 D 후 컨테이너 D.
2. **컨테이너 D 전 `batch_get(parentId, readDepth: 1)` 으로 children 확인**. 비어있는지 시각이 아닌 트리로 검증.
3. **사용자 디스크 미커밋 변경 = 사실상 백업 0**. `git status design/`로 사전 점검. 미커밋 변경 있으면 작업 전 commit·stash 권유.
4. **MCP 도구의 동작이 예상과 다를 수 있음**. M처럼 흔한 이름이라도 한 번도 검증한 적 없으면 작은 변경으로 먼저 동작 확인.

### 재발 방지 체크리스트 (작업 시작 전 점검)

- [ ] `git status design/` 실행 — 미커밋 .pen 변경 없는지 확인. 있다면 사용자에게 commit/stash 권유.
- [ ] 자식을 다른 부모로 옮기는 op가 있는가? → M 대신 **C(copy) + 원본 D** 패턴 사용.
- [ ] 컨테이너 D 직전에 `batch_get(parentId, readDepth: 1)` 으로 children list 확인.
- [ ] 의심스러운 op는 1~2 노드로 작은 batch 먼저 실행 후 동작 검증, 그 다음 대량 batch.
- [ ] 사용자 합의 없이 D 호출 금지 (특히 명확한 빈 컨테이너가 아닌 경우).

### 복구 방법 (사고 발생 시)

영구 손실은 git 복구가 불가능하지만 다음 노력으로 부분 복구 가능:

1. **이전 batch_get 결과의 메타로 placeholder 재생성** — name / 텍스트 / 색 같은 readDepth 2 정보를 readDepth 1~2로 작은 화면 골격 만들기
2. **storyboard sb-card의 hv14o ID 갱신** — 새 화면 ID로 가리키도록 `U(storyboard-card-id/hv14o, {content: <new-id>})`
3. **사용자에게 사고 보고 + 수동 보강 요청** — placeholder는 메타만 살아있고 nested 콘텐츠는 사용자가 다시 만들어야 함을 분명히 알린다

### 참조

- 함정 일반화: `batch-design-pitfalls.md` 1번
- HARD GATE: SKILL.md 의 미커밋 변경 + M 단독 사용 금지 조항

---

---

## #002 — 잘못된 시안에 변경 적용 위험 + 메모리 검증으로 인한 거짓 PASS

- **일시**: 2026-04-28 ~ 2026-04-29
- **프로젝트**: mlx-meeting-scribe (시안: `design/webui-mockup.pen`)
- **심각도**: 시간 낭비 + 데이터 부정합 위험 (실제 손실 없음)

### 컨텍스트

카드 폭 토큰 정합 작업(920→880, 640→600, 560→600)을 시작. 직전까지 사용자가 다른 프로젝트(`wedding-invite-mobile.pen`)를 작업 중이라 Pencil GUI 활성 탭이 그쪽에 가 있었다.

### 원인 (단계별)

1. 작업 시작 시 `mcp__pencil__open_document(/.../webui-mockup.pen)` 호출 → "Document opened" 응답
2. 응답만 보고 곧장 `snapshot_layout` 호출 → 결과가 `wedding-invite-mobile.pen` 내용. 활성 편집기가 안 바뀐 것을 한 박자 늦게 인지.
3. (별도 라운드) batch_design 적용 후 `batch_get` 으로 880/600 회수값 받고 "메모리 PASS" 라고 보고 → 사용자가 "07 setting이 안 바뀌었는데?" 지적
4. 디스크 파일을 다시 파싱해보니 메모리값과 디스크값이 동일했고 사실은 적용돼 있었지만, 동시에 표준 외 폭(900, fill_container) 누락 노드가 발견됨 — 메모리 회수만으로는 잔여 누락을 못 잡았던 것
5. 더해 "git show HEAD:" 로 검증을 시도해 working tree와 commit 상태를 헷갈린 사례도 있었다.

### 핵심 문제

A. `open_document` 응답 신뢰 — "Document opened" 가 곧 활성 편집기 전환을 보장하지 않는다. 호출 후 `get_editor_state` 재확인 없이 진행하면 다른 .pen에 변경이 적용될 수 있다 (이 사례는 적용 전 발견해서 손실 없음).

B. `batch_get` / `snapshot_layout` 회수값 = Pencil 메모리. 디스크 .pen 파일은 별도 저장 시점이 있을 수 있고(자동 저장 동작은 환경에 따라 다름), 무엇보다 **검증 대상 노드만** 회수하므로 **잔여 비표준값**을 발견할 수 없다. "기대값에 도달했는가" 를 확인할 뿐 "표준에 정합한가" 를 확인하지 못함.

B-1. **디스크 검증의 전제 = Pencil 이 저장했다**. 환경에 따라 batch_design 직후 auto-save가 동작하기도 하고 안 하기도 한다. 따라서 디스크 파싱 전에 `git status design/` 또는 `stat -f %m` 으로 working tree 반영 여부를 먼저 확인해야 한다. 반영 없음이면 Cmd+S 요청 후 재검증.

  **Fresh evidence 2026-04-29 (sds-web design.pen 자리배치 작업)**: batch_design 다수 호출 후 `git status` 가 clean, `stat` 결과 mtime이 마지막 commit 시각 그대로였다. Pencil MCP 가 메모리에만 적용하고 디스크 미저장 — 사용자에게 ⌘S 요청해야 디스크 반영. 즉 **auto-save 동작은 환경 의존이며 안 한다고 가정** 하는 편이 안전. 작업 종료 시점에 항상 사용자에게 Cmd+S 한 번 요청 후 commit·push 진행.

C. `git show HEAD:` 는 마지막 commit 시점 상태. working tree 변경은 이걸로 안 보인다.

### 결과

- 적용 자체는 23/23 PASS (디스크 실조사로 사후 확인)
- 잔여 누락 3건(07 QKOpp/zFs7b fill_container, 05 MqE3i 900) 추가 발견 — 사용자 지적 후 디스크 전수 조사로 확정
- 사용자 신뢰 1회 손상 ("앞으로 검증은 메모리 말고 실조사로")

### 교훈

1. **`.pen` 작업 첫 호출은 `get_editor_state` 고정**. 활성 편집기 의도 일치 확인 전엔 어떤 호출도 진행하지 않는다. `open_document` 는 응답이 아닌 후속 `get_editor_state` 결과로 성공을 판정한다.
2. **검증은 디스크 .pen 파일 실조사**. `python3 / jq` 로 working tree 파일을 파싱해 (a) 변경 대상이 기대값인지, (b) **표준 외 잔여**가 있는지 둘 다 본다. 사용자 의심 발화에는 (b) 답변이 더 중요하다.
3. **`git show HEAD:` 는 검증 도구가 아님**. 변경 전 상태를 본다. working tree 디스크 파일을 직접 읽는다.
4. 메모리(batch_get)와 디스크가 분리될 가능성을 항상 상정하고, 둘 다 일치할 때 "PASS" 라 부른다.

### 재발 방지 체크리스트

- [ ] 첫 호출이 `mcp__pencil__get_editor_state` 였는가? 활성 편집기가 의도한 .pen 인가?
- [ ] `open_document` 호출 직후 `get_editor_state` 로 재확인했는가?
- [ ] 검증 시 **`git status design/`** 또는 **`stat -f %m`** 으로 디스크 저장 여부를 먼저 확인했는가? 변경 없으면 Cmd+S 요청.
- [ ] 검증 시 디스크 .pen 파일을 python/jq 로 읽었는가? `batch_get` 회수값만 보지 않았는가?
- [ ] 변경 대상 ID 검증 외에 **표준 외 잔여 width/height/padding 전수 조사** 도 했는가?
- [ ] `git show HEAD:` 로 검증한 적이 없는가? (있다면 working tree 파일로 다시 검증)

### 복구 방법

이 사고는 데이터 손실이 없으므로 복구 절차는 다음과 같다:

1. 디스크 실조사로 실제 적용 상태를 파악
2. 잔여 누락분이 있으면 batch_design 추가 호출로 정합
3. 사용자에게 "메모리 검증으로 거짓 PASS 했던 것" 사과 + 디스크 검증 결과 표 제출

### 참조

- HARD GATE: SKILL.md 의 활성 편집기 첫 호출 + 디스크 실조사 조항
- Phase 1 (활성 편집기 검증), Phase 4 (디스크 실조사 + 잔여 전수 조사)

---

## #003 — 캔버스에 ASCII box-drawing 다이어그램 들이댐 + MCP 인자 형식 반복 실패

- **일시**: 2026-04-29
- **프로젝트**: imagoworks connect-monorepo / sds-web (`tools/sds-web/design.pen`, CND-1191)
- **심각도**: 시간 낭비 + 사용자 신뢰 손상 (실제 손실 없음)

### 컨텍스트

CND-1191 IA Map 영역(Showcase 우측 placeholder, x=7500~10000)에 Sitemap & Route Tree + Navigation Model 두 섹션을 작성. 첫 시도에서 `monospace` fontFamily의 단일 text 노드에 `┌──┐ │ ├── └──` ASCII box-drawing + 트리 들여쓰기로 다이어그램을 만들어버림.

### 원인

1. text 노드 1개에 multi-line 콘텐츠 + monospace 폰트로 "한 번에 시각화" 라는 효율 유혹 (op 1개로 끝)
2. 디자인 캔버스 = vector/frame이 1차 표현 수단이라는 원칙 망각. 텍스트 art는 워드프로세서·터미널 출력의 컨벤션이지 디자인 도구의 컨벤션이 아님

부수적으로 `batch_get` / `batch_design` 인자 형식 미숙지로 7회 가까이 호출 실패:
- `filePath` required 누락 → "wrong .pen file" misleading 에러
- `patterns` 를 string 배열 `["IA Map"]` 로 보냄 → 동일 에러
- `nodeIds` 가 단일 string 또는 객체 → "is not a string slice"
- `width: "hug-content"` (다른 도구 컨벤션) → Invalid properties
- `alignItems: "baseline"` → start/center/end 만 허용
- text 노드에 `padding` 직접 부여 → unexpected property

### 결과

- 사용자가 "왜 자꾸 실패하고 있어?" + "무슨 아스키 다이어그램을 넣어놨냐?" 두 차례 명시적 지적
- ASCII 다이어그램 1차본 폐기 후 frame 트리(Sitemap row 10개 + Navigation Model layout frames: AppHeader / ContextSidebar / TopNav 4 tabs / MainContent)로 재구성
- MCP 인자 형식은 ToolSearch `select:mcp__pencil__batch_get` 으로 schema 끄집어내 확인 후 정상화

### 교훈

1. **시안 캔버스는 vector 1차 — ASCII art 금지**. 시각 그루핑·계층·layout은 frame stroke·fill·padding·layout·gap·alignItems 로만 표현. multi-line monospace 텍스트로 box·tree 그리기 0건.
2. **MCP 도구 첫 호출 전 schema 직접 확인**. ToolSearch `select:<tool>` 로 정식 schema 끄집어내기. 추측 금지.
3. **에러 메시지가 misleading일 수 있음**. "wrong .pen file" 이라 떴지만 실제 원인은 `filePath` 누락. 같은 에러를 두 번 만나면 schema 재확인.

### 재발 방지 체크리스트

- [ ] 시안에 multi-line monospace 텍스트로 시각화하려 하는가? → 즉시 STOP. frame 트리로 재설계.
- [ ] ASCII 글리프(`┌`·`├`·`└`·`│`·`─`)를 디자인 캔버스에 넣으려 하는가? → STOP. (`★`·`●` 같은 단일 인디케이터만 허용)
- [ ] Pencil MCP 첫 호출에 `filePath` 명시했는가?
- [ ] `patterns` 가 `[{name|reusable|type}]` 객체 배열인가? `nodeIds` 가 string 배열인가?
- [ ] `width` / `alignItems` enum이 정확한가? (각각 fit_content/fill_container/숫자, start/center/end)
- [ ] text 노드에 padding 직접 부여하지 않았는가?

### 참조

- HARD GATE: SKILL.md "시안 캔버스에 ASCII art 금지" 항목
- 인자 함정 7종: `pencil-mcp.md` "인자 형식 함정 7종" 섹션
- ToolSearch 활용: `ToolSearch query:"select:mcp__pencil__batch_get,mcp__pencil__batch_design"`

---

## #004 — 스킬 늦은 로드로 권장 인자 누락 + M op 부작용으로 heading 8개 두 위치 동시 존재

- **일시**: 2026-04-29 ~ 2026-04-30
- **프로젝트**: imagoworks dentbird Connect monorepo / `tools/sds-web/design.pen` (CND-1191)
- **심각도**: 시간 낭비 + 시각 사고 (heading 중복) + 사용자 신뢰 비용

### 컨텍스트

CND-1191 Showcase 정합 작업 중 사용자 요구로 collision check 실행 → `wrap fit_content` 일괄 적용 → KJeCU 마스터 분리 → zone heading banner wrap 추가. 본 세션에서 design-system 스킬을 명시 로드하지 않고 작업 시작.

### 원인

1. **스킬 늦은 로드**: 세션 시작 시점에 design-system 스킬을 `Skill` tool로 명시 로드하지 않아 SKILL.md Phase 4 #5의 collision script 권장 인자(`--top-level-only --min-width 300`)가 컨텍스트에 없었음. `--top-level-only` 빠뜨려 reusable 좌표 (0,0) 더하기로 781 false positive collision 폭발.
2. **M op pitfall #1 (자식 두 위치 동시 존재)**: zone heading 8개를 banner wrap으로 감쌀 때 `M(headingId, wrap, 0)` 단독 사용. M은 자식을 새 부모 children에 추가하지만 원본 부모(document) children list에서 빼지 않아 heading 8개가 wrap 안 + document top-level **두 위치에 동시 존재** → 시각상 두 곳에서 그려짐. 사용자가 "ConfirmDialog 타이틀 따로 만들어진 건 뭐야?"라고 사고 발견.
3. **응답 가독성·오타**: AskUserQuestion 옵션 라벨/설명에 영문/한글/dash 혼재 + 길이 과다로 사용자가 "오타가 많다, 뭐라고 쓴지 못 알아보겠다"라고 가독성 문제 지적.
4. **Pencil ⌘S 자동 저장 안 함**: batch_design 누적 후 commit 시도 시 git working tree 변경 없음 ("nothing to add"). Pencil이 디스크에 자동 기록하지 않은 상태에서 `git status`/`stat` 검증 누락 → 사용자에게 GUI Cmd+S 별도 요청 필요.

### 결과

- collision check false positive 781건 → 권장 인자 적용으로 2건으로 축소 후 fix
- zone heading 8개 두 위치 중복 → 새 text I + 원본 D 패턴으로 fix (사용자 발견 후 사후 대응)
- 사용자 가독성 지적 후 응답 옵션 압축
- 사용자 ⌘S 안내로 디스크 반영 → commit

### 교훈

1. **스킬은 첫 호출 시점에 명시 로드** — `.pen` 작업·"slide/variant/showcase/lane/design.pen" 발화 감지 시 즉시 design-system 스킬을 `Skill` tool로 명시 로드. 이후 SKILL.md Phase 4 권장 인자를 컨텍스트에 두고 진행.
2. **M op은 안전 패턴만** — heading text 같은 단순 노드를 reparent할 때도 `M` 단독 금지. **`I(parent, {새 text})` + `D(원본)` 패턴**이 안전. M은 마스터 reparent(M-α V-1) 같은 명시적 안전 시나리오에서만 사용.
3. **AskUserQuestion 옵션은 한 줄, 한 언어, 단순 부호** — description은 한 줄 이내, 한국어 단일 언어, dash·tilde·대괄호·괄호 혼재 절제. 길어지면 본문 응답으로 풀어 설명.
4. **batch_design 후 git status 즉시 검증** — Phase 4 #1 "저장 여부 선검증" 룰 강화. Pencil 자동 저장에 의존하지 말고 매 commit 직전 `git status` + `stat -f %m` 둘 다 확인 후 사용자 ⌘S 요청.

### 재발 방지 체크리스트

- [ ] `.pen` 작업 시작 시 `Skill` tool로 design-system 스킬 명시 로드 완료
- [ ] collision check 호출 시 권장 인자 `--top-level-only --min-width 300` 포함
- [ ] heading text reparent 시 M 단독 금지, `I + D` 패턴 사용
- [ ] AskUserQuestion 옵션 description 한 줄 한국어 단일 언어 작성 후 셀프 가독성 검증
- [ ] commit 직전 `git status tools/.../design.pen` + `stat -f %m` 검증, 변경 없으면 사용자 ⌘S 요청 후 재검증

### 복구 방법

본 사고는 fix 후 commit으로 정상화. heading 두 위치 동시 존재는 새 text I + 원본 D로 단일 위치로 정리.

### 참조

- 본 세션 핸드오프: `2026-04-29-2302-handoff-design-system-v06-룰-정비.md` 후속
- HARD GATE 신규 6 룰 (V-6 ~ V-10 + Meta): `SKILL.md`
- batch_design pitfalls #1: `reference/batch-design-pitfalls.md`
- Phase 4 #1 강화: `SKILL.md`

---

## 신규 사고 추가 양식

새로운 사고가 발생하면 위 #001 형식으로 다음을 추가:

```
## #NNN — <한 줄 요약>

- **일시**: YYYY-MM-DD
- **프로젝트**: <repo / 시안 경로>
- **심각도**: <손실 / 시간 낭비 / 데이터 부정합 / ...>
- **손실 자산**: <구체>

### 컨텍스트
### 원인
### 결과
### 교훈
### 재발 방지 체크리스트
### 복구 방법
### 참조
```

작업 종료 시 사고가 있었다면 이 문서에 추가를 사용자에게 제안.
