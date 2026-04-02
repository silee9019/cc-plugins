---
name: memento-search
description: "메모리 검색: qmd 하이브리드 검색 + 컴팩션 트리 탐색으로 과거 세션 기억을 조회. 사용자가 '기억', '이전에', '과거', '검색', '남은 작업', 'recall', 'remember', 'search memory' 언급 시 트리거."
---

# Memento Memory Search

Search past session memories using qmd hybrid search and compaction tree traversal.

All files under `~/.claude/memento/projects/<project-id>/`.

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
cd ~/.claude/memento/user && qmd search "<query>" --top 5
```

Also check `~/.claude/memento/user/ROOT.md` for the knowledge index.

User knowledge is project-independent — useful for techniques, recipes, and patterns that apply across projects.

## Output

Present search results with:
- Source file path and date
- Relevant excerpt
- Confidence level (exact match vs. related context)
