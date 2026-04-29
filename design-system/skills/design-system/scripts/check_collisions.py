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


def alignment_outliers(nodes, tolerance, max_mate_gap):
    """Detect alignment outliers among row/column mates.

    Row mate: y close (≤ tolerance) AND x-axis separated (no overlap on x)
              AND x-axis gap ≤ max_mate_gap (same zone proximity).
    Column mate: x close (≤ tolerance) AND y-axis separated AND y-axis gap ≤ max_mate_gap.

    For each node, find its row/column mates. If the node's y (or x) value
    differs from the dominant value among mates → outlier.

    Returns list of dicts: {axis, node, expected, actual, delta, peers}.
    """
    from collections import Counter

    out_map = {}  # (axis, id) -> dict (dedup)

    axes = (
        # axis_label, key, ortho_key, ortho_dim_key
        ("y", "y", "x", "width"),   # row mate
        ("x", "x", "y", "height"),  # column mate
    )

    for axis, key, ortho_key, ortho_dim in axes:
        for a in nodes:
            a_o1 = a[ortho_key]
            a_o2 = a[ortho_key] + a[ortho_dim]
            mates = []
            for b in nodes:
                if a is b:
                    continue
                b_o1 = b[ortho_key]
                b_o2 = b[ortho_key] + b[ortho_dim]
                # mate must be separated on the orthogonal axis
                if not (a_o2 <= b_o1 or b_o2 <= a_o1):
                    continue
                # ortho gap must be small enough (same zone proximity)
                ortho_gap = max(b_o1 - a_o2, a_o1 - b_o2)
                if ortho_gap > max_mate_gap:
                    continue
                if abs(a[key] - b[key]) > tolerance:
                    continue
                mates.append(b)
            if not mates:
                continue
            vals = [m[key] for m in mates] + [a[key]]
            if len(set(vals)) == 1:
                continue
            counter = Counter(vals)
            top = counter.most_common()
            max_count = top[0][1]
            candidates = [v for v, c in top if c == max_count]
            dominant = min(candidates, key=abs)
            if a[key] != dominant:
                key_id = (axis, a.get("id"))
                if key_id not in out_map:
                    out_map[key_id] = {
                        "axis": axis,
                        "node": a,
                        "expected": dominant,
                        "actual": a[key],
                        "delta": a[key] - dominant,
                        "peers": [m for m in mates if m[key] == dominant],
                    }
    return list(out_map.values())


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
        "--align-tolerance",
        type=int,
        default=30,
        help="Tolerance for alignment check (px). Nodes whose y (or x) differs by "
             "≤ this amount AND are separated on the orthogonal axis are treated as "
             "row (or column) mates. Outliers (y/x not matching dominant value) are "
             "reported. Default 30. Use 0 to disable alignment check.",
    )
    parser.add_argument(
        "--max-mate-gap",
        type=int,
        default=2000,
        help="Maximum orthogonal-axis gap (px) for row/column mate consideration. "
             "Mates farther than this on the orthogonal axis are treated as different "
             "zones and excluded from alignment check. Default 2000.",
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

    align_outliers = (
        alignment_outliers(nodes, args.align_tolerance, args.max_mate_gap)
        if args.align_tolerance > 0
        else []
    )

    def needed_shift(gx, gy, min_gap):
        """Returns (need_x, need_y) — how much more px on each axis to satisfy min_gap.
        Caller can shift either axis by its `need` value to resolve violation."""
        return max(0, min_gap - gx), max(0, min_gap - gy)

    if args.json:
        out = {
            "checked": len(nodes),
            "min_gap": args.min_gap,
            "align_tolerance": args.align_tolerance,
            "alignment_outliers": [
                {
                    "axis": o["axis"],
                    "id": o["node"].get("id"),
                    "name": o["node"].get("name", ""),
                    "expected": o["expected"],
                    "actual": o["actual"],
                    "delta": o["delta"],
                    "peer_ids": [p.get("id") for p in o["peers"]],
                }
                for o in align_outliers
            ],
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
        return 1 if (collisions or align_outliers) else 0

    gap_label = f" (min-gap {args.min_gap}px"
    if args.align_tolerance:
        gap_label += f", align-tolerance {args.align_tolerance}px"
    gap_label += ")"
    print(f"Checked {len(nodes)} nodes{gap_label}")

    if not collisions and not align_outliers:
        print(f"OK — no collisions, no alignment outliers")
        return 0

    if collisions:
        label = "collision(s)" if args.min_gap == 0 else f"violation(s) (gap < {args.min_gap}px)"
        print(f"\nFAIL — {len(collisions)} {label}:")
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

    if align_outliers:
        print(f"\nALIGN — {len(align_outliers)} outlier(s) (cluster within {args.align_tolerance}px):")
        for o in align_outliers:
            n = o["node"]
            peer_ids = ", ".join(p.get("id", "?") for p in o["peers"][:3])
            if len(o["peers"]) > 3:
                peer_ids += f" +{len(o['peers'])-3}"
            print()
            print(f"  [{n.get('id')}] {n.get('name', '')!r}")
            print(f"    {o['axis']}={o['actual']} (peers' dominant {o['axis']}={o['expected']} ← {peer_ids})")
            shift = -o["delta"]
            sign = "+" if shift > 0 else ""
            print(f"  → 정렬 맞추려면 {o['axis']} 축으로 {sign}{shift}px 시프트 ({o['axis']}={o['expected']})")

    return 1


if __name__ == "__main__":
    sys.exit(main())
