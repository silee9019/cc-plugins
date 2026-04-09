---
name: memento-flush
description: "수동 메모리 플러시: 현재 세션 컨텍스트를 일일 로그에 저장. /memento-flush로 실행. 이후 memento-compaction으로 트리 전파 및 qmd reindex."
user_invocable: true
---

# Memento Memory Flush

Dump current session context to the daily raw log. Use when you want to persist what happened in this session without waiting for End-of-Task Checkpoint or context compression.

For full compaction (needs-summarization processing, tree propagation, qmd reindex), run memento-compaction skill after this.

All files under `~/.claude/memento/projects/<project-id>/`.

## Steps

### 1. Compose session summary

Gather a summary of everything discussed in this session so far. For each topic:
```markdown
## [Topic Name]
- request: what the user asked
- analysis: what you researched/analyzed
- decisions: choices made with rationale
- outcome: what was done, files changed
- references: knowledge/ files, external sources
```

### 2. Write to daily log

Append the session summary to `~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md` (today's date) using the Write tool (append) or Edit tool.

### 3. Run compaction

```bash
bun run <plugin-root>/scripts/compact.mjs --force
```

`--force` 플래그로 3시간 쿨다운을 바이패스. 수동 플러시는 항상 즉시 컴팩션 실행.

### 4. Report

Confirm the flush completed:
- Topics flushed
- Compaction result
