---
description: 현재 세션의 목적(purpose)을 설정하거나 자동 생성
allowed-tools: Bash, Read, Write, Glob
argument-hint: "[purpose text]"
---

## 세션 Purpose 관리

인자 값 확인 → user input: $ARGUMENTS

---

### CASE A — 인자가 있는 경우 (예: `/purpose API 인증 리팩토링`)

1. `${CLAUDE_PLUGIN_ROOT}/data/sessions/` 디렉토리에서 가장 최근 수정된 active `.json` 세션 파일을 찾는다
2. 해당 파일의 `purpose` 필드를 인자 텍스트로, `purposeSource`를 `"manual"`로, `ticketId`는 프롬프트에서 티켓 패턴(`[A-Z]{2,10}-\d+` 또는 `#\d+`)을 추출하여 업데이트한다
3. 출력: `Purpose 설정: "<text>"`

---

### CASE B — 인자가 없는 경우 (`/purpose`)

빈 입력이라고 말하지 말 것. 대신 다음을 수행:

1. `${CLAUDE_PLUGIN_ROOT}/data/sessions/`에서 가장 최근 active 세션 파일을 읽는다
2. `~/.claude/projects/` 하위에서 현재 작업 디렉토리와 매칭되는 가장 최근 `.jsonl` transcript 파일을 찾는다
3. Transcript 내용을 기반으로 세션 목적을 60자 이내, 대화와 같은 언어로 간결하게 생성한다
4. 세션 파일의 `purpose`를 생성한 텍스트로, `purposeSource`를 `"manual"`로 업데이트한다
5. 출력: `Purpose 설정: "<generated text>"`
