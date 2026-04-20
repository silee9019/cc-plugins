#!/usr/bin/env python3
"""Collect git commits by author within [START, END] (inclusive, KST).

Usage:
  collect_commits.py <REPOS_BASE_PATH> <EMAIL> <START> <END>

Auto-discovers .git directories under REPOS_BASE_PATH (depth 4), excluding
node_modules / .cache / vendor / .bak / hidden folders. Bare repos and
worktree git-link files are skipped. Duplicates removed by realpath.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path


_EXCLUDE_NAMES = {"node_modules", ".cache", "vendor", ".bak", ".archive", ".Trash"}
_MAX_DEPTH = 4


def parse_iso(s: str) -> date | None:
    try:
        return date.fromisoformat(s.strip()[:10])
    except (ValueError, AttributeError):
        return None


def find_repos(base: Path) -> list[Path]:
    """Walk under base, return realpath of .git parent directories."""
    seen: set[str] = set()
    repos: list[Path] = []
    base = base.resolve()
    base_depth = len(base.parts)
    for root, dirs, _files in os.walk(base, followlinks=False):
        depth = len(Path(root).parts) - base_depth
        if depth >= _MAX_DEPTH:
            dirs[:] = []
            continue
        dirs[:] = [
            d for d in dirs
            if d not in _EXCLUDE_NAMES and not (d.startswith(".") and d != ".git")
        ]
        if ".git" in dirs:
            git_path = Path(root) / ".git"
            if git_path.is_dir():
                try:
                    real = str(Path(root).resolve())
                except OSError:
                    continue
                if real not in seen:
                    seen.add(real)
                    repos.append(Path(real))
            dirs.remove(".git")
    return sorted(repos)


def git_log(repo: Path, email: str, start: date, end: date) -> list[dict]:
    """Run git log in repo, return list of commits within [start, end]."""
    until = (end + timedelta(days=1)).isoformat()
    cmd = [
        "git", "-C", str(repo), "log",
        f"--author={email}",
        f"--since={start.isoformat()}",
        f"--until={until}",
        "--no-merges",
        "--all",
        "--format=%H|%ad|%s",
        "--date=short",
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", timeout=30
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"[collect_commits] git log failed in {repo}: {e}", file=sys.stderr)
        return []
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if stderr:
            print(f"[collect_commits] git log {repo}: {stderr}", file=sys.stderr)
        return []
    commits: list[dict] = []
    for line in result.stdout.split("\n"):
        if not line.strip():
            continue
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        commits.append({"hash": parts[0], "date": parts[1], "message": parts[2]})
    return commits


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(
            "Usage: collect_commits.py <REPOS_BASE_PATH> <EMAIL> <START> <END>",
            file=sys.stderr,
        )
        return 2
    base = Path(argv[1])
    email = argv[2]
    start = parse_iso(argv[3])
    end = parse_iso(argv[4])
    if start is None or end is None or start > end:
        print(f"[collect_commits] invalid date range: {argv[3]}..{argv[4]}", file=sys.stderr)
        return 2
    if not base.exists():
        print(f"[collect_commits] base not found: {base}", file=sys.stderr)
        print(json.dumps({"repos": [], "counts": {"commits": 0, "active_repos": 0}}, ensure_ascii=False, indent=2))
        return 0

    repos_out: list[dict] = []
    total_commits = 0
    for repo in find_repos(base):
        commits = git_log(repo, email, start, end)
        if not commits:
            continue
        repos_out.append({
            "path": str(repo),
            "name": repo.name,
            "commits": commits,
        })
        total_commits += len(commits)

    out = {
        "repos": repos_out,
        "counts": {"commits": total_commits, "active_repos": len(repos_out)},
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
