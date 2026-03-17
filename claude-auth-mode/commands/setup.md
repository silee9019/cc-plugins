---
description: Claude Code 인증 모드 전환 초기 설정 (sops+age 기반)
allowed-tools: Bash, Read
argument-hint: ""
---

# Claude Auth Setup

## Workflow

### Step 1: 셋업 스크립트 실행

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh
```

### Step 2: 결과 확인

스크립트 출력을 사용자에게 보여준다.
CHANGE_ME가 남아있으면 "다음 단계" 안내가 출력된다.

### Step 3: 안내

셋업 완료 후 사용자에게 다음을 안내한다:

- `foundry.sops.env` 편집이 필요하면: `sops-env ~/.claude-auth/foundry.sops.env`
- 이미 암호화되어 있으면: `source ~/.zshrc && cams`로 확인
- `claude-auth-mode.zsh` 업데이트 시: `/claude-auth-mode:setup` 재실행
