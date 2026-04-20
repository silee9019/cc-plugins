#!/usr/bin/env python3
"""Collect Issue Box entries within [START, END] (inclusive, KST).

Usage:
  collect_issues.py <VAULT> <INBOX> <IN_PROGRESS> <RESOLVED> <DISMISSED> <START> <END>

Empty-string folder paths are skipped silently. Output: JSON to stdout.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

from _frontmatter import read_frontmatter


_FILENAME_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
_H1_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def parse_iso(s: str) -> date | None:
    try:
        return date.fromisoformat(s.strip()[:10])
    except (ValueError, AttributeError):
        return None


def derive_date(fm: dict, path: Path) -> date | None:
    for key in ("created", "date"):
        val = fm.get(key)
        if isinstance(val, str):
            d = parse_iso(val)
            if d:
                return d
    m = _FILENAME_DATE_RE.search(path.name)
    return parse_iso(m.group(1)) if m else None


def derive_title(fm: dict, body: str, path: Path) -> str:
    title = fm.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    h1 = _H1_RE.search(body)
    if h1:
        return h1.group(1).strip()
    name = path.stem
    name = _FILENAME_DATE_RE.sub("", name).lstrip(" -_")
    return name or path.stem


def collect_folder(folder: Path, default_status: str, start: date, end: date) -> list[dict]:
    issues: list[dict] = []
    if not folder.exists() or not folder.is_dir():
        print(f"[collect_issues] skip missing folder: {folder}", file=sys.stderr)
        return issues
    for md in folder.rglob("*.md"):
        try:
            fm, body = read_frontmatter(md)
        except (OSError, UnicodeDecodeError) as e:
            print(f"[collect_issues] skip {md}: {e}", file=sys.stderr)
            continue
        d = derive_date(fm, md)
        if d is None or not (start <= d <= end):
            continue
        status_raw = fm.get("status")
        status = status_raw if isinstance(status_raw, str) and status_raw else default_status
        rel = md
        try:
            rel = md.relative_to(folder.parent)
        except ValueError:
            pass
        issues.append({
            "path": str(rel),
            "title": derive_title(fm, body, md),
            "category": fm.get("category"),
            "status": status,
            "priority": fm.get("priority"),
            "created": d.isoformat(),
            "source_project": fm.get("source_project"),
        })
    return issues


def main(argv: list[str]) -> int:
    if len(argv) != 8:
        print(
            "Usage: collect_issues.py <VAULT> <INBOX> <IN_PROGRESS> <RESOLVED> <DISMISSED> <START> <END>",
            file=sys.stderr,
        )
        return 2
    vault = Path(argv[1])
    folder_specs = [
        (argv[2], "open"),
        (argv[3], "in_progress"),
        (argv[4], "resolved"),
        (argv[5], "dismissed"),
    ]
    start = parse_iso(argv[6])
    end = parse_iso(argv[7])
    if start is None or end is None or start > end:
        print(f"[collect_issues] invalid date range: {argv[6]}..{argv[7]}", file=sys.stderr)
        return 2

    issues: list[dict] = []
    for rel, default_status in folder_specs:
        if not rel:
            continue
        issues.extend(collect_folder(vault / rel, default_status, start, end))

    issues.sort(key=lambda i: (i["created"], i["path"]))
    out = {"issues": issues, "counts": {"issues": len(issues)}}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
