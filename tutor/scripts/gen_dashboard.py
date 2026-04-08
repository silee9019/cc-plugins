#!/usr/bin/env python3
"""Generate dashboard markdown from scan_notes.py JSON output.

Usage:
    python3 scan_notes.py <vault> <path> | python3 gen_dashboard.py

Output: Dashboard markdown to stdout (YAML frontmatter + tables).
"""

import json
import sys
from datetime import date


def status_emoji(mastery: int, quiz_count: int) -> str:
    """Return status emoji based on mastery and quiz count."""
    if quiz_count == 0:
        return '\u2b1c'  # white square
    if mastery >= 80:
        return '\U0001f7e2'  # green circle
    if mastery >= 50:
        return '\U0001f7e1'  # yellow circle
    return '\U0001f534'  # red circle


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f'Error: invalid JSON input: {e}', file=sys.stderr)
        sys.exit(1)

    today = date.today().isoformat()
    total = data['total_notes']
    quizzed = data['quizzed_notes']
    avg = data['avg_mastery']

    lines = [
        '---',
        f'updated: {today}',
        '---',
        '',
        '# \ud559\uc2b5 \ub300\uc2dc\ubcf4\ub4dc',
        '',
        '## \uc804\uccb4 \ud604\ud669',
        '',
        '| \uc9c0\ud45c | \uac12 |',
        '|------|------|',
        f'| \ucd1d \ud559\uc2b5 \ub178\ud2b8 | {total}\uac1c |',
        f'| \ud034\uc988 \uc644\ub8cc | {quizzed}\uac1c |',
        f'| \ud3c9\uade0 mastery | {avg}% |',
        '',
        '## \uce74\ud14c\uace0\ub9ac\ubcc4 \ud604\ud669',
        '',
        '| \uce74\ud14c\uace0\ub9ac | \ub178\ud2b8 \uc218 | \ud3c9\uade0 mastery | \uc0c1\ud0dc |',
        '|----------|---------|-------------|------|',
    ]

    for cat in data['categories']:
        notes = cat['notes']
        cat_total = len(notes)
        cat_quizzed = [n for n in notes if n['quiz_count'] > 0]
        cat_avg = round(sum(n['mastery'] for n in cat_quizzed) / len(cat_quizzed)) if cat_quizzed else 0
        emoji = status_emoji(cat_avg, len(cat_quizzed))
        lines.append(f'| {cat["name"]} | {cat_total} | {cat_avg}% | {emoji} |')

    lines.extend(['', '## \ucd5c\uadfc \ud559\uc2b5', ''])

    # Collect all notes, sort by last_quiz_date descending, show top 10
    all_notes = [{**note, 'category': cat['name']} for cat in data['categories'] for note in cat['notes']]

    all_notes.sort(key=lambda n: n.get('last_quiz_date') or '', reverse=True)
    for note in all_notes[:10]:
        lines.append(f'- [[{note["name"]}]] \u2014 {note["category"]} \u2014 mastery {note["mastery"]}%')

    # Weak areas
    weak = [n for n in all_notes if n['quiz_count'] > 0 and n['mastery'] < 50]
    if weak:
        lines.extend(['', '## \uc57d\uc810 \uc601\uc5ed (mastery < 50%)', ''])
        for note in sorted(weak, key=lambda n: n['mastery']):
            lines.append(f'- [[{note["name"]}]] \u2014 {note["mastery"]}%')

    print('\n'.join(lines))


if __name__ == '__main__':
    main()
