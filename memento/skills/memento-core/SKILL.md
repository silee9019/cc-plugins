---
name: memento-core
description: "나의 기억이자 멘토. 크로스 프로젝트 2-scope 3-layer 에이전트 메모리(Memory 레이어) + 하루 계획·캡처·회고·인계 워크플로우(Mentor 레이어). 세션 시작 프로토콜, 태스크 종료 체크포인트, 메모리 파일 관리. 매 세션 반드시 준수."
---

# Memento — Memory × Mentor Protocol

> **memento = Memory × Mentor**. 두 레이어는 같은 사용자, 같은 vault, 같은 config를 공유한다. Mentor 레이어의 모든 행동은 자연스럽게 Memory 레이어에 기록된다 (planning 실행 로그가 raw에 append, review-week가 컴팩션 노드를 재료로 삼음).
>
> - **Memory 레이어**: 세션 로그, 5-level 컴팩션 트리, WORKING.md, user knowledge, qmd 검색. 무엇이 있었는지 잊지 않는다.
> - **Mentor 레이어**: `/memento:planning` (업무 파악/정리/분류/발굴/선택), `/memento:capture-task` (백로그 유입), `/memento:review-day|week|objectives` (회고 삼중 대칭), `/memento:wrap-up` (세션 마무리+인계). 무엇을 할지 어떻게 돌아볼지 함께 결정한다.
>
> **Mentor 톤**: 사용자의 흐름을 끊지 않는다. 결정에 필요한 정보는 자체 도구로 최대한 수집한 후, 모호한 지점이 남으면 한 번에 하나의 질문만 `AskUserQuestion`으로 묻는다. 여러 결정을 일괄 처리하지 않는다.

# Memento — Agent Memory Protocol

## Memory Architecture

