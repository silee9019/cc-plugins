---
name: search-memory
description: "메모리 검색: qmd 하이브리드 검색 + 컴팩션 트리 탐색으로 과거 세션 기억을 조회. 사용자가 '기억', '이전에', '과거', '검색', '남은 작업', 'recall', 'remember', 'search memory' 언급 시 트리거."
---

# Memento Memory Search

Search past session memories using qmd hybrid search and compaction tree traversal.

All files under `<MEMENTO_HOME>/projects/<project-id>/`.

> `<MEMENTO_HOME>`는 세션 시작 시 SessionStart hook이 주입한 실제 경로를 참조한다. `~/.claude/plugins/data/memento-cc-plugins/config.md`가 있으면 `<vault_path>/<memento_root>`, 없으면 레거시 경로 `~/.claude/memento/`이다. 실제 경로는 system prompt 상단의 Memento Memory Protocol 블록을 확인한다.

## When to Use

- User asks about past work, decisions, or context from previous sessions
- User references something discussed "before" or "last time"
- You need historical context to make a decision
- User explicitly asks to search or recall memory

## Search Strategy

### 1. qmd Search (Primary)

```bash
qmd search "<query>" --top 10
```

Returns ranked results from all memory layers (daily logs, knowledge files, compaction nodes).

### 2. Tree Traversal (Guided Drill-Down)

When qmd results are insufficient or you need structured exploration:

1. **Read ROOT.md** — check Topics Index for relevant keywords
2. **Monthly nodes** — `memory/monthly/YYYY-MM.md` for the relevant period
3. **Weekly nodes** — `memory/weekly/YYYY-WNN.md` for more detail
4. **Daily nodes** — `memory/daily/YYYY-MM-DD.md` for day-level summary
5. **Raw logs** — `memory/YYYY-MM-DD.md` for full original detail

Always traverse top-down: ROOT → Monthly → Weekly → Daily → Raw. Never jump to raw logs directly unless the date is already known.

### 3. Knowledge Base

Check `knowledge/*.md` for curated knowledge that may answer the query without searching logs.

### 4. User Knowledge (Cross-Project)

Search cross-project knowledge for reusable patterns:

```bash
cd <MEMENTO_HOME>/user && qmd search "<query>" --top 5
```

Also check `<MEMENTO_HOME>/user/ROOT.md` for the knowledge index.

User knowledge is project-independent — useful for techniques, recipes, and patterns that apply across projects.

## Type-Aware Filtering (v2.9.0+)

Memory entries have distinct types — apply type-specific handling:

| 타입 | 출처 | 기본 상한 | 기본 동작 |
|------|------|----------|----------|
| `decision` | `<MEMENTO_HOME>/user/decisions/*.md` | 3 | frontmatter `revoked: true` / `expired: true` / archive/ 경로 파일 제외 |
| `knowledge` | `<MEMENTO_HOME>/user/knowledge/*.md` | 5 | 전체 포함 |
| `daily` / `weekly` / `monthly` | 컴팩션 트리 노드 | 제한 없음 | 시간 범위 기준 |
| `raw` | `memory/YYYY-MM-DD.md` | 1-2건 | 날짜 명시된 경우에만 |

### Filter Flags

결과 제시 시 다음 플래그를 지원한다 (사용자 요청 또는 자체 판단):

- `--type=<type>` — 지정 타입만. 복수는 쉼표(`decision,knowledge`).
- `--include-revoked` — revoked 결정 포함. 기본은 제외.
- `--include-archived` — archive/ 하위 파일 포함. 기본은 제외.
- `--cap=<N>` — 타입당 상한 재정의. 미지정 시 기본값 적용.

### Revoked/Expired 판정

decision 파일의 frontmatter를 파싱하여 판정한다:

1. `revoked: true` → 기본 제외
2. `expired: true` OR `expires` < 오늘 → 기본 제외 (단 질의에 명시적 과거 범위가 있으면 포함)
3. 경로가 `user/decisions/archive/` 하위 → 기본 제외

위 조건 중 하나라도 해당하면 qmd 원시 결과에서 필터링 후 제시한다. 제외된 결과가 있으면 요약 라인에 "excluded: N revoked/expired" 한 줄 덧붙인다.

### Type Tag 표시

각 결과 항목 앞에 타입 태그를 붙여 사용자가 한눈에 구분할 수 있게 한다:

```
[decision] qmd fork 불필요 — qmd에 한국어 형태소 분석기 fork 통합 중단
    source: user/decisions/2026-04-16-decision-qmd-fork-unnecessary.md (created 2026-04-16, exp 2026-05-16)
[knowledge] HTTP validation은 GET으로 — Istio/Envoy는 HEAD 응답에서 ETag를 벗김
    source: user/knowledge/http-validation-get-vs-head.md
[daily] 2026-04-20 — design-meeting 재설계 결정
    source: memory/daily/2026-04-20.md
```

타입당 상한을 초과하면 `... N more [type] results (use --cap=<N> to expand)` 라인으로 절단 표시.

## Output

Present search results with:
- Type tag prefix (`[decision]`, `[knowledge]`, `[daily]`, `[weekly]`, `[monthly]`, `[raw]`)
- Source file path and date
- Relevant excerpt
- Confidence level (exact match vs. related context)
- 제외된 항목 요약 (revoked/expired/archived 건수)
