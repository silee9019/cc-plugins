#!/usr/bin/env python3
"""
memento 2.14.0 Track 개념 폐지 — 일회성 마이그레이션 도구.

v2.14.0에서 Daily Note Tasks의 `## [track:{id}] P: {제목}` 헤더 그룹화와
todo frontmatter의 `track:` 필드를 폐지한다. 이 스크립트는:

  1. Daily Note 파일의 `## [track:...] P: ...` 헤더를 제거하고,
     하위 체크박스를 `## Tasks` 섹션 말미로 평탄화
  2. todo 파일 frontmatter에서 `track:` 라인 제거

기본 dry-run. 실제 적용은 --apply. session-start.sh에서 자동 호출 시 --yes.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


CONFIG_PATH = Path.home() / ".claude/plugins/data/memento-cc-plugins/config.md"

TRACK_HEADER_RE = re.compile(r"^(#{1,3})\s*\[track:[^\]]+\](?:\s+P:.*)?\s*$", re.MULTILINE)
TRACK_FIELD_RE = re.compile(r"^track:.*\n", re.MULTILINE)
FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
TASKS_HEADING_RE = re.compile(r"^#\s*Tasks\s*$", re.MULTILINE)


def load_config() -> dict[str, str]:
    if not CONFIG_PATH.exists():
        return {}
    text = CONFIG_PATH.read_text()
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    cfg = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


@dataclass
class Stats:
    daily_notes_flattened: int = 0
    todo_track_fields_removed: int = 0
    scanned_daily_notes: int = 0
    scanned_todos: int = 0
    errors: list[str] = field(default_factory=list)


def flatten_daily_note(text: str) -> tuple[str, bool]:
    """Return (new_text, changed). Remove track headers and move their
    checkbox children into the ``## Tasks`` section.
    """
    lines = text.splitlines(keepends=True)
    changed = False

    # Pass 1: find track headers and their content blocks
    tasks_section_idx: int | None = None
    for i, line in enumerate(lines):
        stripped = line.rstrip("\n")
        if TASKS_HEADING_RE.match(stripped):
            tasks_section_idx = i
            break

    # Collect all lines belonging to track sections (header + body until next ## or end)
    track_headers: list[int] = []
    for i, line in enumerate(lines):
        stripped = line.rstrip("\n")
        if re.match(r"^##\s*\[track:", stripped):
            track_headers.append(i)

    if not track_headers:
        return text, False

    # Determine end of each track section: next ## heading at same or higher level
    # Collect checkbox lines to hoist
    hoisted_checkboxes: list[str] = []
    # Mark lines to delete (track header + everything until next top-level ##)
    to_delete: set[int] = set()

    for hi in track_headers:
        to_delete.add(hi)
        j = hi + 1
        while j < len(lines):
            s = lines[j].rstrip("\n")
            if s.startswith("## ") and not s.startswith("### "):
                # next top-level section
                break
            to_delete.add(j)
            # preserve checkbox lines (flat list items starting with - [ ] or - [x])
            if re.match(r"^\s*-\s*\[[ xX]\]", s):
                hoisted_checkboxes.append(lines[j])
            j += 1

    if not hoisted_checkboxes and not to_delete:
        return text, False

    # If no `## Tasks` section exists, create one at the position of the first
    # track header
    new_lines: list[str] = []
    inserted_tasks = False
    first_track_line = track_headers[0]

    for i, line in enumerate(lines):
        if i in to_delete:
            continue
        new_lines.append(line)

    # Insert hoisted checkboxes into Tasks section
    if tasks_section_idx is not None:
        # Find Tasks section position in new_lines (index shifted)
        new_tasks_idx = None
        for i, line in enumerate(new_lines):
            if TASKS_HEADING_RE.match(line.rstrip("\n")):
                new_tasks_idx = i
                break
        if new_tasks_idx is not None:
            # Find end of Tasks section (next ## or end)
            end = len(new_lines)
            for j in range(new_tasks_idx + 1, len(new_lines)):
                s = new_lines[j].rstrip("\n")
                if s.startswith("## "):
                    end = j
                    break
            # Remove trailing blank lines before insertion
            insert_at = end
            while insert_at > new_tasks_idx + 1 and new_lines[insert_at - 1].strip() == "":
                insert_at -= 1
            # Add newline before checkboxes if needed
            prefix = []
            if insert_at > 0 and not new_lines[insert_at - 1].endswith("\n"):
                prefix.append("\n")
            new_lines = (
                new_lines[:insert_at]
                + prefix
                + hoisted_checkboxes
                + new_lines[insert_at:]
            )
            inserted_tasks = True

    if not inserted_tasks and hoisted_checkboxes:
        # Create a new Tasks section at first track header location (approx)
        # We simply prepend at the end if no Tasks section exists
        tasks_block = ["\n", "## Tasks\n", "\n", *hoisted_checkboxes]
        new_lines = new_lines + tasks_block

    return "".join(new_lines), True


def strip_track_field(text: str) -> tuple[str, bool]:
    """Remove ``track:`` line from YAML frontmatter if present."""
    m = FRONTMATTER_RE.match(text)
    if not m:
        return text, False
    fm = m.group(1)
    new_fm, n = TRACK_FIELD_RE.subn("", fm + "\n")
    if n == 0:
        return text, False
    new_fm = new_fm.rstrip("\n")
    new_text = "---\n" + new_fm + "\n---\n" + text[m.end():]
    return new_text, True


def process_daily_notes(vault: Path, stats: Stats, apply: bool) -> None:
    patterns = [
        "01 Working/*-planning.md",
        "01 Working/*.md",  # catch-all for Daily Notes in working root
        "99 Archives/Daily/**/*-planning.md",
    ]
    seen: set[Path] = set()
    for pat in patterns:
        for p in vault.glob(pat):
            if p in seen or not p.is_file():
                continue
            seen.add(p)
            # Only act on files matching Daily Note shape YYYY-MM-DD-*.md
            if not re.match(r"^\d{4}-\d{2}-\d{2}-.*\.md$", p.name):
                continue
            stats.scanned_daily_notes += 1
            try:
                txt = p.read_text()
            except Exception as e:
                stats.errors.append(f"read {p}: {e}")
                continue
            new_txt, changed = flatten_daily_note(txt)
            if changed:
                stats.daily_notes_flattened += 1
                print(f"[daily]  {'APPLY' if apply else 'DRY'} flatten: {p.relative_to(vault)}")
                if apply:
                    try:
                        p.write_text(new_txt)
                    except Exception as e:
                        stats.errors.append(f"write {p}: {e}")


def process_todo_files(vault: Path, stats: Stats, apply: bool) -> None:
    # Todo files live under date-dir subfolders
    patterns = [
        "01 Working/[0-9]*/*.md",
        "00 Inbox/[0-9]*/*.md",
        "99 Archives/Daily/**/[0-9]*/*.md",
    ]
    seen: set[Path] = set()
    for pat in patterns:
        for p in vault.glob(pat):
            if p in seen or not p.is_file():
                continue
            seen.add(p)
            stats.scanned_todos += 1
            try:
                txt = p.read_text()
            except Exception as e:
                stats.errors.append(f"read {p}: {e}")
                continue
            new_txt, changed = strip_track_field(txt)
            if changed:
                stats.todo_track_fields_removed += 1
                print(f"[todo]   {'APPLY' if apply else 'DRY'} strip track: {p.relative_to(vault)}")
                if apply:
                    try:
                        p.write_text(new_txt)
                    except Exception as e:
                        stats.errors.append(f"write {p}: {e}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Remove Track concept from memento vault (v2.14.0)")
    ap.add_argument("--apply", action="store_true", help="실제로 파일 수정 (기본은 dry-run)")
    ap.add_argument("--yes", action="store_true", help="무인 실행 — 현재는 no-op이지만 session-start hook에서 명시적으로 전달")
    ap.add_argument("--vault", type=str, default=None, help="vault 절대 경로 (생략 시 config.md에서 읽음)")
    ap.add_argument("--memento-root", type=str, default=None, help="vault 내 memento 서브디렉토리 (현재 마이그레이션에는 영향 없음)")
    args = ap.parse_args()

    _ = args.yes  # reserved for future interactive prompt gating

    cfg = load_config()
    vault_path = args.vault or cfg.get("vault_path")
    if not vault_path:
        print("ERROR: vault_path 미설정. --vault 인자 또는 /memento:setup 먼저 실행.", file=sys.stderr)
        return 2
    vault = Path(vault_path).expanduser()
    if not vault.is_dir():
        print(f"ERROR: vault 경로 없음: {vault}", file=sys.stderr)
        return 2

    stats = Stats()
    apply = args.apply

    if not apply:
        print(f"[dry-run] vault: {vault}")
    else:
        print(f"[apply]   vault: {vault}")

    process_daily_notes(vault, stats, apply)
    process_todo_files(vault, stats, apply)

    print()
    print("=== 요약 ===")
    print(f"스캔한 Daily Note: {stats.scanned_daily_notes}")
    print(f"평탄화된 Daily Note: {stats.daily_notes_flattened}")
    print(f"스캔한 todo 파일: {stats.scanned_todos}")
    print(f"track 필드 제거된 todo: {stats.todo_track_fields_removed}")
    if stats.errors:
        print()
        print("=== 오류 ===")
        for e in stats.errors:
            print(f"  - {e}")
        return 1

    if not apply:
        print()
        print("dry-run 완료. 실제 적용은 --apply 추가.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
