#!/usr/bin/env python3
"""Generate data/kr-holidays-fallback.json using the `holidays` PyPI package.

Captures the current month + next month (2 months total), matching the
runtime cache window. Used when the KASI API cache is missing.

Since the fallback window is short, regenerate periodically (recommended
monthly, or whenever cc-plugins is updated). Ad-hoc holidays and election
days are included as of the `holidays` package version at generation time.

Usage:
    python3 -m pip install --user holidays
    python3 scripts/dump_fallback.py
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))


def window_bounds(today: date) -> tuple[date, date]:
    """Current month 1st → last day of next month."""
    first = date(today.year, today.month, 1)
    if today.month == 12:
        next_first = date(today.year + 1, 1, 1)
    else:
        next_first = date(today.year, today.month + 1, 1)
    if next_first.month == 12:
        last = date(next_first.year, 12, 31)
    else:
        last = date(next_first.year, next_first.month + 1, 1) - timedelta(days=1)
    return first, last


def main() -> int:
    try:
        import holidays  # type: ignore
    except ImportError:
        print(
            "ERROR: install the `holidays` package first:\n"
            "  python3 -m pip install --user holidays",
            file=sys.stderr,
        )
        return 2

    today = datetime.now(KST).date()
    first, last = window_bounds(today)

    # holidays package is year-keyed; fetch both years if the window straddles.
    years = sorted({first.year, last.year})
    kr = holidays.SouthKorea(years=years)

    holiday_map = {
        d.isoformat(): name
        for d, name in sorted(kr.items())
        if first <= d <= last
    }

    payload = {
        "version": 1,
        "last_updated": datetime.now(KST).isoformat(timespec="seconds"),
        "source": "fallback",
        "window": {
            "from": first.isoformat(),
            "to": last.isoformat(),
        },
        "note": (
            "Generated from the `holidays` PyPI package. "
            "Window matches the runtime cache: current month + next month. "
            "Regenerate monthly, or whenever the plugin is updated."
        ),
        "holidays": holiday_map,
    }

    out = Path(__file__).resolve().parent.parent / "data" / "kr-holidays-fallback.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(holiday_map)} holidays for {first}..{last} → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
