#!/usr/bin/env python3
"""Merge collected JSON sources into a single chronological timeline.

Usage:
    bundle_week.py <daily_notes_json> <memento_json> <commits_json> <issues_json> [jira_json] [confluence_json]

No statistics, no analysis. Pure merge + sort.
Empty string arguments or missing files are skipped silently.

Output: JSON on stdout.
"""

import json
import os
import sys

SOURCE_ORDER = {
    "daily_notes": 0,
    "memento": 1,
    "jira": 2,
    "confluence": 3,
    "commits": 4,
    "issues": 5,
}


def load_json(path: str) -> dict:
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"Load error {path}: {e}", file=sys.stderr)
        return {}


def trim(text: str, limit: int = 200) -> str:
    if not text:
        return ""
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def from_daily_notes(data: dict) -> list:
    items = []
    for day in data.get("days", []):
        date = day.get("date", "")
        sections = day.get("sections", {})
        for key in ("review", "log", "plan", "tasks"):
            text = sections.get(key, "")
            if text.strip():
                items.append({
                    "date": date,
                    "source": "daily_notes",
                    "ref": key,
                    "preview": trim(text),
                })
    for note in data.get("side_notes", []):
        items.append({
            "date": note.get("date", ""),
            "source": "daily_notes",
            "ref": f"side_note:{note.get('name', '')}",
            "preview": trim(note.get("body", "")),
        })
    return items


def from_memento(data: dict) -> list:
    items = []
    for session in data.get("sessions", []):
        date = session.get("date", "")
        project = session.get("project", "")
        for topic in session.get("topics", []):
            summary = topic.get("outcome") or topic.get("decisions") or topic.get("analysis") or topic.get("raw", "")
            items.append({
                "date": date,
                "source": "memento",
                "ref": f"{project}: {topic.get('title', '')}",
                "preview": trim(summary),
            })
    return items


def from_commits(data: dict) -> list:
    items = []
    for repo in data.get("repos", []):
        name = repo.get("name", "")
        for commit in repo.get("commits", []):
            raw_date = commit.get("date", "")
            day = raw_date.split()[0] if raw_date else ""
            items.append({
                "date": day,
                "source": "commits",
                "ref": f"{name}: {commit.get('hash', '')[:7]}",
                "preview": trim(commit.get("message", "")),
            })
    return items


def from_issues(data: dict) -> list:
    items = []
    for issue in data.get("issues", []):
        date = issue.get("created") or issue.get("resolved_at") or ""
        items.append({
            "date": date,
            "source": "issues",
            "ref": f"{issue.get('status', '')}:{issue.get('title', '')}",
            "preview": trim(issue.get("summary", "") or issue.get("title", "")),
        })
    return items


def from_jira(data: dict) -> list:
    items = []
    for issue in data.get("issues", []):
        raw_updated = issue.get("updated", "")
        day = raw_updated[:10] if raw_updated else ""
        items.append({
            "date": day,
            "source": "jira",
            "ref": issue.get("key", ""),
            "preview": trim(f"{issue.get('summary', '')} — {issue.get('description_excerpt', '')}"),
        })
    return items


def from_confluence(data: dict) -> list:
    items = []
    for page in data.get("pages", []):
        raw_modified = page.get("lastmodified", "")
        day = raw_modified[:10] if raw_modified else ""
        items.append({
            "date": day,
            "source": "confluence",
            "ref": page.get("title", ""),
            "preview": trim(page.get("excerpt", "") or page.get("space", "")),
        })
    return items


def main() -> int:
    if len(sys.argv) < 5 or len(sys.argv) > 7:
        print(
            f"Usage: {sys.argv[0]} <daily_notes_json> <memento_json> <commits_json> <issues_json> [jira_json] [confluence_json]",
            file=sys.stderr,
        )
        return 2

    daily = load_json(sys.argv[1])
    memento = load_json(sys.argv[2])
    commits = load_json(sys.argv[3])
    issues = load_json(sys.argv[4])
    jira = load_json(sys.argv[5]) if len(sys.argv) >= 6 else {}
    confluence = load_json(sys.argv[6]) if len(sys.argv) >= 7 else {}

    timeline: list = []
    timeline.extend(from_daily_notes(daily))
    timeline.extend(from_memento(memento))
    timeline.extend(from_commits(commits))
    timeline.extend(from_issues(issues))
    timeline.extend(from_jira(jira))
    timeline.extend(from_confluence(confluence))

    timeline.sort(key=lambda item: (item.get("date", ""), SOURCE_ORDER.get(item.get("source", ""), 99)))

    counts = {
        "daily_notes": len(daily.get("days", [])),
        "daily_side_notes": len(daily.get("side_notes", [])),
        "memento_sessions": sum(len(s.get("topics", [])) for s in memento.get("sessions", [])),
        "commits": sum(len(r.get("commits", [])) for r in commits.get("repos", [])),
        "active_repos": len(commits.get("repos", [])),
        "issues": len(issues.get("issues", [])),
        "jira_issues": len(jira.get("issues", [])),
        "confluence_pages": len(confluence.get("pages", [])),
    }

    json.dump({"timeline": timeline, "counts": counts}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
