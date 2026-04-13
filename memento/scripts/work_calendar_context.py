#!/usr/bin/env python3
"""memento work calendar context — Outlook ICS feed injection.

Emits a markdown block of upcoming work calendar events within a 14-day
window. The ICS feed URL is read from macOS Keychain (service=work-calendar,
account=ics-url) — the URL itself is a capability secret and must never be
persisted to the repo.

Cache: ~/.claude/data/memento/work-calendar.ics (raw feed)
TTL: fresh <6h, stale-while-revalidate <24h, expired >=7d.

Failure modes are all silent — an empty or "미설정" block is preferred over
blocking the session start hook.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
UTC = timezone.utc
WINDOW_DAYS = 14
CACHE_FRESH_SECONDS = 6 * 3600
CACHE_STALE_SECONDS = 24 * 3600
CACHE_EXPIRED_SECONDS = 7 * 24 * 3600
FETCH_TIMEOUT = 10
KEYCHAIN_SERVICE = "work-calendar"
KEYCHAIN_ACCOUNT = "ics-url"
WEEKDAY_KR = ["월", "화", "수", "목", "금", "토", "일"]
BYDAY_MAP = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def log(msg: str) -> None:
    print(f"[memento calendar] {msg}", file=sys.stderr)


def cache_path() -> Path:
    return Path.home() / ".claude" / "data" / "memento" / "work-calendar.ics"


def get_ics_url() -> str | None:
    try:
        r = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                KEYCHAIN_ACCOUNT,
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception as e:
        log(f"keychain call failed: {e}")
        return None
    if r.returncode != 0:
        return None
    url = r.stdout.strip()
    return url or None


def fetch_ics(url: str) -> str | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "memento-calendar/1.0"}
        )
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        log(f"fetch failed: {e}")
        return None


def load_or_refresh(url: str) -> tuple[str | None, str]:
    """Return (ics_text, source) where source ∈ {fresh, cache, stale, fetch, missing}."""
    cache = cache_path()
    cache.parent.mkdir(parents=True, exist_ok=True)

    age: float | None = None
    if cache.exists():
        age = datetime.now().timestamp() - cache.stat().st_mtime

    if age is not None and age < CACHE_FRESH_SECONDS:
        return cache.read_text(encoding="utf-8"), "cache"

    # Try fetch. On failure, fall back to any existing cache unless expired.
    text = fetch_ics(url)
    if text is not None:
        try:
            cache.write_text(text, encoding="utf-8")
        except Exception as e:
            log(f"cache write failed: {e}")
        return text, "fetch"

    if cache.exists() and age is not None and age < CACHE_EXPIRED_SECONDS:
        return cache.read_text(encoding="utf-8"), "stale"

    return None, "missing"


def unfold(text: str) -> list[str]:
    """RFC 5545 line unfolding: continuation lines start with space or tab."""
    out: list[str] = []
    for raw in text.splitlines():
        if raw.startswith((" ", "\t")) and out:
            out[-1] += raw[1:]
        else:
            out.append(raw)
    return out


def parse_dt(value: str, tzid: str | None) -> datetime | None:
    """Parse ICS DTSTART/DTEND value into aware KST datetime.

    Accepts:
    - YYYYMMDDTHHMMSS (with TZID -> treat as KST if "Korea" in tzid, else naive KST)
    - YYYYMMDDTHHMMSSZ (UTC)
    - YYYYMMDD (all-day -> 00:00 KST)
    """
    v = value.strip()
    try:
        if len(v) == 8 and v.isdigit():
            return datetime.strptime(v, "%Y%m%d").replace(tzinfo=KST)
        if v.endswith("Z"):
            dt = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
            return dt.astimezone(KST)
        dt = datetime.strptime(v, "%Y%m%dT%H%M%S")
        return dt.replace(tzinfo=KST)
    except ValueError:
        return None


def split_prop(line: str) -> tuple[str, dict[str, str], str]:
    """Split 'NAME;PARAM=VAL;PARAM2=VAL2:VALUE' into (name, params, value)."""
    if ":" not in line:
        return line, {}, ""
    head, _, value = line.partition(":")
    parts = head.split(";")
    name = parts[0]
    params: dict[str, str] = {}
    for p in parts[1:]:
        if "=" in p:
            k, _, v = p.partition("=")
            params[k] = v
    return name, params, value


def ics_unescape(s: str) -> str:
    return (
        s.replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\n", " ")
        .replace("\\N", " ")
        .replace("\\\\", "\\")
    )


class VEvent:
    __slots__ = ("summary", "dtstart", "dtend", "location", "rrule", "exdates")

    def __init__(self) -> None:
        self.summary: str = ""
        self.dtstart: datetime | None = None
        self.dtend: datetime | None = None
        self.location: str = ""
        self.rrule: dict[str, str] = {}
        self.exdates: set[datetime] = set()


def parse_vevents(lines: list[str]) -> list[VEvent]:
    events: list[VEvent] = []
    cur: VEvent | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            cur = VEvent()
            continue
        if line == "END:VEVENT":
            if cur is not None:
                events.append(cur)
            cur = None
            continue
        if cur is None:
            continue
        name, params, value = split_prop(line)
        if name == "SUMMARY":
            cur.summary = ics_unescape(value)
        elif name == "LOCATION":
            cur.location = ics_unescape(value)
        elif name == "DTSTART":
            cur.dtstart = parse_dt(value, params.get("TZID"))
        elif name == "DTEND":
            cur.dtend = parse_dt(value, params.get("TZID"))
        elif name == "RRULE":
            cur.rrule = dict(
                p.split("=", 1) for p in value.split(";") if "=" in p
            )
        elif name == "EXDATE":
            for v in value.split(","):
                dt = parse_dt(v, params.get("TZID"))
                if dt is not None:
                    cur.exdates.add(dt)
    return events


def expand_event(
    ev: VEvent, window_start: date, window_end: date
) -> list[datetime]:
    """Return event occurrences within [window_start, window_end] as KST datetimes."""
    if ev.dtstart is None:
        return []

    base = ev.dtstart
    base_date = base.date()
    if not ev.rrule:
        if window_start <= base_date <= window_end:
            return [base]
        return []

    freq = ev.rrule.get("FREQ", "")
    if freq not in {"DAILY", "WEEKLY", "MONTHLY"}:
        return []

    interval = int(ev.rrule.get("INTERVAL", "1") or "1")
    until: datetime | None = None
    if "UNTIL" in ev.rrule:
        until = parse_dt(ev.rrule["UNTIL"], None)
    count = int(ev.rrule["COUNT"]) if "COUNT" in ev.rrule else None

    byday_raw = ev.rrule.get("BYDAY", "")
    byday_weekdays: list[int] = []
    for code in byday_raw.split(","):
        code = re.sub(r"^[+-]?\d+", "", code)
        if code in BYDAY_MAP:
            byday_weekdays.append(BYDAY_MAP[code])

    results: list[datetime] = []
    max_iter = 2000
    produced = 0

    def in_bounds(occ: datetime) -> bool:
        if until is not None and occ > until:
            return False
        if count is not None and produced >= count:
            return False
        return True

    if freq == "DAILY":
        step = timedelta(days=interval)
        occ = base
        i = 0
        while i < max_iter and in_bounds(occ):
            if window_start <= occ.date() <= window_end and occ not in ev.exdates:
                results.append(occ)
            if occ.date() > window_end:
                break
            occ = occ + step
            produced += 1
            i += 1

    elif freq == "WEEKLY":
        step_week = timedelta(weeks=interval)
        week_start = base
        weekdays = byday_weekdays or [base.weekday()]
        i = 0
        stop = False
        while i < max_iter and not stop:
            for wd in weekdays:
                delta = (wd - base.weekday()) % 7
                occ = week_start + timedelta(days=delta)
                if not in_bounds(occ):
                    stop = True
                    break
                if occ < base:
                    produced += 1
                    continue
                if (
                    window_start <= occ.date() <= window_end
                    and occ not in ev.exdates
                ):
                    results.append(occ)
                produced += 1
                if occ.date() > window_end:
                    stop = True
                    break
            week_start = week_start + step_week
            if week_start.date() > window_end:
                break
            i += 1

    elif freq == "MONTHLY":
        occ = base
        i = 0
        while i < max_iter and in_bounds(occ):
            if window_start <= occ.date() <= window_end and occ not in ev.exdates:
                results.append(occ)
            if occ.date() > window_end:
                break
            # advance interval months, keep day-of-month
            y = occ.year
            m = occ.month + interval
            while m > 12:
                m -= 12
                y += 1
            try:
                occ = occ.replace(year=y, month=m)
            except ValueError:
                break
            produced += 1
            i += 1

    return results


def render(
    today: date,
    occurrences: list[tuple[datetime, VEvent]],
    source: str,
    warning: str | None,
) -> str:
    lines = [f"향후 회사 일정 (오늘~+{WINDOW_DAYS}일, 출처: {source}):"]
    if not occurrences:
        lines.append("- (일정 없음)")
    else:
        for dt, ev in occurrences[:20]:
            d = dt.date()
            label_date = f"{d.month:02d}-{d.day:02d}({WEEKDAY_KR[d.weekday()]})"
            time_label = dt.strftime("%H:%M")
            summary = ev.summary or "(제목 없음)"
            if len(summary) > 50:
                summary = summary[:49] + "…"
            loc = f" @ {ev.location}" if ev.location else ""
            lines.append(f"- {label_date} {time_label} {summary}{loc}")
    if warning:
        lines.append(f"⚠ {warning}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plugin-root", required=True)
    args = parser.parse_args()
    _ = Path(args.plugin_root).resolve()

    url = get_ics_url()
    if not url:
        sys.stdout.write(
            "향후 회사 일정: 미설정 (keychain work-calendar/ics-url 없음)\n"
        )
        return 0

    text, source = load_or_refresh(url)
    if text is None:
        sys.stdout.write("향후 회사 일정: 조회 실패\n")
        return 0

    try:
        lines = unfold(text)
        events = parse_vevents(lines)
    except Exception as e:
        log(f"parse failed: {e}")
        sys.stdout.write("향후 회사 일정: 파싱 실패\n")
        return 0

    now = datetime.now(KST)
    today = now.date()
    window_end = today + timedelta(days=WINDOW_DAYS)

    occurrences: list[tuple[datetime, VEvent]] = []
    for ev in events:
        if ev.summary.strip().upper() in {"CANCELED", "CANCELLED"}:
            continue
        try:
            for dt in expand_event(ev, today, window_end):
                if dt >= now - timedelta(hours=1):
                    occurrences.append((dt, ev))
        except Exception as e:
            log(f"expand failed for '{ev.summary}': {e}")

    occurrences.sort(key=lambda t: t[0])

    warning = None
    if source == "stale":
        warning = "캐시 stale (fetch 실패, 이전 캐시 사용)"
    elif source == "missing":
        warning = "fetch 실패 + 캐시 만료"

    sys.stdout.write(render(today, occurrences, source, warning))
    return 0


if __name__ == "__main__":
    sys.exit(main())
