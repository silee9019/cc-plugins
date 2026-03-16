---
description: 현재 세션의 목적(purpose)을 설정하거나 자동 생성
allowed-tools: Bash, Read, Write
argument-hint: "[purpose text]"
---

## 세션 Purpose 관리

### 동작

1. **인자가 있는 경우** (`/purpose API 인증 리팩토링`):
   - `${CLAUDE_PLUGIN_ROOT}/data/sessions/` 디렉토리에서 가장 최근 active 세션 JSON 파일을 찾는다
   - 해당 파일의 `purpose` 필드를 인자 텍스트로, `purposeSource`를 `"manual"`로 업데이트한다

2. **인자가 없는 경우** (`/purpose`):
   - 가장 최근 active 세션 JSON 파일을 읽는다
   - `lastUserPrompt`와 대화 맥락을 분석하여 세션 목적을 1줄(최대 60자)로 요약한다
   - 요약 결과를 `purpose` 필드에, `purposeSource`를 `"auto"`로 저장한다

### 세션 파일 위치

`${CLAUDE_PLUGIN_ROOT}/data/sessions/` 디렉토리에서 가장 최근 수정된 `.json` 파일을 사용한다.

### 출력

변경된 purpose를 사용자에게 표시한다:
- `Purpose 설정: "{new purpose}"`
