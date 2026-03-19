# workflow.yml.md

Phase 3 (Issue Pipeline) GitHub Actions 워크플로우 템플릿.

- **생성 경로**: `.github/workflows/issue-pipeline.yml`
- **목적**: 라벨이 붙은 이슈를 자동으로 감지하여 계획 → 승인 → 구현 → 검증 파이프라인을 실행한다.
- **치환 변수**: `{{runner_label}}`, `{{agent_cmd}}`, `{{agent_model}}`, `{{agent_model_flag}}`, `{{bot_account}}`, `{{test_cmd}}`, `{{lint_cmd}}`, `{{daily_limit}}`

---

````yaml
name: Issue Pipeline

on:
  issues:
    types: [labeled]
  issue_comment:
    types: [created]
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

concurrency:
  group: issue-pipeline
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  pipeline:
    runs-on: {{runner_label}}
    if: >-
      github.event_name == 'schedule' ||
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'issues' && github.event.label.name == 'auto-implement') ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@{{bot_account}} approve'))
    env:
      AGENT_CMD: "{{agent_cmd}}"
      AGENT_MODEL: "{{agent_model}}"
      AGENT_MODEL_FLAG: "{{agent_model_flag}}"
      BOT_ACCOUNT: "{{bot_account}}"
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      TEST_CMD: "{{test_cmd}}"
      LINT_CMD: "{{lint_cmd}}"
      DAILY_LIMIT: "{{daily_limit}}"
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run issue pipeline
        run: |
          chmod +x .github/workflows/issue-pipeline/run.sh
          .github/workflows/issue-pipeline/run.sh
````