```
User Scope (Cross-Project — shared across all projects):
  user/ROOT.md               cross-project knowledge index (~50 lines)
  user/knowledge/*.md        reusable lessons, recipes, techniques

Project Scope (per-project):

  Layer 1 (System Prompt — SessionStart hook이 프로토콜 전문을 stdout으로 세션에 주입):
    WORKING.md       ~100 lines  session handoff / active tasks
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

Project files: `<MEMENTO_HOME>/projects/<project-id>/`
User knowledge: `<MEMENTO_HOME>/user/`

`<MEMENTO_HOME>`는 SessionStart hook이 주입한 실제 경로다:
- `~/.claude/plugins/data/memento-cc-plugins/config.md`가 있으면 `<vault_path>/<memento_root>` (Obsidian vault 내부)
- 없으면 레거시 경로 `~/.claude/memento/` (1.8.0에서 제거 예정)

실제 경로는 system prompt 상단의 Memento Memory Protocol 블록에 이미 해석된 절대경로로 포함되어 있으니 그것을 참조한다.

The project ID is determined by the SessionStart hook (git remote → org-repo, fallback → CWD path, always lowercase).

## Config Schema

`~/.claude/plugins/data/memento-cc-plugins/config.md`는 setup 명령의 산출물이자 모든 memento 스킬의 단일 참조점이다. 키 추가/변경은 반드시 `commands/setup.md`에서 먼저 수행한다 (이 섹션은 요약 참조용).

### Memory 레이어

| key | 기본값 | 용도 |
|-----|--------|------|
| `setup_version` | plugin.json 버전 | 업그레이드 판별 |
| `vault_path` | (인터뷰) | Obsidian vault 절대경로 |
| `memento_root` | `_memento` | vault 내 memento 서브디렉토리 |

### Mentor 레이어

| key | 기본값 | 용도 |
|-----|--------|------|
| `daily_notes_path` | `01 Daily Notes` | 일일 노트 루트 |
| `daily_note_format` | `{YYYY}/{MM}/{YYYY}-{MM}-{DD}.md` | 파일명 포맷 |
| `weekly_notes_path` | `02 Weekly Notes` | 주간 노트 루트 |
| `weekly_note_format` | `{YYYY}/{YYYY} Week-{WW}.md` | 파일명 포맷 |
| `monthly_notes_path` | `02 Weekly Notes` | 월간 노트 루트 |
| `inbox_folder_path` | `00 Issue Box/00-inbox` | Issue Box inbox |
| `in_progress_folder_path` | `00 Issue Box/01-in-progress` | 진행 중 |
| `resolved_folder_path` | `00 Issue Box/02-done` | 완료 |
| `dismissed_folder_path` | `00 Issue Box/03-dismissed` | 폐기 |
| `file_title_format` | `{date} {category} {title}` | 이슈 파일명 포맷 |

### 사용자 식별

| key | 기본값 | 용도 |
|-----|--------|------|
| `display_name_ko` | 빈 값 | 표시 이름 (국문) |
| `display_name_en` | 빈 값 | 표시 이름 (영문) |
| `initials` | 빈 값 | 이니셜 - 짧은 형식 멘션 감지 |
| `user_id` | 빈 값 | 주 아이디/로그인 핸들 - GitHub author 등 |
| `nickname` | 빈 값 | 닉네임 - 비공식 호칭 감지 |
| `email` | 빈 값 | 주 이메일 주소 - git commit author |
| `aliases` | 빈 값 | alias 쉼표 구분 - 멀티 핸들/과거 이름 |
| `atlassian_account_id` | **setup 자동 조회** | Jira JQL assignee 필터. setup Step 6.6이 `atlassianUserInfo` MCP로 자동 채움. 실패 시 review-week 첫 실행에서 재시도 |

`atlassian_account_id`는 사용자에게 묻지 않는다. 나머지는 인터뷰로 수집하며 빈 값 허용.

### 외부 연동 (옵션)

| key | 기본값 | 용도 |
|-----|--------|------|
| `repos_base_path` | 빈 값 | review-week 레포 자동 탐지 루트 |
| `atlassian_site_url` | 빈 값 | Atlassian 연동 활성 스위치 (URL 저장) |
| `atlassian_cloud_id` | 빈 값 | Jira/Confluence MCP cloudId (자동 캐시) |

## Session Start

SessionStart hook (`session-start.sh`)이 매 세션 시작 시 자동으로:
1. 프로젝트 디렉토리 생성 (idempotent)
2. 프로토콜 전문을 stdout 출력 → LLM 세션에 주입
3. compact.mjs 실행으로 기계적 컴팩션 수행

주입된 프로토콜에 의해 LLM은:
- Layer 1 파일 4개를 읽고
- compact.mjs가 쿨다운을 자체 관리 (3시간). needs-summarization 노드 존재 시 서브에이전트 디스패치

## End-of-Task Checkpoint (MANDATORY)

After completing any task, append a structured log to `<MEMENTO_HOME>/projects/<project-id>/memory/YYYY-MM-DD.md` using the Write tool (append) or Edit tool.

Log format:

> ## [Topic Name]
> - request: [what the user asked]
> - analysis: [what you researched/analyzed]
> - decisions: [choices made with rationale]
> - outcome: [what was done, files changed]
> - references: [knowledge/ files, external sources]

**This is a single Write call — minimal context impact.** This is the source of truth — WORKING.md is updated lazily at next session start or by the agent naturally during work.

## Knowledge Promotion

During end-of-task checkpoint, evaluate whether any outcome is **project-independent**:
- Reusable debugging technique
- Tool/library recipe
- Environment setup pattern
- Cross-cutting architectural insight

If yes, write to `<MEMENTO_HOME>/user/knowledge/<slug>.md`:

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
| WORKING | ~100 lines | Overwrite with latest handoff |

## Rules

- Long-term facts are managed by platform auto memory. No separate MEMORY.md file.
- Raw daily logs (`memory/YYYY-MM-DD.md`): **permanent**. Never delete or edit after session.
- ROOT.md: managed by compaction process. Do not manually edit.
- Checkpoint writes are direct — one Write call is minimal context impact. Use subagents only for heavy operations (compaction, search).
- If this session ends NOW, the next session must be able to continue immediately.
- Don't skip checkpoints — lost context means you forget.
- 사용자 식별 필드(`display_name_*`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id`)는 모든 memento 스킬이 Step 1 설정 로드에서 동일한 방식으로 읽고 내부 컨텍스트에 2-3줄 블록으로 고정한다. 신규 스킬 추가 시 누락 금지. `atlassian_account_id`는 setup이 `atlassianUserInfo` MCP로 자동 채우므로 스킬이 사용자에게 물어서는 안 된다.

## Edge Cases

- **Midnight-spanning session:** Use the session start date for the raw log file name. Do not split across dates.
- **Returning after long absence:** "Most recent daily" means the latest file that exists, whether it's from yesterday or last week.
