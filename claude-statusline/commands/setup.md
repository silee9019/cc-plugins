---
description: statusLine 설정을 settings.json에 자동 등록
allowed-tools: Bash, Read, Write
argument-hint: ""
---

## Statusline 설정 등록

### 동작

1. `${CLAUDE_PLUGIN_ROOT}` 경로를 확인한다
2. `~/.claude/settings.json` 파일을 읽는다
3. `statusLine` 항목을 다음으로 업데이트한다:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bun run ${CLAUDE_PLUGIN_ROOT}/scripts/statusline.ts"
  }
}
```

여기서 `{CLAUDE_PLUGIN_ROOT}`는 실제 플러그인 캐시 경로로 치환한다.

### 플러그인 경로 탐지

`~/.claude/plugins/cache/` 하위에서 `claude-statusline` 디렉토리를 검색한다:
```bash
find ~/.claude/plugins/cache/ -type d -name "claude-statusline" 2>/dev/null | head -1
```

발견된 경로에서 가장 최신 버전 디렉토리를 선택한다.

### 출력

- 성공: `settings.json의 statusLine이 업데이트되었습니다. Claude Code를 재시작하세요.`
- 실패: `플러그인 경로를 찾을 수 없습니다. /plugin install을 먼저 실행하세요.`

### 주의사항

- 플러그인 버전 업데이트 시 `/setup`을 다시 실행해야 합니다
- 기존 statusLine 설정은 백업 후 덮어씁니다
