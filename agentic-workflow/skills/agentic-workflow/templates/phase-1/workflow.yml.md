# workflow.yml.md

Phase 1 (Daily Self-Critique) GitHub Actions 워크플로우 템플릿.

- **생성 경로**: `.github/workflows/daily-critique.yml`
- **목적**: 매일 cron으로 bot PR 출력물을 수집하고, 에이전트가 품질 평가를 수행한 뒤 저점수 항목을 이슈로 생성한다.
- **치환 변수**: `{{cron_daily}}`, `{{runner_label}}`, `{{agent_cmd}}`, `{{agent_model}}`, `{{agent_model_flag}}`, `{{bot_account}}`

---

````yaml
name: Daily Self-Critique

on:
  schedule:
    - cron: "{{cron_daily}}"
  workflow_dispatch:

concurrency:
  group: daily-critique
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: read
  issues: write

jobs:
  critique:
    runs-on: {{runner_label}}
    env:
      AGENT_CMD: "{{agent_cmd}}"
      AGENT_MODEL: "{{agent_model}}"
      AGENT_MODEL_FLAG: "{{agent_model_flag}}"
      BOT_ACCOUNT: "{{bot_account}}"
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run daily critique
        run: |
          chmod +x .github/workflows/daily-critique/run.sh
          .github/workflows/daily-critique/run.sh
````
