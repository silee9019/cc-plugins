# workflow.yml.md

Phase 4 (Weekly Self-Improvement) GitHub Actions 워크플로우 템플릿.

- **생성 경로**: `.github/workflows/weekly-self-improve.yml`
- **목적**: 매주 일요일 cron으로 최근 7일간의 daily-critique 메트릭을 분석하여 프로젝트 가이드라인·프롬프트를 자동 개선하는 PR을 생성한다.
- **치환 변수**: `{{cron_weekly}}`, `{{runner_label}}`, `{{agent_cmd}}`, `{{agent_model}}`, `{{agent_model_flag}}`

---

````yaml
name: Weekly Self-Improvement

on:
  schedule:
    - cron: "{{cron_weekly}}"
  workflow_dispatch:

concurrency:
  group: weekly-self-improve
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write

jobs:
  improve:
    runs-on: {{runner_label}}
    env:
      AGENT_CMD: "{{agent_cmd}}"
      AGENT_MODEL: "{{agent_model}}"
      AGENT_MODEL_FLAG: "{{agent_model_flag}}"
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run weekly self-improvement
        run: |
          chmod +x .github/workflows/weekly-self-improve/run.sh
          .github/workflows/weekly-self-improve/run.sh
````
