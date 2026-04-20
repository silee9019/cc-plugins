#!/usr/bin/env python3
"""Bundle 6 collector outputs into a unified timeline + counts.

Usage:
  bundle_week.py <DAILY_JSON> <MEMENTO_JSON> <COMMITS_JSON> <ISSUES_JSON>
                 <JIRA_JSON> <CONFLUENCE_JSON>

Output: JSON to stdout with `timeline` (sorted) and `counts` (aggregated).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


_PRIORITY = {"daily": 1, "memento": 2, "jira": 3, "confluence": 4, "commit": 5, "issue": 6}
_PREVIEW_LEN = 80


def load_json(path_str: str) -> dict:
    p = Path(path_str)
    if not p.is_file():
        print(f"[bundle_week] missing input: {p}", file=sys.stderr)
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"[bundle_week] failed to read {p}: {e}", file=sys.stderr)
        return {}


def truncate(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= _PREVIEW_LEN:
        return text
    return text[: _PREVIEW_LEN - 1] + "…"


def build_entries(daily: dict, memento: dict, commits: dict, issues: dict, jira: dict, confluence: dict) -> list[dict]:
    entries: list[dict] = []

    for note in daily.get("notes", []):
        path = note.get("path", "")
        ref = Path(path).name if path else f'{note.get("date", "")}.md'
        preview_src = ""
        if note.get("plan"):
            preview_src = note["plan"][0]
        elif note.get("log"):
            preview_src = note["log"][0]
        elif note.get("tasks"):
            preview_src = note["tasks"][0].get("text", "")
        entries.append({
            "date": note.get("date", ""),
            "source": "daily",
            "ref": ref,
            "preview": truncate(preview_src),
        })

    for session in memento.get("sessions", []):
        ref = session.get("id") or session.get("title") or "session"
        entries.append({
            "date": (session.get("started_at") or session.get("date") or "")[:10],
            "source": "memento",
            "ref": str(ref),
            "preview": truncate(session.get("title", "") or session.get("outcome", "")),
        })

    for repo in commits.get("repos", []):
        repo_name = repo.get("name", "?")
        for c in repo.get("commits", []):
            entries.append({
                "date": c.get("date", ""),
                "source": "commit",
                "ref": f'{repo_name}@{c.get("hash", "")[:7]}',
                "preview": truncate(c.get("message", "")),
            })

    for issue in issues.get("issues", []):
        path = issue.get("path", "")
        ref = Path(path).name if path else issue.get("title", "issue")
        entries.append({
            "date": issue.get("created", ""),
            "source": "issue",
            "ref": ref,
            "preview": truncate(issue.get("title", "")),
        })

    for ji in jira.get("issues", []):
        entries.append({
            "date": (ji.get("updated") or "")[:10],
            "source": "jira",
            "ref": ji.get("key", "?"),
            "preview": truncate(ji.get("summary", "")),
        })

    for page in confluence.get("pages", []):
        entries.append({
            "date": (page.get("lastmodified") or "")[:10],
            "source": "confluence",
            "ref": page.get("title", "?"),
            "preview": truncate(page.get("excerpt") or page.get("title", "")),
        })

    return entries


def dedup_and_sort(entries: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for e in entries:
        key = (e["source"], e["ref"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(e)
    unique.sort(key=lambda e: (e["date"], _PRIORITY.get(e["source"], 99), e["ref"]))
    return unique


def aggregate_counts(daily, memento, commits, issues, jira, confluence) -> dict:
    return {
        "daily_notes": daily.get("counts", {}).get("daily_notes", 0),
        "memento_sessions": memento.get("counts", {}).get("memento_sessions", 0),
        "commits": commits.get("counts", {}).get("commits", 0),
        "active_repos": commits.get("counts", {}).get("active_repos", 0),
        "issues": issues.get("counts", {}).get("issues", 0),
        "jira_issues": len(jira.get("issues", [])),
        "confluence_pages": len(confluence.get("pages", [])),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 7:
        print(
            "Usage: bundle_week.py <DAILY> <MEMENTO> <COMMITS> <ISSUES> <JIRA> <CONFLUENCE>",
            file=sys.stderr,
        )
        return 2
    daily = load_json(argv[1])
    memento = load_json(argv[2])
    commits = load_json(argv[3])
    issues = load_json(argv[4])
    jira = load_json(argv[5])
    confluence = load_json(argv[6])

    entries = build_entries(daily, memento, commits, issues, jira, confluence)
    timeline = dedup_and_sort(entries)
    counts = aggregate_counts(daily, memento, commits, issues, jira, confluence)

    out = {"timeline": timeline, "counts": counts}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
