# audit-prompt.md

Phase 5 (Visual Audit) Vision 분석 프롬프트 템플릿.

- **생성 경로**: `.github/workflows/weekly-visual-audit/audit-prompt.md`
- **목적**: Agent CLI에 전달할 Vision 분석 지시 프롬프트. 스크린샷 이미지를 입력받아 시각적 문제를 감지하고 구조화된 JSON으로 출력한다.
- **치환 변수**: 없음 (Agent CLI 비종속 프롬프트)

---

````markdown
# Visual Audit

첨부된 스크린샷 이미지들을 분석하여 시각적 품질 문제를 감지하라.

## 검증 항목

각 스크린샷에 대해 다음 5가지 카테고리를 검사한다:

### 1. 레이아웃 깨짐
- 요소 겹침 (overlapping elements)
- 콘텐츠 overflow (텍스트/이미지가 컨테이너를 벗어남)
- 비정상적 여백 또는 정렬 불일치
- 잘린 요소 (clipped content)

### 2. 반응형 문제
- 뷰포트 대비 비정상적으로 작거나 큰 요소
- 가로 스크롤 발생 징후
- 모바일/데스크톱 뷰포트에 맞지 않는 레이아웃

### 3. 접근성
- 배경 대비 텍스트 대비(contrast) 부족
- 지나치게 작은 텍스트 (12px 미만으로 추정되는 경우)
- 클릭 대상이 너무 작은 인터랙티브 요소
- 포커스 표시가 필요해 보이지만 없는 요소

### 4. 디자인 일관성
- 동일 페이지 내 상이한 폰트/크기/색상 사용
- 버튼/카드 등 반복 요소의 스타일 불일치
- 아이콘/이미지 깨짐 또는 미로딩 (placeholder 상태)

### 5. 상태 이상
- 빈 상태 (데이터 없음)가 적절히 처리되지 않은 경우
- 에러 메시지가 노출된 상태
- 로딩 스피너가 남아있는 상태
- 콘솔 에러 오버레이 등 개발 모드 흔적

## 출력 형식

반드시 아래 JSON 형식으로 출력하라. JSON 외의 텍스트는 포함하지 않는다.

```json
{
  "audit_date": "YYYY-MM-DD",
  "summary": "전체 요약 (1-2문장)",
  "pages": [
    {
      "name": "스크린샷 파일명 (확장자 제외)",
      "screenshot": "screenshots/{name}.png",
      "score": 85,
      "issues": [
        {
          "category": "layout | responsive | accessibility | consistency | state",
          "severity": "critical | high | medium | low",
          "description": "문제 설명",
          "location": "문제가 발견된 위치 (예: 상단 네비게이션, 메인 콘텐츠 영역)"
        }
      ]
    }
  ]
}
```

## 점수 기준

| 점수 | 의미 |
|------|------|
| 90-100 | 문제 없음 또는 경미한 개선 사항만 존재 |
| 70-89 | 사소한 문제 (low/medium severity) |
| 50-69 | 주의 필요 (high severity 포함) |
| 0-49 | 심각한 문제 (critical severity 포함) |

## 규칙

- 문제가 없는 페이지도 pages 배열에 포함하되, issues를 빈 배열로 설정한다.
- severity 판단 기준:
  - **critical**: 페이지 사용 불가 수준 (완전히 깨진 레이아웃, 주요 콘텐츠 미표시)
  - **high**: 사용자 경험에 상당한 영향 (요소 겹침, 접근성 심각 위반)
  - **medium**: 불편하지만 사용 가능 (정렬 불일치, 경미한 overflow)
  - **low**: 개선 권장 사항 (미세한 여백 차이, 사소한 일관성 문제)
- 추측이 아닌 이미지에서 확인 가능한 문제만 보고한다.
````
