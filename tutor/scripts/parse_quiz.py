#!/usr/bin/env python3
"""Parse quiz callout blocks from an Obsidian note and output as JSON.

Usage:
    obsidian vault="X" read path="Y" | python3 parse_quiz.py [--shuffle] [--prioritize FILE]

Output: JSON array of quiz items to stdout.
"""

import argparse
import json
import random
import re
import sys


def parse_quiz_blocks(text: str) -> list[dict]:
    """Extract quiz items from > [!quiz] callout blocks."""
    items = []
    # Match each > [!quiz] callout block and extract question number + body
    block_pattern = re.compile(
        r'> \[!quiz\]-?\s*Q(\d+)\s*:\s*(.+?)(?=\n> \[!quiz\]|\n[^>]|\Z)',
        re.DOTALL,
    )
    for match in block_pattern.finditer(text):
        num = int(match.group(1))
        block = match.group(2).strip()
        lines = block.split('\n')

        question = lines[0].strip() if lines else ''
        choices = {}
        answer = ''
        explanation = ''

        for line in lines[1:]:
            if line.startswith('> '):
                line = line[2:]
            elif line.startswith('>'):
                line = line[1:]
            line = line.strip()
            # Choice: - A) text
            choice_match = re.match(r'^-\s*([A-D])\)\s*(.+)', line)
            if choice_match:
                choices[choice_match.group(1).lower()] = choice_match.group(2).strip()
                continue
            # Answer: **정답**: X
            answer_match = re.match(r'^\*\*정답\*\*\s*:\s*([A-Da-d])', line)
            if answer_match:
                answer = answer_match.group(1).upper()
                continue
            # Explanation: **해설**: text
            expl_match = re.match(r'^\*\*해설\*\*\s*:\s*(.+)', line)
            if expl_match:
                explanation = expl_match.group(1).strip()
                continue

        if question and answer:
            items.append({
                'n': num,
                'question': question,
                'a': choices.get('a', ''),
                'b': choices.get('b', ''),
                'c': choices.get('c', ''),
                'd': choices.get('d', ''),
                'answer': answer,
                'explanation': explanation,
            })

    return items


def main():
    parser = argparse.ArgumentParser(description='Parse quiz callout blocks')
    parser.add_argument('--shuffle', action='store_true', help='Shuffle questions randomly')
    parser.add_argument('--prioritize', type=str, help='File with priority question texts (one per line)')
    args = parser.parse_args()

    text = sys.stdin.read()
    items = parse_quiz_blocks(text)

    if args.shuffle:
        random.shuffle(items)

    if args.prioritize:
        try:
            with open(args.prioritize) as f:
                priority_texts = [line.strip() for line in f if line.strip()]
        except FileNotFoundError:
            print(f'Warning: prioritize file not found: {args.prioritize}', file=sys.stderr)
            priority_texts = []
        except OSError as e:
            print(f'Error: cannot read {args.prioritize}: {e}', file=sys.stderr)
            sys.exit(1)

        priority = []
        rest = []
        for item in items:
            if any(pt in item['question'] for pt in priority_texts):
                priority.append(item)
            else:
                rest.append(item)
        items = priority + rest

    # Renumber after shuffle/prioritize
    for i, item in enumerate(items, 1):
        item['n'] = i

    json.dump(items, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == '__main__':
    main()
