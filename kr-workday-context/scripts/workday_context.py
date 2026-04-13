#!/usr/bin/env python3
"""kr-workday-context main hook script.

Emits a system-reminder block with:
- Today's date (KST)
- Current time (KST)
- Next business days within a 7-day window (weekends + KR holidays excluded)

Reads cache at ~/.claude/data/kr-workday-context/kr-holidays.json.
Falls back to bundled data/kr-holidays-fallback.json when cache is missing.
Triggers a background refresh when cache is older than CACHE_STALE_DAYS.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
CACHE_STALE_DAYS = 7
CACHE_EXPIRED_DAYS = 30
WINDOW_DAYS = 8  # today..today+7 inclusive — covers next Monday when today is Monday
WEEKDAY_KR = ["월", "화", "수", "목", "금", "토", "일"]
WEEKDAY_KR_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]


def cache_path() -> Path:
    return Path.home() / ".claude" / "data" / "kr-workday-context" / "kr-holidays.json"


def fallback_path(plugin_root: Path) -> Path:
    return plugin_root / "data" / "kr-holidays-fallback.json"


def load_holidays(plugin_root: Path) -> tuple[dict[str, str], str, datetime | None]:
    """Return (holiday_map, source_label, last_updated).

    source_label ∈ {"kasi", "fallback", "missing"}.
    """
    cache = cache_path()
    if cache.exists():
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            holidays = data.get("holidays", {}) or {}
            last_updated_s = data.get("last_updated")
            source = data.get("source", "kasi")
            last_updated = (
                datetime.fromisoformat(last_updated_s) if last_updated_s else None
            )
            return holidays, source, last_updated
        except Exception as e:
            print(f"[kr-workday-context] cache parse failed: {e}", file=sys.stderr)

    fb = fallback_path(plugin_root)
    if fb.exists():
        try:
            data = json.loads(fb.read_text(encoding="utf-8"))
            return data.get("holidays", {}) or {}, "fallback", None
        except Exception as e:
            print(f"[kr-workday-context] fallback parse failed: {e}", file=sys.stderr)

    return {}, "missing", None


def business_days_in_window(
    today: date, window: int, holidays: dict[str, str]
) -> list[tuple[date, str]]:
    """Return business days from today through today+window-1 (inclusive).

    A business day is: weekday (Mon-Fri) AND not in the holidays map.
    Returns list of (date, holiday_name_if_skipped_nearby_or_empty).
    """
    result: list[tuple[date, str]] = []
    for offset in range(window):
        d = today + timedelta(days=offset)
        if d.weekday() >= 5:
            continue
        if d.isoformat() in holidays:
            continue
        result.append((d, ""))
    return result


def should_refresh(last_updated: datetime | None) -> bool:
    if last_updated is None:
        return True
    now = datetime.now(KST)
    if last_updated.tzinfo is None:
        last_updated = last_updated.replace(tzinfo=KST)
    age = now - last_updated
    return age.days >= CACHE_STALE_DAYS


def is_expired(last_updated: datetime | None) -> bool:
    if last_updated is None:
        return False
    now = datetime.now(KST)
    if last_updated.tzinfo is None:
        last_updated = last_updated.replace(tzinfo=KST)
    return (now - last_updated).days >= CACHE_EXPIRED_DAYS


def trigger_background_refresh(plugin_root: Path) -> None:
    """Spawn update_holidays.py in background (non-blocking)."""
    script = plugin_root / "scripts" / "update_holidays.py"
    if not script.exists():
        return
    try:
        # Detach fully — stdout/stderr to devnull, new session, non-blocking.
        subprocess.Popen(
            ["python3", str(script)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as e:
        print(f"[kr-workday-context] background refresh failed: {e}", file=sys.stderr)


def format_age(last_updated: datetime | None) -> str:
    if last_updated is None:
        return "nan"
    now = datetime.now(KST)
    if last_updated.tzinfo is None:
        last_updated = last_updated.replace(tzinfo=KST)
    age_days = (now - last_updated).days
    if age_days == 0:
        return "오늘"
    return f"{age_days}일 전"


def render(
    now_kst: datetime,
    business_days: list[tuple[date, str]],
    source: str,
    last_updated: datetime | None,
    warning: str | None,
) -> str:
    today = now_kst.date()
    today_label = f"{today.isoformat()} ({WEEKDAY_KR_FULL[today.weekday()]})"
    time_label = now_kst.strftime("%H:%M KST")

    lines = [
        f"오늘: {today_label}",
        f"현재 시각: {time_label}",
        "향후 영업일 (오늘~+7일, 주말/공휴일 제외): "
        + (
            ", ".join(
                f"{d.isoformat()}({WEEKDAY_KR[d.weekday()]})"
                for d, _ in business_days
            )
            if business_days
            else "(없음)"
        ),
        f"공휴일 참조 캐시: {cache_path()}",
    ]

    if warning:
        lines.append(f"⚠ {warning}")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plugin-root", required=True)
    args = parser.parse_args()
    plugin_root = Path(args.plugin_root).resolve()

    now_kst = datetime.now(KST)
    today = now_kst.date()

    holidays, source, last_updated = load_holidays(plugin_root)

    warning: str | None = None
    if source == "missing":
        warning = (
            "공휴일 데이터 없음 — `/kr-workday-context:update-holidays` 실행 권장"
        )
    elif source == "fallback":
        # Silent — already mentioned in main body.
        pass
    elif source == "kasi" and is_expired(last_updated):
        warning = (
            f"캐시 만료 ({(datetime.now(KST) - (last_updated or now_kst)).days}일). "
            "`/kr-workday-context:update-holidays` 실행 권장"
        )

    if source in {"kasi", "missing"} and should_refresh(last_updated):
        trigger_background_refresh(plugin_root)

    business = business_days_in_window(today, WINDOW_DAYS, holidays)

    sys.stdout.write(render(now_kst, business, source, last_updated, warning))
    return 0


if __name__ == "__main__":
    sys.exit(main())
