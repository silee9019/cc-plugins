# resume-coach

이력서 작성, 모의 면접, 커리어 멘토링을 위한 Claude Code 플러그인.

## 스킬
- `/resume-coach:setup` — 프로젝트 폴더 구조 + SOUL 페르소나 + CLAUDE.md 생성 (멱등성 보장)
- `/resume-coach:coach` — 이력서 작성 코치 (오케스트레이터)

## 에이전트
- `interview-arch` — 기술 심화 면접관 (아키텍처/설계)
- `interview-verify` — 실무 검증 면접관 (까칠, 디테일)
- `interview-culture` — 문화적합성 면접관
- `mentor-manager` — 엔지니어링 매니저 멘토
- `mentor-ic` — IC(Staff/Principal) 멘토

## 사용법
1. `/resume-coach:setup` 으로 프로젝트 초기화
2. `/resume-coach:coach` 로 이력서 작성/리뷰
3. 면접 연습은 에이전트가 자동 트리거 또는 코치가 오케스트레이션
