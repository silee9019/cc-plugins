# narrative 축 결정 → 자리배치 도출 → Reference Archive 격리

화면 자리배치는 임의로 정하지 않는다. 먼저 **narrative 축**(시안이 무엇을 이야기하는지)을 결정하고, 그 축의 lane에 화면을 매핑한 뒤, **매칭 안 되는 화면은 별도 Reference Archive 영역으로 격리**한다.

## 왜 이 순서인가

자리배치를 시각적 정렬(예: 5×N 그리드)만으로 정하면 화면 사이 의미 관계가 사라진다. 시안을 보는 사람은 "이 두 화면이 왜 옆에 있지?" 를 매번 추론해야 한다. narrative 축은 **lane = 시나리오 / 단계 / 모델 관점** 같은 의미 단위를 lane 의 위치로 표명하므로, 시안이 자기 설명적이 된다.

또한 제품 컨셉 전환 시(예: Clip 메타포 → 요구사항/AC 모델) 기존 화면 27장 같은 자산은 새 narrative 에 깔끔히 매핑되지 않는다. **모두 유지하되 매칭 외 화면은 격리** 해야 새 narrative 가 헷갈리지 않으면서도 기존 자산이 보존된다.

## Step 1 — narrative 축 결정

| 축 후보 | 적합한 시점 |
|:---|:---|
| **사용자 여정** (단계: 진입 → 탐색 → 액션 → 완료 → 공유) | 사용자 흐름 검증·신규 기능 설계 |
| **모델 관점** (entity별·responsibility별 분리) | 데이터 모델·도메인 경계 표명 |
| **모드/상태** (정상 / 빈 / 에러 / 권한 거부) | 상태 커버리지 검증 |
| **격자 (행=여정 × 열=모델)** | 두 축 모두 중요할 때, lane 대신 grid 사용 |

축 선택 기준:
- 시안이 **누구에게 무엇을 보여주는가**: 디자이너 동료 → 여정 / PM·도메인 전문가 → 모델 / QA → 모드·상태
- 화면 수가 많으면 단일 축으로 부족 → 격자
- 컨셉 전환 직후라면 새 모델 축이 강제 (이전 축은 legacy 신호)

축이 모호하면 **AskUserQuestion** 으로 결정 받는다. SKILL.md Step 0 의도 정합성과 동일한 판단.

## Step 2 — 매핑 결과 분류 (R1, R2, …, Reference)

각 화면을 축의 lane(R1/R2/…) 또는 **Reference Archive** 중 하나로 분류한다. 분류표 양식:

| 화면 ID | 화면 이름 | 매핑 lane | 매핑 근거 |
|:---|:---|:---|:---|
| hAWFS | 변환 작업대 | R1 요구사항 추출 | SDS 문서 진입점 — R1 의 시작 step |
| QXCs8 | 만료/삭제 링크 | R4 추적성 검증 | 추적성 끊김 시나리오 |
| 3JkSJ | 발췌 목록 | Reference Archive | Clip 메타포 고유 — 새 모델 축에 매핑 안 됨 |

**판단 기준**:
- lane 의 정의(시나리오·관점·모드)에 **화면이 직접 답하는가** → 그 lane
- 답하지 않거나, 답한다 해도 이전 컨셉 잔재라 새 narrative 흐름을 흐리는가 → Reference Archive
- 어디 둬도 어색한 화면(테마 데모 등 narrative 무관) → Reference Archive

분류 결과는 **사용자에게 표 + 권장안** 으로 제출하고 OK 받은 뒤 자리배치 진행. (옵션 제안 형식은 user-scope CLAUDE.md "결정·옵션 제안" 룰 적용 — 표 + 권장안 볼드+밑줄)

## Step 3 — 자리배치 도출

축 lane 들을 캔버스의 메인 영역에, Reference Archive 를 외곽으로 분리. 좌표 컨벤션은 `layout-variants.md` Canvas Zoning 섹션 참조.

