---
description: MS Teams 채팅/채널 메시지를 별칭으로 가져와 세션 컨텍스트에 로드. 인자 형식 `<alias> [--since 2h|1d|7d|YYYY-MM-DD] [--limit N]`.
allowed-tools: Bash, Read
argument-hint: <alias> [--since 1d] [--limit 200]
---

# msteams-fetch

등록된 별칭으로 Teams 메시지를 가져와 파일로 저장하고, Claude가 읽어 세션 컨텍스트에 포함시킨다.

## 사용 절차

1. **Bash로 다음 명령을 실행한다**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" fetch $ARGUMENTS
```

2. stdout의 마지막 줄이 생성된 파일의 절대 경로다. 그 경로를 **Read 도구로 열어** 내용을 세션에 포함시킨다.
3. 파일은 markdown frontmatter + 날짜별 섹션 + 메시지 목록 형식이다. 사용자 질문의 배경 컨텍스트로 활용한다.

## fetch-all (전체 가져오기)

등록된 모든 별칭을 순회하며 메시지를 가져온다. `exclude_from_all: true`인 별칭은 자동 제외.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" fetch-all --since 1d
```

- `--exclude hub-tf,connect-infra`: 추가 제외할 별칭 (쉼표 구분)
- 각 별칭별 개별 파일로 저장. stdout에 파일 경로 목록 출력.
- Read 도구로 필요한 파일만 선택적으로 읽는다.

## 에러 처리

- "설정 파일이 없습니다" → 사용자에게 README 초기 설정 안내
- "별칭 'xxx'을(를) 찾을 수 없습니다" → `msteams-fetch list`로 등록된 별칭 확인 권유. 유사 별칭이 있으면 제안됨
- "Graph API 401/403" → 토큰 만료. `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs login` 재로그인 안내
- "Graph API 404" → 해당 chatId/channelId에 접근 권한 없음. 내가 멤버인지 확인

## 별칭 추가

이 슬래시 커맨드는 fetch만 담당한다. 별칭 추가는 터미널에서 직접:

```bash
node ~/ResilioSync/silee-drive/Repositories/silee9019/cc-plugins/msteams-fetch/scripts/cli.mjs add-alias <name> "<teams-url>"
```

Teams 앱에서 메시지의 `...` → "링크 복사"로 얻은 URL을 사용한다.
