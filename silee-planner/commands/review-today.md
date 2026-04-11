---
description: "[DEPRECATED] /memento:review-day로 이동했습니다. 이 커맨드는 호환성 래퍼입니다."
allowed-tools: Skill
---

# [Deprecated] /silee-planner:review-today

이 커맨드는 **memento v2.0.0**에 흡수되었습니다.

**이동**: `/memento:review-day`

## 동작

이 파일은 근육 기억 전환 기간용 얇은 위임 래퍼입니다. 호출되면:

1. 이동 안내 한 줄 출력
2. 즉시 `/memento:review-day`를 Skill 도구로 호출하여 동일 동작 수행
3. 원본 인자(있다면)를 그대로 전달

다음 세션부터는 `/memento:review-day` 를 직접 쓰는 것을 권장합니다.

> **참고**: 통합 설계는 `memento` 플러그인의 plugin.json description 및 memento-core SKILL.md 참조.