```
┌─ 메인 영역 (x: 12000~) — narrative 축 lane들 ──────────┐
│  R1 라벨  │  미니맵 → → → → →    │  풀사이즈 화면들    │
│  R2 라벨  │  미니맵 →             │  풀사이즈 1장        │
│  R3 라벨  │  (비어있음 — 추후)                          │
│  R4 라벨  │  미니맵 → → →         │  풀사이즈 화면들    │
└────────────────────────────────────────────────────────┘

┌─ 우측 외곽 (x: 30000~) — Reference Archive ──┐
│  legacy / narrative 무관 화면 (12장)         │
│  (별도 라벨, 향후 폐기 분류 대상 표시)        │
└──────────────────────────────────────────────┘
```

lane 간 vertical pitch 는 화면 height + lane 라벨/미니맵 행 + 여백 = 보통 1100~1200. 일관성 유지.

### Reference Archive 영역 — 추가 컨벤션

- **lane 라벨**: "Reference Archive — <컨셉/이유>" (예: "Reference Archive — Clip 메타포 (legacy)")
- **레이아웃**: 5×N 그리드 또는 단순 가로 stack (의미 흐름 없으니 시각 정리만)
- **caption**: 각 화면 위에 "matched: ✗ / reason: …" caption 권장 (미래에 폐기 분류 시 결정 근거)
- **위치**: 메인 영역에서 충분히 멀리 (x 차이 10000+ 또는 캔버스 줌 아웃 시에도 헷갈리지 않을 거리)

## Step 4 — narrative 변경/확장 시 마이그레이션

축이 진화하면(예: R1·R2·R3·R4 → R1·R2·R3·R4·R5 추가) 화면을 다시 분류한다.

1. 새 lane 정의를 명문화
2. Reference Archive 의 화면들을 다시 본다 — 새 lane 에 매칭되는 게 있는가?
3. 기존 lane 의 화면 중 새 lane 으로 이동해야 하는 게 있는가?
4. 결과 분류표를 사용자에게 보여주고 이동 batch 실행

## 안티패턴

- 자리배치 먼저, narrative 사후 — 시각 정렬은 깔끔해도 의미는 무너진다
- "모든 화면은 메인 영역에 배치해야 한다" — Reference Archive 회피로 새 narrative 가 흐려진다. 격리는 폐기가 아니라 분리.
- Reference Archive 를 "쓰레기통" 으로 생각 — 실제로는 보존되는 자산. lane 라벨에 이유를 적고, 폐기 결정 시점은 별도 세션으로 미룬다.
- lane 정의 모호 ("기타", "잡다") — narrative 축이 아니라 분류자의 게으름 신호. 다시 축 결정으로.

## 작업 순서 (신규 narrative 도입 시)

1. **축 결정** — Step 1 + AskUserQuestion 필요 시
2. **분류표 작성** — 화면 전수 → lane / Reference 매핑
3. **사용자 승인** — 분류표 + 자리배치 도면 제출 → 옵션 제안 형식 룰 적용
4. **lane 영역 생성** — 라벨 + 미니맵 행 + 풀사이즈 행 (`storyboard-pattern.md` 참조)
5. **화면 reusable 전환** — 미니맵 ref 동기화를 위해 (`storyboard-pattern.md` 패턴 1)
6. **이동 batch** — 매칭 화면을 lane 좌표로 이동 + 미니맵 ref 추가
7. **Reference Archive 영역 생성** — 외곽 좌표에 라벨 + 5×N 그리드
8. **격리 batch** — 매칭 외 화면을 Reference Archive 로 이동 + caption 추가
9. **이전 축의 lane 라벨/IA Map 폐기** — 새 narrative 와 충돌하는 잔재 정리
10. **검증** — `snapshot_layout` 으로 좌표 무충돌, `get_screenshot(laneId)` 로 시각 흐름 확인

## 참조

- 스토리보드 패턴 (lane 안 미니맵 + 풀사이즈): `storyboard-pattern.md`
- 캔버스 영역 좌표 컨벤션: `layout-variants.md` Canvas Zoning
- 의도 정합성 분류: SKILL.md Step 0
