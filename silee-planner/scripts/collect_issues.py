#!/usr/bin/env python3
"""Collect Issue Box entries across status folders within a date range.

Usage:
    collect_issues.py <vault_path> <inbox_path> <in_progress_path> <resolved_path> <dismissed_path> <start_date> <end_date>

Parses YAML frontmatter (created, resolved_at, category, priority, status) and
extracts h1 title + `## 요약` section body from each .md file.

Output: JSON on stdout.
"""

import json
import os
import re
import sys
from datetime import datetime

STATUS_BY_SLOT = ["open", "in_progress", "resolved", "dismissed"]

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


def parse_frontmatter(body: str) -> tuple:
    """Parse flat YAML frontmatter (``key: value`` per line).

    Limitations: does not handle nested mappings, lists, or multi-line
    strings. Acceptable for Issue Box format which is always flat. If
    richer frontmatter is needed in the future, switch to PyYAML via
    optional import.
    """
    match = FRONTMATTER_RE.match(body)
    if not match:
        return {}, body
    fm_text, rest = match.group(1), match.group(2)
    fm = {}
    for line in fm_text.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip().strip('"').strip("'")
    return fm, rest


def extract_title(body: str) -> str:
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def extract_summary(body: str) -> str:
    lines = body.splitlines()
    capture = False
    collected = []
    for line in lines:
        heading = re.match(r"^##\s+(.+?)\s*$", line)
        if heading:
            title = heading.group(1).strip().lower()
            if capture:
                break
            if title in ("요약", "summary"):
                capture = True
                continue
        if capture:
            collected.append(line)
    return "\n".join(collected).strip()


def normalize_date(value: str) -> str:
    """Parse first 10 chars as YYYY-MM-DD, return ISO date or ''."""
    if not value or len(value) < 10:
        return ""
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date().isoformat()
    except ValueError:
        return ""


def in_range(iso_date: str, start: datetime, end: datetime) -> bool:
    if not iso_date:
        return False
    try:
        d = datetime.strptime(iso_date, "%Y-%m-%d").date()
    except ValueError:
        return False
    return start.date() <= d <= end.date()


def scan_folder(vault: str, rel: str, implicit_status: str, start: datetime, end: datetime) -> list:
    if not rel:
        return []
    folder = os.path.join(vault, rel)
    if not os.path.isdir(folder):
        return []
    results = []
    for root, _dirs, files in os.walk(folder):
        for name in sorted(files):
            if not name.endswith(".md"):
                continue
            full = os.path.join(root, name)
            try:
                with open(full, encoding="utf-8") as f:
                    body = f.read()
            except OSError:
                continue
            fm, rest = parse_frontmatter(body)
            created = normalize_date(fm.get("created", ""))
            resolved_at = normalize_date(fm.get("resolved_at", ""))
            if not in_range(created, start, end) and not in_range(resolved_at, start, end):
                continue
            results.append({
                "title": fm.get("title") or extract_title(rest),
                "status": fm.get("status", implicit_status),
                "category": fm.get("category", ""),
                "priority": fm.get("priority", ""),
                "source_project": fm.get("source_project", ""),
                "created": created,
                "resolved_at": resolved_at,
                "file": full,
                "summary": extract_summary(rest),
            })
    return results


def main() -> int:
    if len(sys.argv) != 8:
        print(
            f"Usage: {sys.argv[0]} <vault_path> <inbox_path> <in_progress_path> <resolved_path> <dismissed_path> <start_date> <end_date>",
            file=sys.stderr,
        )
        return 2

    vault = sys.argv[1].rstrip("/")
    paths = sys.argv[2:6]
    try:
        start = datetime.strptime(sys.argv[6], "%Y-%m-%d")
        end = datetime.strptime(sys.argv[7], "%Y-%m-%d")
    except ValueError as e:
        print(f"Invalid date: {e}", file=sys.stderr)
        return 2

    all_issues = []
    for rel, status in zip(paths, STATUS_BY_SLOT):
        all_issues.extend(scan_folder(vault, rel, status, start, end))

    all_issues.sort(key=lambda i: (i.get("created") or i.get("resolved_at") or "", i.get("title", "")))

    json.dump({"issues": all_issues}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
