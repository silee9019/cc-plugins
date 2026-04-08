#!/usr/bin/env python3
"""Scan study notes and output per-category statistics as JSON.

Usage:
    python3 scan_notes.py <vault> <study_base_path>

Output: JSON with categories, notes, mastery stats.
Automatically excludes _ prefixed folders/files (meta files like _dashboard, _quiz-results).
"""

import json
import subprocess
import sys


def run_obsidian(vault: str, *args: str) -> str:
    """Run an obsidian CLI command and return stdout."""
    cmd = ['obsidian', f'vault={vault}'] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'Error: {" ".join(cmd)} failed (rc={result.returncode}): {result.stderr.strip()}', file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def safe_int(value: str, default: int = 0) -> int:
    """Parse integer from string, returning default on empty or non-integer values."""
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        print(f'Warning: non-integer value "{value}", using {default}', file=sys.stderr)
        return default


def read_property(vault: str, path: str, name: str) -> str:
    """Read a single property from a note's frontmatter."""
    return run_obsidian(vault, 'property:read', f'name={name}', f'path={path}')


def main():
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <vault> <study_base_path>', file=sys.stderr)
        sys.exit(1)

    vault = sys.argv[1]
    study_base_path = sys.argv[2]

    # Get all folders in vault
    folders_output = run_obsidian(vault, 'folders')
    all_folders = [f.strip() for f in folders_output.split('\n') if f.strip()]

    # Filter: only direct children of study_base_path, exclude _ prefix
    prefix = study_base_path.rstrip('/') + '/'
    categories = []
    for folder in all_folders:
        if not folder.startswith(prefix):
            continue
        relative = folder[len(prefix):]
        # Direct child only (no nested /)
        if '/' in relative:
            continue
        # Exclude _ prefix (meta folders like _quiz-results)
        if relative.startswith('_'):
            continue
        categories.append(relative)

    # Scan each category
    result_categories = []
    total_notes = 0
    quizzed_notes = 0
    mastery_sum = 0

    for category in sorted(categories):
        folder_path = f'{study_base_path}/{category}'
        files_output = run_obsidian(vault, 'files', f'folder={folder_path}')
        files = [f.strip() for f in files_output.split('\n') if f.strip()]

        # Exclude _ prefix files
        files = [f for f in files if not f.split('/')[-1].startswith('_')]

        notes = []
        for file_path in files:
            mastery = safe_int(read_property(vault, file_path, 'mastery'))
            quiz_count = safe_int(read_property(vault, file_path, 'quiz_count'))
            last_quiz_date = read_property(vault, file_path, 'last_quiz_date') or ''

            # Extract note name from path (remove folder prefix and .md)
            name = file_path.split('/')[-1]
            if name.endswith('.md'):
                name = name[:-3]

            notes.append({
                'name': name,
                'path': file_path,
                'mastery': mastery,
                'quiz_count': quiz_count,
                'last_quiz_date': last_quiz_date,
            })

            total_notes += 1
            if quiz_count > 0:
                quizzed_notes += 1
                mastery_sum += mastery

        result_categories.append({
            'name': category,
            'notes': notes,
        })

    avg_mastery = round(mastery_sum / quizzed_notes) if quizzed_notes > 0 else 0

    output = {
        'categories': result_categories,
        'total_notes': total_notes,
        'quizzed_notes': quizzed_notes,
        'avg_mastery': avg_mastery,
    }

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == '__main__':
    main()
