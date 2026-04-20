---
name: memento-core
description: "나의 기억이자 멘토. 세션 간 컨텍스트 보존(Memory) + 하루 계획·캡처·회고·인계(Mentor). 세션 시작 프로토콜, 태스크 종료 체크포인트, 지식 승격, 컴팩션 규칙. 매 세션 반드시 준수."
---

# Memento — Memory × Mentor Protocol

> **memento = Memory × Mentor**. 두 레이어는 같은 사용자, 같은 vault, 같은 config를 공유한다. Mentor 레이어의 모든 행동은 자연스럽게 Memory 레이어에 기록된다 (planning 실행 로그가 raw에 append, review-week가 컴팩션 노드를 재료로 삼음).
>
> - **Memory 레이어**: 세션 로그, 5-level 컴팩션 트리, WORKING.md, user knowledge, qmd 검색. 무엇이 있었는지 잊지 않는다.
> - **Mentor 레이어**:
>   - `/memento:planning` (업무 파악/정리/분류/발굴/선택)
>   - `/memento:capture-task` (백로그 유입)
>   - `/memento:tag-decision` (결정 즉시 태깅 → `user/decisions/`)
>   - `/memento:handoff` (세션 인계 메모 - 진행 중 상태 저장, 수시 호출)
>   - `/memento:checkpoint` (작업 완료 + 정리 - 커밋/푸시/PR 포함, 결정 후보 감지)
>   - `/memento:review-day|week|objectives` (회고 - review-day는 **하루 마감 의례**)
>   - `/memento:review-memento` (산출물 품질 평가 - 스킬 지속 개선)
>
> **스킬 구분**: handoff=진행 중 저장(가볍고 수시), checkpoint=작업 완료 정리(커밋/캘린더), review-day=하루 마감 의례.
>
> **Mentor 톤**: 사용자의 흐름을 끊지 않는다. 모호한 지점이 남으면 한 번에 하나의 질문만 `AskUserQuestion`으로 묻는다.

# Memento — Agent Memory Protocol

## Events × Handlers × Results

memento 플러그인이 반응하는 이벤트와 그 결과. "지금 무엇이 자동으로 일어나는가"를 이 표로 확인한다.

| Event | Handler | 효과 |
|---|---|---|
| `SessionStart` | `scripts/session-start.sh` | 프로젝트/user 디렉토리 멱등 setup. 동적 컨텍스트 주입(KST, 캘린더, Layer 1 경로, active-reminders, daily hint). Layer 1 파일 읽기 지시. |
| `PreCompact` | `scripts/run-compaction.sh` → `compact.mjs` | 기계적 컴팩션(raw→daily→weekly→monthly→ROOT). 3시간 쿨다운 게이트. |
| `UserPromptSubmit` | `scripts/tick.sh` | 다음 턴을 위한 KST 시각 갱신. |
| `PostToolUse` (Skill) | `scripts/skill-tracker.sh` | Skill 호출을 메트릭 DB에 기록. |
| `Stop` | `scripts/tick.sh` + `scripts/run-compaction.sh` | assistant 응답 완료 직후 KST 시각 주입 + 완료 효과음(tick.sh 내부, 파일 존재 시) + 컴팩션(3시간 쿨다운 게이트). |

**자동 vs 명시 구분**:
- **자동(hooks)**: 세션 setup, 시각 갱신, 컴팩션 쿨다운 게이트 — 사용자 개입 없이 작동
- **명시(skills/commands)**: knowledge 승격, `/memento:planning`, `/memento:tag-decision`, `/memento:checkpoint`, `/memento:review-day|week|objectives`, `/memento:capture-task`, `/memento:search-memory` — 사용자 의도가 필요한 변환

프로토콜 전문(규칙·형식)은 아래 섹션에 있다. `session-start.sh`는 이 파일을 중복 주입하지 않고, 동적 컨텍스트 + Layer 1 경로 지시만 세션에 주입한다.

## Memory Architecture

