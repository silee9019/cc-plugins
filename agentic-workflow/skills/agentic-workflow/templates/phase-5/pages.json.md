# pages.json.md

Phase 5 (Visual Audit) 검증 대상 페이지 목록 템플릿.

- **생성 경로**: `.github/workflows/weekly-visual-audit/pages.json`
- **목적**: Visual Audit에서 스크린샷을 캡처할 페이지 URL 목록을 정의한다. 사용자가 프로젝트에 맞게 직접 수정한다.
- **치환 변수**: 없음 (사용자 직접 편집)

---

````json
[
  {
    "name": "home",
    "url": "http://localhost:3000",
    "viewport": "1280x720"
  },
  {
    "name": "login",
    "url": "http://localhost:3000/login",
    "viewport": "1280x720"
  }
]
````

## 필드 설명

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `name` | string | O | 페이지 식별자. 스크린샷 파일명으로 사용 (`{name}.png`) |
| `url` | string | O | 캡처 대상 URL |
| `viewport` | string | - | 뷰포트 크기 (`너비x높이`). 기본값: `1280x720` |

## 사용 가이드

- 위 예제는 placeholder입니다. 프로젝트의 실제 URL로 교체하세요.
- 동일 페이지를 여러 뷰포트로 검증하려면 name을 구분하여 항목을 추가하세요:
  ```json
  { "name": "home-mobile", "url": "http://localhost:3000", "viewport": "375x812" }
  ```
- CI 환경에서 localhost 접근이 필요하면, 워크플로우에 애플리케이션 기동 step을 추가하세요.
