#!/usr/bin/env python3
"""memento calendar context — ICS feed injection for work + personal calendars.

Emits a markdown block of upcoming events (14-day window) merged from
multiple calendars. Each source's ICS URL is read from macOS Keychain.
The URLs themselves are capability secrets and must never be persisted
to the repo.

Sources (see SOURCES): macOS Keychain ``service=<name>, account=ics-url``.
Cache: ~/.claude/data/memento/<name>.ics (raw feed, one file per source)
TTL: fresh <6h. On fetch failure, falls back to any existing cache under
7 days old; anything older (or absent) is treated as missing.

Trivial anniversaries (birthdays, generic "기념일") are filtered out — they
flood the personal calendar and don't need Claude's attention.

Also exposes ``get_vacation_dates(window_days)`` which workday_context.py
imports to exclude vacation days from the business-day list. Detection is
by SUMMARY keyword + full-day duration.

Failure modes are all silent — partial output (some sources missing) is
preferred over blocking the session start hook.
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
CACHE_EXPIRED_SECONDS = 7 * 24 * 3600
FETCH_TIMEOUT = 10
KEYCHAIN_ACCOUNT = "ics-url"
WEEKDAY_KR = ["월", "화", "수", "목", "금", "토", "일"]
BYDAY_MAP = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}

# (keychain_service, display_label). Order controls both render order
# for same-time events and the vacation scan sweep.
SOURCES: list[tuple[str, str]] = [
    ("work-calendar", "회사"),
    ("personal-calendar", "개인"),
]

# SUMMARY substrings that mark trivial anniversaries (birthdays, etc.)
# matched case-insensitively.
ANNIVERSARY_KEYWORDS = (
    "생일",
    "기념일",
    "birthday",
    "b-day",
    "bday",
    "anniversary",
)

# SUMMARY substrings that mark vacation/OOO events. Matched case-insensitively.
# Half-day (반차/반반차) keywords are included but only full-day events
# (>= 8h duration) are actually excluded from business days.
VACATION_KEYWORDS = (
    "휴가",
    "연차",
    "반차",
    "오프",
    "pto",
    "ooo",
    "out of office",
)


def log(msg: str) -> None:
    print(f"[memento calendar] {msg}", file=sys.stderr)


def cache_path(service: str) -> Path:
    return Path.home() / ".claude" / "data" / "memento" / f"{service}.ics"


def get_ics_url(service: str) -> str | None:
    try:
        r = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                KEYCHAIN_ACCOUNT,
                "-s",
                service,
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception as e:
        log(f"keychain call failed for {service}: {e}")
        return None
    if r.returncode != 0:
        return None
    url = r.stdout.strip()
    return url or None


# NOTE: url is a capability secret (ICS publish link). Never interpolate
# it into log messages or stdout — urllib's default exception strings don't
# include it, keep it that way.
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


def load_or_refresh(service: str, url: str) -> tuple[str | None, str]:
    """Return (ics_text, source_label) where source_label ∈ {cache, fetch, stale, missing}."""
    cache = cache_path(service)
    cache.parent.mkdir(parents=True, exist_ok=True)

    age: float | None = None
    if cache.exists():
        age = datetime.now().timestamp() - cache.stat().st_mtime

    if age is not None and age < CACHE_FRESH_SECONDS:
        return cache.read_text(encoding="utf-8"), "cache"

    text = fetch_ics(url)
    if text is not None:
        try:
            cache.write_text(text, encoding="utf-8")
        except Exception as e:
            log(f"cache write failed for {service}: {e}")
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
    """Parse ICS DTSTART/DTEND value into an aware KST datetime.

    All non-Z timestamps are assumed to be KST. This is safe for the current
    Imagoworks Outlook feed (TZID=Korea Standard Time) and Google Calendar
    personal feeds used from a KST machine. The ``tzid`` argument is accepted
    but not interpreted — if future feeds mix timezones, switch to
    ``zoneinfo.ZoneInfo(tzid)`` here.

    Accepts:
    - YYYYMMDDTHHMMSS (naive → assumed KST)
    - YYYYMMDDTHHMMSSZ (UTC → converted to KST)
    - YYYYMMDD (all-day → 00:00 KST)
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
    __slots__ = (
        "summary",
        "dtstart",
        "dtend",
        "location",
        "rrule",
        "exdates",
        "all_day",
    )

    def __init__(self) -> None:
        self.summary: str = ""
        self.dtstart: datetime | None = None
        self.dtend: datetime | None = None
        self.location: str = ""
        self.rrule: dict[str, str] = {}
        self.exdates: set[datetime] = set()
        self.all_day: bool = False


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
            if params.get("VALUE") == "DATE" or (
                len(value.strip()) == 8 and value.strip().isdigit()
            ):
                cur.all_day = True
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


def is_trivial_anniversary(summary: str) -> bool:
    s = summary.casefold()
    return any(k.casefold() in s for k in ANNIVERSARY_KEYWORDS)


