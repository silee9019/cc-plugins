# workflow.yml.md

Phase 5 (Visual Audit) GitHub Actions 워크플로우 템플릿.

- **생성 경로**: `.github/workflows/weekly-visual-audit.yml`
- **목적**: 매주 cron으로 대상 페이지들의 스크린샷을 캡처하고, AI Vision 분석으로 시각적 문제를 자동 탐지한다.
- **치환 변수**: `{{runner_label}}`, `{{cron_weekly}}`, `{{agent_cmd}}`, `{{agent_model}}`, `{{agent_model_flag}}`

---

````yaml
name: Weekly Visual Audit

on:
  schedule:
    - cron: "{{cron_weekly}}"
  workflow_dispatch:

concurrency:
  group: weekly-visual-audit
  cancel-in-progress: false

permissions:
  contents: read
  issues: write

jobs:
  visual-audit:
    runs-on: {{runner_label}}
    env:
      AGENT_CMD: "{{agent_cmd}}"
      AGENT_MODEL: "{{agent_model}}"
      AGENT_MODEL_FLAG: "{{agent_model_flag}}"
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Run visual audit
        run: |
          chmod +x .github/workflows/weekly-visual-audit/run.sh
          .github/workflows/weekly-visual-audit/run.sh
````
