# kr-workday-context

세션 시작 시 한국 영업일 컨텍스트를 Claude에 주입하는 Claude Code 플러그인.

## 주입 내용

매 세션 시작 시 `SessionStart` 훅이 아래 블록을 system-reminder로 Claude 컨텍스트에 삽입한다.

```
## Session Context (KST)

**오늘**: 2026-04-13 (월요일)
**현재 시각**: 08:56 KST

**향후 영업일** (오늘 + 7일 범위, 주말/공휴일 제외)
- 2026-04-13 (월)
- 2026-04-14 (화)
- 2026-04-15 (수)
- 2026-04-16 (목)
- 2026-04-17 (금)
- 2026-04-20 (월)

**향후 2개월 공휴일**
- 2026-05-05 (화) — 어린이날
- 2026-05-24 (일) — 부처님오신날
- 2026-05-25 (월) — 부처님오신날 대체 휴일
- 2026-06-03 (수) — 지방선거일
- 2026-06-06 (토) — 현충일

_holidays cache: kasi, updated 3일 전_
```

영업일 판단은 **주말 + 한국 법정공휴일 + 대체공휴일 + 임시공휴일 + 선거로 인한 휴일**을 제외한다. 데이터는 KASI(한국천문연구원) 특일정보 API로 가져와 로컬에 캐시하며, 임시공휴일/선거일도 관보 고시 기준으로 자동 반영된다.

## 설치

1. `cc-plugins` 마켓플레이스에서 `kr-workday-context` 플러그인을 활성화.
2. [공공데이터포털](https://www.data.go.kr)에서 KASI 특일정보 API 서비스키 발급 (아래 섹션 참조).
3. `~/.netrc`에 엔트리 추가 + 권한 설정 (아래 섹션 참조).
4. `/kr-workday-context:update-holidays` 실행으로 최초 캐시 생성.
5. 새 세션을 시작하면 `## Session Context (KST)` 블록이 자동 주입된다.

## KASI API 서비스키 발급

1. <https://www.data.go.kr> 접속 → 회원가입/로그인
2. 검색창에 **"특일 정보"** 입력 → **"한국천문연구원_특일 정보"** 오픈 API 선택
   - 직접 링크: <https://www.data.go.kr/data/15012690/openapi.do>
3. 상단 **[활용신청]** 버튼 클릭 → 활용 목적 간단히 작성 → 신청
4. 개발계정은 **자동 승인** (보통 즉시). 트래픽 제한: 일 1,000건
5. **마이페이지 → 개발계정 → 해당 API** 에서 **"일반 인증키(Decoding)"** 값을 복사

## .netrc 설정

```bash
# ~/.netrc 에 다음 엔트리 추가
machine apis.data.go.kr
  login kasi
  password <발급받은 Decoding 서비스키>
```

권한은 반드시 0600으로 설정:

```bash
chmod 600 ~/.netrc
```

Python 표준 라이브러리 `netrc`는 권한이 0600이 아니면 예외를 던진다.

## 데이터 소스와 fallback

1순위 — **KASI 특일정보 API** (`apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`)
- 캐시: `~/.claude/data/kr-workday-context/kr-holidays.json`
- 범위: 이번 달 + 다음 달 (2개월 슬라이딩 윈도우)
- 갱신: 세션 시작 훅이 캐시 나이를 확인하여 7일 이상 stale 시 백그라운드로 `update_holidays.py`를 실행 (nonblocking)

2순위 — **`holidays` PyPI 패키지 덤프** (offline fallback)
- 파일: `data/kr-holidays-fallback.json`
- 범위: ~5년치 (작년 ~ 4년 후)
- 생성: `python3 scripts/dump_fallback.py` (수동, 플러그인 패키징 시 1회)
- 한계: 임시공휴일/선거일이 패키지 업데이트 주기에 종속

## 캐시 수명 정책

| 캐시 나이 | 동작 |
|-----------|------|
| 없음 | fallback 사용 + "캐시 없음" 경고 |
| 7일 미만 | 조용히 사용 |
| 7 ~ 30일 | 사용 + 백그라운드 갱신 트리거 |
| 30일 이상 | 사용 + "캐시 만료" 경고 출력 |

## 수동 갱신

언제든 `/kr-workday-context:update-holidays` 스킬을 호출해 캐시를 강제로 갱신할 수 있다.

## 작동 원리

1. Claude Code가 새 세션을 시작 → `SessionStart` 이벤트 발생
2. `hooks/hooks.json`에 등록된 훅이 `scripts/session-start.sh`를 실행
3. 쉘 스크립트가 `scripts/workday_context.py`를 호출
4. Python이 캐시/fallback에서 공휴일 목록을 로드하고, `date.weekday() < 5 and iso not in holidays` 필터로 영업일 계산
5. 결과를 stdout에 출력 → Claude Code가 system-reminder로 래핑해 컨텍스트에 주입

Python 3만 필요하며 표준 라이브러리(`urllib`, `netrc`, `xml.etree`, `json`, `datetime`)만 사용한다. `holidays` PyPI 패키지는 `dump_fallback.py`에서만 사용되며 런타임에는 의존하지 않는다.

## 트러블슈팅

**훅이 아무것도 출력하지 않음**
- `python3` 이 PATH에 없는지 확인
- `sh scripts/session-start.sh < /dev/null` 로 수동 실행해 stderr 확인

**"fallback" 표시가 계속 나옴**
- `~/.netrc` 엔트리 확인: `python3 -c "import netrc; print(netrc.netrc().authenticators('apis.data.go.kr'))"`
- API 호출 수동 확인: `python3 scripts/update_holidays.py --verbose`

**공휴일이 표시되지 않음**
- 해당 월의 KASI 응답에 `isHoliday=Y`인 항목이 실제로 있는지 확인 (`--verbose` 실행)
- 대체공휴일은 KASI API가 별도 항목으로 반환 — 캐시에서 해당 날짜를 직접 확인
