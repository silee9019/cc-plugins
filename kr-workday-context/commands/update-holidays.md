---
description: KASI 특일정보 API에서 한국 공휴일을 가져와 로컬 캐시를 갱신
---

# update-holidays

KASI(한국천문연구원) 특일정보 API를 호출해 `~/.claude/data/kr-workday-context/kr-holidays.json` 캐시를 갱신한다.

## 동작

1. `~/.netrc`에서 `machine apis.data.go.kr` 엔트리의 password(서비스키)를 읽는다.
2. 이번 달 + 다음 달 (총 2개월치)의 공휴일을 API로 가져온다.
3. 응답을 `{YYYY-MM-DD: 이름}` 맵으로 정규화해 캐시 파일에 원자 쓰기.
4. 결과 요약(가져온 공휴일 수, 캐시 경로)을 사용자에게 출력한다.

## 실행 절차

Bash 도구로 아래 명령을 실행한다.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/update_holidays.py" --verbose
```

종료 코드:
- `0`: 성공 (캐시 갱신됨)
- `1`: API 호출 실패 (네트워크, 인증키 오류 등) — stderr에 원인 표시
- `2`: `.netrc`에 `machine apis.data.go.kr` 엔트리가 없음

실행 후 캐시 파일 위치와 주요 공휴일 몇 개를 Read로 확인해 보고한다.

## 트러블슈팅

| 증상 | 조치 |
|------|------|
| `.netrc missing machine apis.data.go.kr` | `~/.netrc`에 엔트리 추가 후 `chmod 600 ~/.netrc`. 발급 방법은 README.md 참조 |
| `KASI API error` | 서비스키 오타 또는 활용신청 상태 확인 (공공데이터포털 마이페이지) |
| `fetch failed` (타임아웃) | 네트워크 확인. 실패해도 기존 캐시는 유지됨 |
