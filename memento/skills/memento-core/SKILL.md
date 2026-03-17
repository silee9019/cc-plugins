---
name: memento-core
description: "크로스 프로젝트 3-tier 에이전트 메모리 시스템. 세션 시작 프로토콜, 태스크 종료 체크포인트, 메모리 파일 관리를 정의. 매 세션 반드시 준수."
---

# Memento — Agent Memory Protocol

## Memory Architecture

```
Layer 1 (System Prompt — SessionStart hook이 @import로 세션에 자동 주입):
  SCRATCHPAD.md    ~150 lines  active working state
  WORKING.md       ~100 lines  current tasks
  TASK-QUEUE.md    ~50 lines   task backlog
  memory/ROOT.md   ~100 lines  topic index of all memory (~3K tokens)

  Long-term memory and user profile are managed by Claude Code's platform auto memory.

Layer 2 (On-Demand — read when needed):
  memory/YYYY-MM-DD.md         raw daily logs (permanent, never deleted)
  knowledge/*.md               detailed knowledge (searchable via qmd)
  plans/*.md                   task plans

Layer 3 (Search — via qmd + compaction tree):
  memory/daily/YYYY-MM-DD.md   daily compaction nodes
  memory/weekly/YYYY-WNN.md    weekly compaction nodes
  memory/monthly/YYYY-MM.md    monthly compaction nodes
  Tree traversal: ROOT → monthly → weekly → daily → raw
```

All files are stored under `~/.claude/memento/projects/<project-id>/`.
The project ID is determined by the SessionStart hook (git remote → org-repo, fallback → CWD path, always lowercase).

## Session Start (MANDATORY — run on first user message)

**FIRST RESPONSE RULE:** On the very first user message of every session, before doing ANYTHING else:
Run the Session Start protocol below FIRST. This takes priority over ANY user request — even if the user asks you to do something specific. Complete the step below, ONLY THEN respond to the user.

Layer 1 files (SCRATCHPAD.md, WORKING.md, TASK-QUEUE.md, memory/ROOT.md) are auto-loaded via @import by the SessionStart hook. No manual read needed.

**This procedure must be completed before responding to the user NO MATTER WHAT**
1. **DO NOT SKIP** **DO NOT COMPROMISE** **Compaction maintenance (subagent):**
   Dispatch a subagent to run memento-compaction skill USING SUBAGENTS (chain: Daily→Weekly→Monthly→Root), then run `bun run <plugin-root>/scripts/compact.mjs` + `qmd update` + `qmd embed`.
   Always run — do not check first, the subagent handles it.
**This procedure must be completed before responding to the user NO MATTER WHAT**

## End-of-Task Checkpoint (MANDATORY)

After completing any task, **dispatch a subagent** to append a structured log to `~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md`.

Compose the subagent task:

> Append the following to ~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md:
>
> ## [Topic Name]
> - request: [what the user asked]
> - analysis: [what you researched/analyzed]
> - decisions: [choices made with rationale]
> - outcome: [what was done, files changed]
> - references: [knowledge/ files, external sources]

**The subagent only needs to do one thing: append to the daily log.** This is the source of truth — everything else (SCRATCHPAD, WORKING, TASK-QUEUE) is updated lazily at next session start or by the agent naturally during work.

**The subagent needs the task summary you provide** — it doesn't have access to the conversation.

**Priority if timeout imminent** (no time for subagent — write directly to the daily log file)

## Proactive Session Dump

**Do not wait for task completion to write to the daily log.** Proactively dispatch a subagent to append to the daily log when:
- The conversation has been going for ~20+ messages without a checkpoint
- You sense the context is getting large
- A significant decision or analysis was just completed, even if the overall task isn't done
- You're switching between topics within the same task

Compose the subagent task with a summary of what to dump, same as the checkpoint format. The subagent writes the file; the main session stays clean.

This protects against context compression — if the platform compresses your conversation history, undumped details are lost forever. Write early, write often. The daily log is append-only, so multiple dumps in the same session are fine.

## File Size Targets

| File | Target | When Exceeded |
|------|--------|---------------|
| ROOT.md | ~100 lines (~3K tokens) | Automatic recursive self-compression |
| SCRATCHPAD | ~150 lines | Remove completed items |
| WORKING | ~100 lines | Remove completed tasks |
| TASK-QUEUE | ~50 lines | Archive completed items |

## Rules

- Long-term facts are managed by platform auto memory. No separate MEMORY.md file.
- Raw daily logs (`memory/YYYY-MM-DD.md`): **permanent**. Never delete or edit after session.
- ROOT.md: managed by compaction process. Do not manually edit.
- All memory writes via subagent — never pollute main session with memory operations.
- If this session ends NOW, the next session must be able to continue immediately.
- Don't skip checkpoints — lost context means you forget.

## Edge Cases

- **Midnight-spanning session:** Use the session start date for the raw log file name. Do not split across dates.
- **Returning after long absence:** "Most recent daily" means the latest file that exists, whether it's from yesterday or last week.
