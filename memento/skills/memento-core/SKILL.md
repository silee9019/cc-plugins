---
name: memento-core
description: "크로스 프로젝트 3-tier 에이전트 메모리 시스템. 세션 시작 프로토콜, 태스크 종료 체크포인트, 메모리 파일 관리를 정의. 매 세션 반드시 준수."
---

# Memento — Agent Memory Protocol

## Memory Architecture

```
User Tier (Cross-Project — shared across all projects):
  user/ROOT.md               cross-project knowledge index (~50 lines)
  user/knowledge/*.md        reusable lessons, recipes, techniques

Project Tier (per-project):

  Layer 1 (System Prompt — SessionStart hook이 프로토콜 전문을 stdout으로 세션에 주입):
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

Project files: `~/.claude/memento/projects/<project-id>/`
User knowledge: `~/.claude/memento/user/`
The project ID is determined by the SessionStart hook (git remote → org-repo, fallback → CWD path, always lowercase).

## Session Start

SessionStart hook (`session-start.sh`)이 매 세션 시작 시 자동으로:
1. 프로젝트 디렉토리 생성 (idempotent)
2. 프로토콜 전문을 stdout 출력 → LLM 세션에 주입
3. compact.mjs 실행으로 기계적 컴팩션 수행

주입된 프로토콜에 의해 LLM은:
- Layer 1 파일 4개를 읽고
- 컴팩션 쿨다운을 체크하여 필요 시 서브에이전트 디스패치

## End-of-Task Checkpoint (MANDATORY)

After completing any task, append a structured log to `~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md` using the Write tool (append) or Edit tool.

Log format:

> ## [Topic Name]
> - request: [what the user asked]
> - analysis: [what you researched/analyzed]
> - decisions: [choices made with rationale]
> - outcome: [what was done, files changed]
> - references: [knowledge/ files, external sources]

**This is a single Write call — minimal context impact.** This is the source of truth — everything else (SCRATCHPAD, WORKING, TASK-QUEUE) is updated lazily at next session start or by the agent naturally during work.

## Knowledge Promotion

During end-of-task checkpoint, evaluate whether any outcome is **project-independent**:
- Reusable debugging technique
- Tool/library recipe
- Environment setup pattern
- Cross-cutting architectural insight

If yes, write to `~/.claude/memento/user/knowledge/<slug>.md`:

```markdown
---
title: <descriptive title>
source-project: <project-id>
created: YYYY-MM-DD
tags: [tag1, tag2]
---
<content — concise, actionable, keyword-dense>
```

**Criteria:** Only promote if the knowledge would be useful in a different project. When in doubt, don't promote. Prefer updating an existing knowledge file over creating a new one if the topic overlaps.

## Proactive Session Dump

**Do not wait for task completion to write to the daily log.** Proactively append when:
- The conversation has been going for ~20+ messages without a checkpoint
- You sense the context is getting large
- A significant decision or analysis was just completed, even if the overall task isn't done
- You're switching between topics within the same task

Use the same log format as the checkpoint. Write directly — one Write call is minimal context impact.

This protects against context compression — if the platform compresses your conversation history, undumped details are lost forever. Write early, write often. The daily log is append-only, so multiple dumps in the same session are fine.

## Compaction Triggers

컴팩션은 3개 타이밍에서 자동 실행:
- **SessionStart**: session-start.sh에서 compact.mjs 실행
- **PreCompact**: context window 압축 직전 hook으로 compact.mjs 실행
- **TaskCompleted**: 태스크 완료 시 hook으로 compact.mjs 실행

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
- Checkpoint writes are direct — one Write call is minimal context impact. Use subagents only for heavy operations (compaction, search).
- If this session ends NOW, the next session must be able to continue immediately.
- Don't skip checkpoints — lost context means you forget.

## Edge Cases

- **Midnight-spanning session:** Use the session start date for the raw log file name. Do not split across dates.
- **Returning after long absence:** "Most recent daily" means the latest file that exists, whether it's from yesterday or last week.
