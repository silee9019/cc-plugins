#!/usr/bin/env python3
"""Collect daily notes within [START, END] (inclusive, KST).

Usage:
  collect_daily_notes.py <VAULT> <DAILY_NOTES_PATH> <DAILY_NOTE_FORMAT>
                        <DAILY_ARCHIVE_PATH> <DAILY_ARCHIVE_FORMAT>
                        <START> <END>

Tries DAILY_NOTES_PATH/DAILY_NOTE_FORMAT first; falls back to
DAILY_ARCHIVE_PATH/DAILY_ARCHIVE_FORMAT. Format placeholders: {YYYY} {MM} {DD}.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

from _frontmatter import read_frontmatter, parse_frontmatter


_SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
_SUBSECTION_RE = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
_CHECKBOX_RE = re.compile(r"^\s*-\s+\[([ xX])\]\s+(.*)$")
_BULLET_RE = re.compile(r"^\s*-\s+(.+)$")
_NUMBERED_RE = re.compile(r"^\s*\d+\.\s+(.+)$")


def parse_iso(s: str) -> date | None:
    try:
        return date.fromisoformat(s.strip()[:10])
    except (ValueError, AttributeError):
        return None


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def fill_format(fmt: str, d: date) -> str:
    return (
        fmt.replace("{YYYY}", f"{d.year:04d}")
        .replace("{MM}", f"{d.month:02d}")
        .replace("{DD}", f"{d.day:02d}")
    )


def split_sections(body: str) -> dict[str, str]:
    """Split body by `## ` headers into {header: content}."""
    sections: dict[str, str] = {}
    matches = list(_SECTION_RE.finditer(body))
    for i, m in enumerate(matches):
        header = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        sections[header] = body[start:end].strip()
    return sections


def extract_items(text: str, skip_blockquote: bool = True) -> list[str]:
    """Extract dash-bullets and numbered items, skipping checkboxes and blockquotes."""
    out: list[str] = []
    for line in text.split("\n"):
        if skip_blockquote and line.lstrip().startswith(">"):
            continue
        m = _BULLET_RE.match(line)
        if m and not m.group(1).startswith("[ ]") and not m.group(1).startswith("[x]"):
            txt = m.group(1).strip()
            if txt:
                out.append(txt)
                continue
        nm = _NUMBERED_RE.match(line)
        if nm:
            txt = nm.group(1).strip()
            if txt:
                out.append(txt)
    return out


def extract_tasks(text: str) -> list[dict]:
    """Parse tasks under `### {section}` subheadings (or `Inbox`)."""
    tasks: list[dict] = []
    matches = list(_SUBSECTION_RE.finditer(text))
    if not matches:
        for line in text.split("\n"):
            cb = _CHECKBOX_RE.match(line)
            if cb:
                tasks.append({"section": "", "checked": cb.group(1) in ("x", "X"), "text": cb.group(2).strip()})
        return tasks
    for i, m in enumerate(matches):
        section = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        for line in text[start:end].split("\n"):
            cb = _CHECKBOX_RE.match(line)
            if cb:
                tasks.append({"section": section, "checked": cb.group(1) in ("x", "X"), "text": cb.group(2).strip()})
    return tasks


def extract_review(text: str) -> dict:
    """Map `완료:`, `미완료:`, `배운 것:` lines to keys."""
    review = {"completed": "", "carryover": "", "learned": ""}
    for line in text.split("\n"):
        m = _BULLET_RE.match(line)
        if not m:
            continue
        item = m.group(1).strip()
        if item.startswith("완료:") or item.lower().startswith("completed:"):
            review["completed"] = item.split(":", 1)[1].strip()
        elif "미완료" in item or item.lower().startswith("carryover"):
            parts = item.split(":", 1)
            if len(parts) == 2:
                review["carryover"] = parts[1].strip()
        elif item.startswith("배운 것:") or item.lower().startswith("learned:"):
            review["learned"] = item.split(":", 1)[1].strip()
    return review


def parse_note(path: Path, d: date, vault: Path) -> dict:
    fm, body = read_frontmatter(path)
    sections = split_sections(body)
    plan = extract_items(sections.get("Plan", ""))
    tasks = extract_tasks(sections.get("Tasks", ""))
    log = extract_items(sections.get("Log", ""))
    review = extract_review(sections.get("Review", ""))
    try:
        rel = path.relative_to(vault)
    except ValueError:
        rel = path
    return {
        "date": d.isoformat(),
        "path": str(rel),
        "frontmatter": fm,
        "plan": plan,
        "tasks": tasks,
        "log": log,
        "review": review,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 8:
        print(
            "Usage: collect_daily_notes.py <VAULT> <DAILY_NOTES_PATH> <DAILY_NOTE_FORMAT> "
            "<DAILY_ARCHIVE_PATH> <DAILY_ARCHIVE_FORMAT> <START> <END>",
            file=sys.stderr,
        )
        return 2
    vault = Path(argv[1])
    primary_dir = argv[2]
    primary_fmt = argv[3]
    archive_dir = argv[4]
    archive_fmt = argv[5]
    start = parse_iso(argv[6])
    end = parse_iso(argv[7])
    if start is None or end is None or start > end:
        print(f"[collect_daily_notes] invalid date range: {argv[6]}..{argv[7]}", file=sys.stderr)
        return 2

    notes: list[dict] = []
    for d in daterange(start, end):
        candidates: list[Path] = []
        if primary_dir and primary_fmt:
            candidates.append(vault / primary_dir / fill_format(primary_fmt, d))
        if archive_dir and archive_fmt:
            candidates.append(vault / archive_dir / fill_format(archive_fmt, d))
        for path in candidates:
            if path.is_file():
                try:
                    notes.append(parse_note(path, d, vault))
                except (OSError, UnicodeDecodeError) as e:
                    print(f"[collect_daily_notes] skip {path}: {e}", file=sys.stderr)
                break

    out = {"notes": notes, "counts": {"daily_notes": len(notes)}}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
