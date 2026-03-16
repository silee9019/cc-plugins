---
description: 모델별 상세 비용 표시 (일일/주간/월간)
allowed-tools: Bash
argument-hint: ""
---

## 모델별 비용 상세 조회

### 동작

1. `bunx ccusage --json` 명령어를 실행한다
2. JSON 출력을 파싱하여 아래 정보를 계산한다

### 출력 형식

```
## 오늘 비용 (모델별)
- Opus: $X
- Sonnet: $X
- Haiku: $X
- **합계: $X**

## 주간 비용
- 기간: {일요일} ~ {오늘}
- **합계: $X**

## 월간 비용
- 기간: {이번달 1일} ~ {오늘}
- **합계: $X**
```

### 계산 방법

- **오늘**: `daily` 배열에서 오늘 날짜의 `modelBreakdowns`를 모델명(opus/sonnet/haiku)별로 합산
- **주간**: 가장 최근 일요일부터 오늘까지의 `totalCost` 합산
- **월간**: 이번 달 1일부터 오늘까지의 `totalCost` 합산
