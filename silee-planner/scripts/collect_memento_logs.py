#!/usr/bin/env python3
"""Collect memento daily logs across all projects within a date range.

Usage:
    collect_memento_logs.py <memento_projects_base> <start_date> <end_date>

Parses each ~/.claude/memento/projects/<project-id>/memory/YYYY-MM-DD.md file.
Extracts `## [Topic Name]` blocks and preserves request/analysis/decisions/outcome/references fields.

Output: JSON on stdout.
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta


DATE_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")
FIELD_KEYS = ("request", "analysis", "decisions", "outcome", "references")


def parse_day_log(body: str) -> list:
    """Parse memento daily log: split on `## ` headings, extract fields from bullet lines."""
    topics = []
    lines = body.splitlines()

    current_title = None
    current_raw: list = []

    def flush():
        if current_title is None:
            return
        raw_text = "\n".join(current_raw).strip()
        topic = {"title": current_title, "raw": raw_text}
        for key in FIELD_KEYS:
            topic[key] = ""
        for line in current_raw:
            cleaned = line.lstrip()
            if cleaned.startswith("- "):
                cleaned = cleaned[2:]
            stripped = cleaned.strip()
            for key in FIELD_KEYS:
                prefix = f"{key}:"
                if stripped.lower().startswith(prefix):
                    topic[key] = stripped[len(prefix):].strip()
                    break
        topics.append(topic)

    for line in lines:
        heading = re.match(r"^##\s+(.+?)\s*$", line)
        if heading:
            flush()
            current_title = heading.group(1).strip()
            current_raw = []
        elif current_title is not None:
            current_raw.append(line)
    flush()

    return topics


def main() -> int:
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <memento_projects_base> <start_date> <end_date>", file=sys.stderr)
        return 2

    base = sys.argv[1]
    try:
        start = datetime.strptime(sys.argv[2], "%Y-%m-%d").date()
        end = datetime.strptime(sys.argv[3], "%Y-%m-%d").date()
    except ValueError as e:
        print(f"Invalid date: {e}", file=sys.stderr)
        return 2

    sessions = []

    if not os.path.isdir(base):
        json.dump({"sessions": []}, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    try:
        projects = sorted(os.listdir(base))
    except OSError as e:
        print(f"Scan error {base}: {e}", file=sys.stderr)
        projects = []

    for project in projects:
        memory_dir = os.path.join(base, project, "memory")
        if not os.path.isdir(memory_dir):
            continue
        try:
            entries = sorted(os.listdir(memory_dir))
        except OSError:
            continue
        for entry in entries:
            match = DATE_FILE_RE.match(entry)
            if not match:
                continue
            try:
                file_date = datetime.strptime(match.group(1), "%Y-%m-%d").date()
            except ValueError:
                continue
            if file_date < start or file_date > end:
                continue
            full = os.path.join(memory_dir, entry)
            try:
                with open(full, encoding="utf-8") as f:
                    body = f.read()
            except OSError as e:
                print(f"Read error {full}: {e}", file=sys.stderr)
                continue
            topics = parse_day_log(body)
            if not topics:
                continue
            sessions.append({
                "date": file_date.isoformat(),
                "project": project,
                "file": full,
                "topics": topics,
            })

    sessions.sort(key=lambda s: (s["date"], s["project"]))
    json.dump({"sessions": sessions}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
