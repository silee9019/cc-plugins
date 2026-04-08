#!/usr/bin/env python3
"""Shared helpers for obsidian CLI interaction."""

import subprocess
import sys


def run_obsidian(vault: str, *args: str) -> str:
    """Run an obsidian CLI command and return stdout. Exits on failure."""
    cmd = ['obsidian', f'vault={vault}'] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'Error: {" ".join(cmd)} failed (rc={result.returncode}): {result.stderr.strip()}', file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def run_obsidian_soft(vault: str, *args: str) -> str | None:
    """Run an obsidian CLI command. Returns None on failure instead of exiting."""
    cmd = ['obsidian', f'vault={vault}'] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'Warning: {" ".join(cmd)} failed (rc={result.returncode}): {result.stderr.strip()}', file=sys.stderr)
        return None
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
    """Read a single property from a note's frontmatter. Exits on failure."""
    return run_obsidian(vault, 'property:read', f'name={name}', f'path={path}')


def read_property_soft(vault: str, path: str, name: str) -> str | None:
    """Read a single property. Returns None on failure."""
    return run_obsidian_soft(vault, 'property:read', f'name={name}', f'path={path}')


def set_property(vault: str, path: str, name: str, value: str) -> None:
    """Set a single property in a note's frontmatter. Exits on failure."""
    run_obsidian(vault, 'property:set', f'name={name}', f'value={value}', f'path={path}')
