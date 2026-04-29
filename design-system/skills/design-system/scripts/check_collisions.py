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


def overlap(a, b, min_gap=0):
    """Check overlap with optional min_gap. min_gap=0 = strict overlap (touching = OK).
    min_gap=N = violations include any pair closer than N px on both axes."""
    ax, ay, aw, ah = a["x"], a["y"], a["width"], a["height"]
    bx, by, bw, bh = b["x"], b["y"], b["width"], b["height"]
    return (
        ax < bx + bw + min_gap
        and ax + aw + min_gap > bx
        and ay < by + bh + min_gap
        and ay + ah + min_gap > by
    )


def overlap_area(a, b):
    ox1 = max(a["x"], b["x"])
    ox2 = min(a["x"] + a["width"], b["x"] + b["width"])
    oy1 = max(a["y"], b["y"])
    oy2 = min(a["y"] + a["height"], b["y"] + b["height"])
    return max(0, ox2 - ox1), max(0, oy2 - oy1)


def gap_between(a, b):
    """Return (dx, dy) gap between two non-overlapping rects.
    Negative value means overlap on that axis. Zero means touching."""
    ax2 = a["x"] + a["width"]
    bx2 = b["x"] + b["width"]
    ay2 = a["y"] + a["height"]
    by2 = b["y"] + b["height"]
    dx = max(b["x"] - ax2, a["x"] - bx2)
    dy = max(b["y"] - ay2, a["y"] - by2)
    return dx, dy


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
        "--min-gap",
        type=int,
        default=40,
        help="Minimum required gap between rects (px). Default 40. "
             "Use 0 to allow touching (strict overlap only).",
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
            if overlap(a, b, args.min_gap):
                ow, oh = overlap_area(a, b)
                gx, gy = gap_between(a, b)
                collisions.append((a, b, ow, oh, gx, gy))

    def needed_shift(gx, gy, min_gap):
        """Returns (need_x, need_y) — how much more px on each axis to satisfy min_gap.
        Caller can shift either axis by its `need` value to resolve violation."""
        return max(0, min_gap - gx), max(0, min_gap - gy)

    if args.json:
        out = {
            "checked": len(nodes),
            "min_gap": args.min_gap,
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
                    "gap_x": gx,
                    "gap_y": gy,
                    "need_x": needed_shift(gx, gy, args.min_gap)[0],
                    "need_y": needed_shift(gx, gy, args.min_gap)[1],
                }
                for a, b, ow, oh, gx, gy in collisions
            ],
        }
        json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 1 if collisions else 0

    gap_label = f" (min-gap {args.min_gap}px)"
    print(f"Checked {len(nodes)} nodes{gap_label}")
    if not collisions:
        print(f"OK — all pairs have ≥ {args.min_gap}px gap on at least one axis")
        return 0

    label = "collision(s)" if args.min_gap == 0 else f"violation(s) (gap < {args.min_gap}px)"
    print(f"FAIL — {len(collisions)} {label}:")
    for a, b, ow, oh, gx, gy in collisions:
        nx, ny = needed_shift(gx, gy, args.min_gap)
        print()
        print(f"  [{a.get('id')}] {a.get('name', '')!r}")
        print(f"    rect: x={a['x']} y={a['y']} w={a['width']} h={a['height']}")
        print("  vs")
        print(f"  [{b.get('id')}] {b.get('name', '')!r}")
        print(f"    rect: x={b['x']} y={b['y']} w={b['width']} h={b['height']}")
        if ow > 0 and oh > 0:
            print(f"  overlap: {ow}×{oh} px")
            print(f"  → 한 축에서 더 띄워야 함: x축 +{ow + args.min_gap}px 또는 y축 +{oh + args.min_gap}px")
        else:
            print(f"  gap: dx={gx} dy={gy} px (need ≥ {args.min_gap})")
            print(f"  → 한 축에서 더 띄워야 함: x축 +{nx}px 또는 y축 +{ny}px")
    return 1


if __name__ == "__main__":
    sys.exit(main())
