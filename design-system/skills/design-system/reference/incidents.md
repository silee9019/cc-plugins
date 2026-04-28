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