```
User Scope (Cross-Project — shared across all projects):
  user/ROOT.md               cross-project knowledge index (~50 lines)
  user/knowledge/*.md        reusable lessons, recipes, techniques

Project Scope (per-project):

  Layer 1 (System Prompt — SessionStart hook이 절대 경로 + 동적 컨텍스트만 주입):
    WORKING.md       ~100 lines  session handoff / active tasks
    memory/ROOT.md   ~100 lines  topic index of all memory (~3K tokens)

    Long-term memory and user profile are managed by Claude Code's platform auto memory.

  Layer 2 (On-Demand — read when needed):
    memory/YYYY-MM-DD-log.md                       raw daily log (permanent, append-only)
    memory/YYYY-MM-DD-HHmm-handoff-{slug}.md       per-handoff standalone files
    knowledge/*.md                                 detailed knowledge (searchable via qmd)
    plans/*.md                                     task plans

  Layer 3 (Search — via qmd + compaction tree):
    memory/daily/YYYY-MM-DD.md   daily compaction nodes (merged from -log + handoffs)
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
| `memento_root` | `97 Memento` | vault 내 memento 서브디렉토리 (숫자 접두어로 Obsidian 사이드바 하단 고정) |

### Mentor 레이어

| key | 기본값 | 용도 |
|-----|--------|------|
| `daily_notes_path` | `01 Working` | 오늘 Daily 루트 (현재 진행 중인 날짜) |
| `daily_note_format` | `{YYYY}-{MM}-{DD}-planning.md` | 오늘 Daily 파일명 포맷 (유형 = `planning`) |
| `daily_archive_path` | `99 Archives/Daily` | 지난 Daily 아카이브 루트 (빈 값이면 이중 경로 비활성) |
| `daily_archive_format` | `{YYYY}/{MM}/{YYYY}-{MM}-{DD}-planning.md` | 지난 Daily 파일명 포맷 |
| `weekly_notes_path` | `10 Reflection/01 Weekly` | 주간 노트 루트 |
| `weekly_note_format` | `{YYYY}/{YYYY}-W{WW}-weekly-review.md` | 파일명 포맷 (ISO week + 유형) |
| `monthly_notes_path` | `10 Reflection/02 Monthly` | 월간 노트 루트 |
| `monthly_note_format` | `{YYYY}/{YYYY}-{MM}-monthly-review.md` | 월간 노트 파일명 포맷 |
| `inbox_folder_path` | `00 Inbox` | 미결 이슈/아이디어 버퍼 |
| `in_progress_folder_path` | `01 Working` | 진행 중 |
| `resolved_folder_path` | 빈 값 | 완료 이슈는 도메인 폴더로 이동(단일 저장소 없음) |
| `dismissed_folder_path` | 빈 값 | 폐기 이슈는 99 Archives 하위로 이동 |
| `file_title_format` | `{date}-{title}` | 이슈 파일명 포맷 (카테고리는 frontmatter에만 기록) |
| `decision_note_format` | `{YYYY}-{MM}-{DD}-decision-{slug}.md` | user/ontology decision 공통 파일명 포맷 |
| `daily_log_format` | `{YYYY}-{MM}-{DD}-log.md` | compact용 일일 누적 raw 로그 파일명 |
| `handoff_note_format` | `{YYYY}-{MM}-{DD}-{HHmm}-handoff-{slug}.md` | handoff마다 별도 파일 |

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
1. 프로젝트/user 디렉토리 생성 (idempotent)
2. **동적 컨텍스트만** stdout 출력 → LLM 세션에 주입:
   - 해석된 KST 시각 + 영업일 블록
   - 캘린더 컨텍스트 (회사 + 개인)
   - Layer 1 파일의 **절대 경로**
   - active-reminders (미만료 시)
   - 오늘 Daily Note 힌트
   - 짧은 지시문 ("Read Layer 1 now, follow memento-core skill rules")
3. 정적 규칙·형식(프로토콜 전문)은 이 SKILL.md 본문에 있으며, hook이 중복 주입하지 않는다 — 토큰 효율성을 위해

주입된 지시문에 따라 LLM은:
- Layer 1 파일(WORKING.md, memory/ROOT.md, user/ROOT.md)을 읽고
- 필요 시 이 SKILL.md의 체크포인트·승격·컴팩션 규칙을 조회한다

컴팩션(`compact.mjs`)은 SessionStart가 아닌 PreCompact 훅에서 실행되며, 3시간 쿨다운을 자체 관리한다. needs-summarization 노드 존재 시 서브에이전트 디스패치.

## End-of-Task Checkpoint (MANDATORY)

After completing any task, append a structured log to `<MEMENTO_HOME>/projects/<project-id>/memory/YYYY-MM-DD-log.md` using the Write tool (append) or Edit tool.

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

컴팩션 자동 실행:
- **SessionStart**: session-start.sh에서 compact.mjs 실행
- **PreCompact**: context window 압축 직전 hook으로 compact.mjs 실행
- **Stop**: assistant 응답 완료 직후 hook으로 compact.mjs 실행 (3시간 쿨다운 게이트)

## File Size Targets

| File | Target | When Exceeded |
|------|--------|---------------|
| ROOT.md | ~100 lines (~3K tokens) | Automatic recursive self-compression |
| WORKING | ~100 lines | Overwrite with latest handoff |

## Rules

- Long-term facts are managed by platform auto memory. No separate MEMORY.md file.
- Raw daily logs (`memory/YYYY-MM-DD-log.md`) and handoff notes (`memory/YYYY-MM-DD-HHmm-handoff-*.md`): **permanent**. Never delete or edit after session.
- ROOT.md: managed by compaction process. Do not manually edit.
- Checkpoint writes are direct — one Write call is minimal context impact. Use subagents only for heavy operations (compaction, search).
- If this session ends NOW, the next session must be able to continue immediately.
- Don't skip checkpoints — lost context means you forget.
- 사용자 식별 필드(`display_name_*`, `initials`, `user_id`, `nickname`, `email`, `aliases`, `atlassian_account_id`)는 모든 memento 스킬이 Step 1 설정 로드에서 동일한 방식으로 읽고 내부 컨텍스트에 2-3줄 블록으로 고정한다. 신규 스킬 추가 시 누락 금지. `atlassian_account_id`는 setup이 `atlassianUserInfo` MCP로 자동 채우므로 스킬이 사용자에게 물어서는 안 된다.

## Edge Cases

- **Midnight-spanning session:** Use the session start date for the raw log file name. Do not split across dates.
- **Returning after long absence:** "Most recent daily" means the latest file that exists, whether it's from yesterday or last week.
