#!/usr/bin/env python3
"""Fetch Korean holidays from KASI 특일정보 API and write cache.

Reads the service key from ~/.netrc entry `machine apis.data.go.kr`.
Writes to ~/.claude/data/memento/kr-holidays.json atomically.
Scope: current month + next month (2 months, sliding window).

Usage:
    python3 update_holidays.py             # silent mode (background)
    python3 update_holidays.py --verbose   # print progress to stderr
"""

from __future__ import annotations

import argparse
import json
import netrc
import sys
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
ENDPOINT = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
MACHINE = "apis.data.go.kr"


def log(msg: str, verbose: bool) -> None:
    if verbose:
        print(f"[update_holidays] {msg}", file=sys.stderr)


def load_service_key() -> str | None:
    """Read service key from ~/.netrc `machine apis.data.go.kr` password."""
    netrc_path = Path.home() / ".netrc"
    if not netrc_path.exists():
        return None
    try:
        rc = netrc.netrc(str(netrc_path))
    except netrc.NetrcParseError as e:
        print(f"[update_holidays] .netrc parse error: {e}", file=sys.stderr)
        return None
    auth = rc.authenticators(MACHINE)
    if not auth:
        return None
    _login, _account, password = auth
    return password or None


def fetch_month(service_key: str, year: int, month: int, verbose: bool) -> dict[str, str]:
    """Return {YYYY-MM-DD: name} for the given month."""
    params = {
        "solYear": f"{year:04d}",
        "solMonth": f"{month:02d}",
        "ServiceKey": service_key,
        "numOfRows": "100",
        "_type": "xml",
    }
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params, safe=':/')}"
    log(f"fetching {year}-{month:02d}", verbose)

    req = urllib.request.Request(url, headers={"User-Agent": "memento-workday/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read()

    root = ET.fromstring(body)
    result_code = root.findtext(".//resultCode") or ""
    if result_code not in ("", "00"):
        result_msg = root.findtext(".//resultMsg") or "unknown"
        raise RuntimeError(f"KASI API error {result_code}: {result_msg}")

    out: dict[str, str] = {}
    for item in root.findall(".//item"):
        locdate = item.findtext("locdate") or ""
        dateName = item.findtext("dateName") or ""
        isHoliday = (item.findtext("isHoliday") or "").strip().upper()
        if len(locdate) != 8 or isHoliday != "Y":
            continue
        iso = f"{locdate[0:4]}-{locdate[4:6]}-{locdate[6:8]}"
        if iso in out:
            out[iso] = f"{out[iso]}; {dateName}"
        else:
            out[iso] = dateName
    log(f"  → {len(out)} holidays", verbose)
    return out


def month_range(start: date, months: int) -> list[tuple[int, int]]:
    """Return (year, month) tuples for the next N months starting from start."""
    out = []
    y, m = start.year, start.month
    for _ in range(months):
        out.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def window_bounds(start: date, months: int) -> tuple[date, date]:
    """First day of start month → last day of start+months-1 month."""
    months_list = month_range(start, months)
    first_y, first_m = months_list[0]
    last_y, last_m = months_list[-1]
    first = date(first_y, first_m, 1)
    if last_m == 12:
        last = date(last_y, 12, 31)
    else:
        last = date(last_y, last_m + 1, 1) - timedelta(days=1)
    return first, last


def write_cache(holidays: dict[str, str], window: tuple[date, date]) -> Path:
    cache_dir = Path.home() / ".claude" / "data" / "memento"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / "kr-holidays.json"

    payload = {
        "version": 1,
        "last_updated": datetime.now(KST).isoformat(timespec="seconds"),
        "source": "kasi",
        "window": {"from": window[0].isoformat(), "to": window[1].isoformat()},
        "holidays": dict(sorted(holidays.items())),
    }

    # Atomic write: tmp → rename
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=cache_dir,
        prefix="kr-holidays-",
        suffix=".tmp",
        delete=False,
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp_path = Path(tmp.name)
    tmp_path.replace(cache_file)
    return cache_file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    service_key = load_service_key()
    if not service_key:
        log(
            f".netrc missing `machine {MACHINE}` entry — skipping fetch",
            args.verbose,
        )
        return 2

    today = datetime.now(KST).date()
    months = month_range(today, 2)
    window = window_bounds(today, 2)

    merged: dict[str, str] = {}
    try:
        for y, m in months:
            merged.update(fetch_month(service_key, y, m, args.verbose))
    except Exception as e:
        print(f"[update_holidays] fetch failed: {e}", file=sys.stderr)
        return 1

    cache_file = write_cache(merged, window)
    log(f"wrote {len(merged)} holidays → {cache_file}", args.verbose)
    if args.verbose:
        for iso, name in sorted(merged.items()):
            print(f"  {iso}  {name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
