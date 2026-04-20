#!/usr/bin/env python3
"""Collect memento session logs within [START, END] (inclusive, KST).

Usage:
  collect_memento_logs.py <MEMENTO_PROJECTS_PATH> <START> <END>

Skeleton only — schema TBD. memento-core SKILL.md specifies session/decision
file layout (`memory/YYYY-MM-DD.md`, `user/decisions/YYYY-MM-DD-{slug}.md`)
but no real samples exist yet in vault. Returns empty result + schema_version
"tbd" so review-week.md's "fail → empty result" contract holds. Implement
parsing in a follow-up PR once real session data lands.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path


def parse_iso(s: str) -> date | None:
    try:
        return date.fromisoformat(s.strip()[:10])
    except (ValueError, AttributeError):
        return None


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(
            "Usage: collect_memento_logs.py <MEMENTO_PROJECTS_PATH> <START> <END>",
            file=sys.stderr,
        )
        return 2
    projects = Path(argv[1])
    start = parse_iso(argv[2])
    end = parse_iso(argv[3])
    if start is None or end is None or start > end:
        print(f"[collect_memento_logs] invalid date range: {argv[2]}..{argv[3]}", file=sys.stderr)
        return 2

    print(
        f"[collect_memento_logs] schema TBD — emitting empty result (path={projects})",
        file=sys.stderr,
    )
    out = {"sessions": [], "counts": {"memento_sessions": 0}, "schema_version": "tbd"}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
