#!/usr/bin/env python3
"""Collect Daily Notes within a date range and extract sections as raw text.

Usage:
    collect_daily_notes.py <vault_path> <daily_notes_path_pattern> <daily_note_format> <start_date> <end_date>

The parser is permissive: supports Korean/English section names, case-insensitive.
No counting, no statistics. Raw text preserved for LLM consumption.

Output: JSON on stdout.
"""

import json
import os
import re
import sys
from datetime import date, datetime, timedelta


SECTION_ALIASES = {
    "plan": ["plan", "계획"],
    "tasks": ["tasks", "task", "할일", "할 일"],
    "review": ["review", "회고", "리뷰"],
    "log": ["log", "로그", "기록"],
}

DATE_PREFIX_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def substitute_path(pattern: str, d: date) -> str:
    return (
        pattern.replace("{YYYY}", f"{d.year:04d}")
        .replace("{MM}", f"{d.month:02d}")
        .replace("{DD}", f"{d.day:02d}")
    )


def parse_sections(body: str) -> dict:
    """Split markdown body into sections by ## headings (case-insensitive, multilingual)."""
    lines = body.splitlines()
    sections: dict = {}
    current_name = None
    buffer: list = []

    def flush():
        if current_name is not None:
            sections.setdefault(current_name, "\n".join(buffer).strip())

    for line in lines:
        heading_match = re.match(r"^##\s+(.+?)\s*$", line)
        if heading_match:
            flush()
            raw_heading = heading_match.group(1).strip().lower()
            matched_key = None
            for key, aliases in SECTION_ALIASES.items():
                for alias in aliases:
                    if raw_heading == alias or raw_heading.startswith(alias + " ") or raw_heading.startswith(alias + "("):
                        matched_key = key
                        break
                if matched_key:
                    break
            current_name = matched_key or f"other:{raw_heading}"
            buffer = []
        else:
            buffer.append(line)
    flush()

    return sections


def iter_dates(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def main() -> int:
    if len(sys.argv) != 6:
        print(
            f"Usage: {sys.argv[0]} <vault_path> <daily_notes_path_pattern> <daily_note_format> <start_date> <end_date>",
            file=sys.stderr,
        )
        return 2

    vault_path = sys.argv[1].rstrip("/")
    path_pattern = sys.argv[2]
    file_format = sys.argv[3]
    try:
        start = datetime.strptime(sys.argv[4], "%Y-%m-%d").date()
        end = datetime.strptime(sys.argv[5], "%Y-%m-%d").date()
    except ValueError as e:
        print(f"Invalid date: {e}", file=sys.stderr)
        return 2

    days = []
    seen_dirs = set()
    side_notes = []

    for d in iter_dates(start, end):
        rel_dir = substitute_path(path_pattern, d)
        file_name = substitute_path(file_format, d) + ".md"
        file_path = os.path.join(vault_path, rel_dir, file_name)

        if os.path.isfile(file_path):
            try:
                with open(file_path, encoding="utf-8") as f:
                    body = f.read()
            except OSError as e:
                print(f"Read error {file_path}: {e}", file=sys.stderr)
                continue
            sections = parse_sections(body)
            days.append({
                "date": d.isoformat(),
                "file": file_path,
                "sections": {
                    "plan": sections.get("plan", ""),
                    "tasks": sections.get("tasks", ""),
                    "review": sections.get("review", ""),
                    "log": sections.get("log", ""),
                },
                "raw_body": body,
            })

        abs_dir = os.path.join(vault_path, rel_dir)
        if abs_dir not in seen_dirs and os.path.isdir(abs_dir):
            seen_dirs.add(abs_dir)
            try:
                entries = sorted(os.listdir(abs_dir))
            except OSError as e:
                print(f"Scan error {abs_dir}: {e}", file=sys.stderr)
                entries = []
            for entry in entries:
                if not entry.endswith(".md"):
                    continue
                if entry == file_name:
                    continue
                prefix_match = DATE_PREFIX_RE.match(entry)
                if not prefix_match:
                    continue
                try:
                    side_date = datetime.strptime(prefix_match.group(1), "%Y-%m-%d").date()
                except ValueError:
                    continue
                if side_date < start or side_date > end:
                    continue
                full = os.path.join(abs_dir, entry)
                if not os.path.isfile(full):
                    continue
                try:
                    with open(full, encoding="utf-8") as f:
                        side_body = f.read()
                except OSError:
                    continue
                side_notes.append({
                    "date": side_date.isoformat(),
                    "file": full,
                    "name": entry,
                    "body": side_body,
                })

    json.dump({"days": days, "side_notes": side_notes}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
