#!/usr/bin/env python3
"""
Slide collision checker — AABB overlap detection for .pen layout.

Input: JSON output from `mcp__pencil__snapshot_layout` or `batch_get`.
Output: collision report with overlap area in px.

Usage:
    cat snapshot.json | python3 check_collisions.py
    python3 check_collisions.py snapshot.json
    python3 check_collisions.py --filter "^Slide" --min-width 1000 < snapshot.json
"""

import argparse
import json
import re
import sys


def iter_nodes(data, top_level_only=False):
    """Walk the node tree, yielding nodes that have absolute x/y/width/height."""
    if isinstance(data, list):
        for item in data:
            yield from iter_nodes(item, top_level_only)
    elif isinstance(data, dict):
        if all(k in data for k in ("x", "y", "width", "height")):
            yield data
            if top_level_only:
                return
        for child in data.get("children") or []:
            if isinstance(child, dict):
                yield from iter_nodes(child, top_level_only)


def is_numeric(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def overlap(a, b):
    ax, ay, aw, ah = a["x"], a["y"], a["width"], a["height"]
    bx, by, bw, bh = b["x"], b["y"], b["width"], b["height"]
    return ax < bx + bw and ax + aw > bx and ay < by + bh and ay + ah > by


def overlap_area(a, b):
    ox1 = max(a["x"], b["x"])
    ox2 = min(a["x"] + a["width"], b["x"] + b["width"])
    oy1 = max(a["y"], b["y"])
    oy2 = min(a["y"] + a["height"], b["y"] + b["height"])
    return max(0, ox2 - ox1), max(0, oy2 - oy1)


def main():
    parser = argparse.ArgumentParser(
        description="Detect overlapping rectangles in .pen layout JSON.",
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Input JSON file (default: stdin)",
    )
    parser.add_argument(
        "--filter",
        help="Regex to filter by node name (matched anywhere in name)",
    )
    parser.add_argument(
        "--min-width",
        type=int,
        default=0,
        help="Minimum width — exclude smaller nodes (e.g. 1000 to skip mini-map cards)",
    )
    parser.add_argument(
        "--min-height",
        type=int,
        default=0,
        help="Minimum height",
    )
    parser.add_argument(
        "--top-level-only",
        action="store_true",
        help="Only top-level nodes (do not recurse into children)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of human-readable text",
    )
    args = parser.parse_args()

    if args.input:
        with open(args.input, encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    nodes = []
    for n in iter_nodes(data, top_level_only=args.top_level_only):
        if not all(is_numeric(n.get(k)) for k in ("x", "y", "width", "height")):
            continue
        if n["width"] < args.min_width or n["height"] < args.min_height:
            continue
        if args.filter and not re.search(args.filter, n.get("name", "")):
            continue
        nodes.append(n)

    collisions = []
    for i, a in enumerate(nodes):
        for b in nodes[i + 1 :]:
            if overlap(a, b):
                ow, oh = overlap_area(a, b)
                collisions.append((a, b, ow, oh))

    if args.json:
        out = {
            "checked": len(nodes),
            "collisions": [
                {
                    "a": {
                        "id": a.get("id"),
                        "name": a.get("name", ""),
                        "x": a["x"],
                        "y": a["y"],
                        "w": a["width"],
                        "h": a["height"],
                    },
                    "b": {
                        "id": b.get("id"),
                        "name": b.get("name", ""),
                        "x": b["x"],
                        "y": b["y"],
                        "w": b["width"],
                        "h": b["height"],
                    },
                    "overlap_w": ow,
                    "overlap_h": oh,
                }
                for a, b, ow, oh in collisions
            ],
        }
        json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 1 if collisions else 0

    print(f"Checked {len(nodes)} nodes")
    if not collisions:
        print("OK — no collisions detected")
        return 0

    print(f"FAIL — {len(collisions)} collision(s):")
    for a, b, ow, oh in collisions:
        print()
        print(f"  [{a.get('id')}] {a.get('name', '')!r}")
        print(f"    rect: x={a['x']} y={a['y']} w={a['width']} h={a['height']}")
        print("  vs")
        print(f"  [{b.get('id')}] {b.get('name', '')!r}")
        print(f"    rect: x={b['x']} y={b['y']} w={b['width']} h={b['height']}")
        print(f"  overlap: {ow}x{oh} px")
    return 1


if __name__ == "__main__":
    sys.exit(main())
