#!/usr/bin/env python3
"""Update mastery stats for a study note after a quiz session.

Usage:
    python3 update_mastery.py <vault> <note_path> <session_correct> <session_total>

Reads current mastery/quiz_count/correct_count via obsidian CLI,
computes new values, and writes them back.
"""

import json
import subprocess
import sys
from datetime import date


def run_obsidian(vault: str, *args: str) -> str:
    """Run an obsidian CLI command and return stdout."""
    cmd = ['obsidian', f'vault={vault}'] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'Error: {" ".join(cmd)} failed (rc={result.returncode}): {result.stderr.strip()}', file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def read_property(vault: str, path: str, name: str) -> str:
    """Read a single property from a note's frontmatter."""
    return run_obsidian(vault, 'property:read', f'name={name}', f'path={path}')


def set_property(vault: str, path: str, name: str, value: str) -> None:
    """Set a single property in a note's frontmatter."""
    run_obsidian(vault, 'property:set', f'name={name}', f'value={value}', f'path={path}')


def safe_int(value: str, default: int = 0) -> int:
    """Parse integer from string, returning default on empty or non-integer values."""
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        print(f'Warning: non-integer value "{value}", using {default}', file=sys.stderr)
        return default


def main():
    if len(sys.argv) != 5:
        print(f'Usage: {sys.argv[0]} <vault> <note_path> <session_correct> <session_total>', file=sys.stderr)
        sys.exit(1)

    vault = sys.argv[1]
    note_path = sys.argv[2]
    try:
        session_correct = int(sys.argv[3])
        session_total = int(sys.argv[4])
    except ValueError:
        print(f'Error: session_correct and session_total must be integers, got: {sys.argv[3]!r}, {sys.argv[4]!r}', file=sys.stderr)
        sys.exit(1)

    if session_total <= 0:
        print('Error: session_total must be > 0', file=sys.stderr)
        sys.exit(1)

    # Read current values
    old_mastery = safe_int(read_property(vault, note_path, 'mastery'))
    old_quiz_count = safe_int(read_property(vault, note_path, 'quiz_count'))
    old_correct_count = safe_int(read_property(vault, note_path, 'correct_count'))

    # Compute new values
    new_quiz_count = old_quiz_count + 1
    new_correct_count = old_correct_count + session_correct
    session_rate = round(session_correct / session_total * 100)

    if new_quiz_count == 1:
        new_mastery = session_rate
    else:
        new_mastery = round(old_mastery * 0.6 + session_rate * 0.4)

    today = date.today().isoformat()

    # Write back
    set_property(vault, note_path, 'mastery', str(new_mastery))
    set_property(vault, note_path, 'quiz_count', str(new_quiz_count))
    set_property(vault, note_path, 'correct_count', str(new_correct_count))
    set_property(vault, note_path, 'last_quiz_date', today)

    # Output summary
    result = {
        'mastery': new_mastery,
        'quiz_count': new_quiz_count,
        'correct_count': new_correct_count,
        'last_quiz_date': today,
        'session_rate': session_rate,
    }
    json.dump(result, sys.stdout, ensure_ascii=False)
    print()


if __name__ == '__main__':
    main()