def is_vacation(ev: VEvent) -> bool:
    """Full-day-or-longer vacation/OOO events. Half-days (반차) are excluded
    from business-day removal because half a business day is still a
    business day."""
    if ev.dtstart is None:
        return False
    s = ev.summary.casefold()
    if not any(k.casefold() in s for k in VACATION_KEYWORDS):
        return False
    if ev.all_day:
        return True
    if ev.dtend is None:
        return False
    return (ev.dtend - ev.dtstart) >= timedelta(hours=8)


def load_source_events(
    service: str, window_days: int
) -> tuple[list[tuple[datetime, VEvent]], str]:
    """Fetch/cache/parse/expand a single source. Returns (occurrences, status).

    ``status`` ∈ {cache, fetch, stale, missing, unset, parse_error}.
    ``unset`` means keychain entry absent. Never raises."""
    try:
        url = get_ics_url(service)
        if not url:
            return [], "unset"
        text, status = load_or_refresh(service, url)
        if text is None:
            return [], status  # missing
        try:
            events = parse_vevents(unfold(text))
        except Exception as e:
            log(f"parse failed for {service}: {e}")
            return [], "parse_error"

        now = datetime.now(KST)
        today = now.date()
        window_end = today + timedelta(days=window_days)
        out: list[tuple[datetime, VEvent]] = []
        for ev in events:
            if ev.summary.strip().upper() in {"CANCELED", "CANCELLED"}:
                continue
            try:
                for dt in expand_event(ev, today, window_end):
                    if dt >= now - timedelta(hours=1):
                        out.append((dt, ev))
            except Exception as e:
                log(f"expand failed for '{ev.summary}' in {service}: {e}")
        return out, status
    except Exception as e:
        log(f"load_source_events({service}) unexpected failure: {e}")
        return [], "parse_error"


def get_vacation_dates(window_days: int) -> set[date]:
    """Scan all configured sources for full-day vacation events and return
    the set of KST dates they cover. Used by workday_context.py.

    Defensive: any exception anywhere → returns an empty set."""
    try:
        result: set[date] = set()
        today = datetime.now(KST).date()
        window_end = today + timedelta(days=window_days)
        for service, _label in SOURCES:
            occ, _status = load_source_events(service, window_days)
            # occ is already expanded — walk unique events by identity
            seen_ids: set[int] = set()
            for dt, ev in occ:
                if id(ev) in seen_ids:
                    continue
                seen_ids.add(id(ev))
                if not is_vacation(ev):
                    continue
                # Collect every date the vacation event covers.
                start_d = dt.date()
                if ev.dtend is not None:
                    # DTEND is exclusive in ICS; subtract 1 second to cap.
                    end_dt = ev.dtend
                    end_d = (end_dt - timedelta(seconds=1)).date()
                else:
                    end_d = start_d
                d = start_d
                while d <= end_d:
                    if today <= d <= window_end:
                        result.add(d)
                    d += timedelta(days=1)
        return result
    except Exception as e:
        log(f"get_vacation_dates failed: {e}")
        return set()


def render(
    occurrences: list[tuple[datetime, VEvent, str]],
    warnings: list[str],
) -> str:
    lines = [f"향후 일정 (오늘~+{WINDOW_DAYS}일, 회사+개인):"]
    if not occurrences:
        lines.append("- (일정 없음)")
    else:
        for dt, ev, label in occurrences[:20]:
            d = dt.date()
            label_date = f"{d.month:02d}-{d.day:02d}({WEEKDAY_KR[d.weekday()]})"
            time_label = dt.strftime("%H:%M")
            summary = ev.summary or "(제목 없음)"
            if len(summary) > 50:
                summary = summary[:49] + "…"
            loc = f" @ {ev.location}" if ev.location else ""
            lines.append(f"- {label_date} {time_label} [{label}] {summary}{loc}")
    for w in warnings:
        lines.append(f"⚠ {w}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    # --plugin-root accepted for shell-hook signature symmetry with
    # workday_context.py. Not used here: no fallback data dir.
    parser.add_argument("--plugin-root", required=True)
    parser.parse_args()

    all_occ: list[tuple[datetime, VEvent, str]] = []
    warnings: list[str] = []
    any_configured = False

    for service, label in SOURCES:
        occ, status = load_source_events(service, WINDOW_DAYS)
        if status == "unset":
            continue  # silently skip sources not configured
        any_configured = True
        if status == "missing":
            warnings.append(f"{label} 캘린더 조회 실패 (캐시 만료)")
            continue
        if status == "parse_error":
            warnings.append(f"{label} 캘린더 파싱 실패")
            continue
        if status == "stale":
            warnings.append(f"{label} 캘린더 stale (이전 캐시 사용)")
        for dt, ev in occ:
            if is_trivial_anniversary(ev.summary):
                continue
            all_occ.append((dt, ev, label))

    if not any_configured:
        sys.stdout.write(
            "향후 일정: 미설정 (keychain work-calendar/personal-calendar 없음)\n"
        )
        return 0

    all_occ.sort(key=lambda t: (t[0], t[2]))
    sys.stdout.write(render(all_occ, warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
