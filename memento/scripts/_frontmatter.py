"""YAML frontmatter 파싱 헬퍼 (표준 라이브러리만).

review-week 수집 스크립트들이 공유. daily note / inbox 이슈의 단순 frontmatter만
지원: 스칼라 key:value, 인라인 리스트(`[a, b]`), 멀티라인 리스트(`- item`).
중첩 dict, 멀티라인 스칼라(`|`/`>`), anchor/alias 미지원.
"""

from __future__ import annotations

import re
from pathlib import Path


_KV_RE = re.compile(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$")
_LIST_ITEM_RE = re.compile(r"^\s+-\s+(.*)$")


def _strip_quotes(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1]
    return s


def _parse_inline_list(s: str) -> list[str]:
    inner = s.strip()[1:-1]
    if not inner.strip():
        return []
    return [_strip_quotes(p) for p in inner.split(",")]


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body_text). Empty dict if no frontmatter."""
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        end = text.find("\n---", 4)
        if end == -1 or end + 4 != len(text.rstrip()):
            return {}, text
        body = ""
    else:
        body = text[end + 5 :]
    yaml_block = text[4:end]

    fm: dict = {}
    lines = yaml_block.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        m = _KV_RE.match(line)
        if not m:
            i += 1
            continue
        key, raw_val = m.group(1), m.group(2).strip()
        if raw_val == "":
            items: list[str] = []
            j = i + 1
            while j < len(lines):
                lm = _LIST_ITEM_RE.match(lines[j])
                if not lm:
                    break
                items.append(_strip_quotes(lm.group(1).strip()))
                j += 1
            if items:
                fm[key] = items
                i = j
                continue
            fm[key] = ""
            i += 1
            continue
        if raw_val.startswith("[") and raw_val.endswith("]"):
            fm[key] = _parse_inline_list(raw_val)
        else:
            fm[key] = _strip_quotes(raw_val)
        i += 1
    return fm, body


def read_frontmatter(path: Path | str) -> tuple[dict, str]:
    """Read file at path, return (frontmatter, body). UTF-8 only."""
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    return parse_frontmatter(text)
