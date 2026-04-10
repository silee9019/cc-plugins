#!/usr/bin/env python3
"""Scan Repositories tree for active git repos and collect commits in date range.

Usage:
    collect_commits.py <repos_base_path> <author_email> <start_date> <end_date>

Walks up to 2 levels deep under <repos_base_path>, finds directories with .git/,
runs git log filtered by author and date range. Repos with 0 commits are excluded.

Output: JSON on stdout.
"""

import json
import os
import subprocess
import sys
from datetime import datetime


def find_repos(base: str, max_depth: int = 2) -> list:
    repos = []
    base = base.rstrip("/")
    if not os.path.isdir(base):
        return repos

    def walk(path: str, depth: int):
        if os.path.isdir(os.path.join(path, ".git")):
            repos.append(path)
            return
        if depth >= max_depth:
            return
        try:
            entries = sorted(os.listdir(path))
        except OSError:
            return
        for entry in entries:
            if entry.startswith("."):
                continue
            sub = os.path.join(path, entry)
            if os.path.isdir(sub):
                walk(sub, depth + 1)

    walk(base, 0)
    return repos


def repo_label(repo_path: str) -> str:
    readme = os.path.join(repo_path, "README.md")
    if os.path.isfile(readme):
        try:
            with open(readme, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        if line.startswith("#"):
                            return line.lstrip("#").strip()
                        continue
                    return line[:80]
        except OSError:
            pass
    return os.path.basename(repo_path)


def collect_repo_commits(repo: str, author: str, start: str, end: str) -> list:
    cmd = [
        "git",
        "-C",
        repo,
        "log",
        "--all",
        f"--author={author}",
        f"--since={start}",
        f"--until={end} 23:59:59",
        "--format=%H|%ad|%s",
        "--date=format:%Y-%m-%d %H:%M",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (subprocess.TimeoutExpired, OSError) as e:
        print(f"git log failed {repo}: {e}", file=sys.stderr)
        return []
    if result.returncode != 0:
        return []
    commits = []
    for line in result.stdout.splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        commits.append({"hash": parts[0], "date": parts[1], "message": parts[2]})
    return commits


def main() -> int:
    if len(sys.argv) != 5:
        print(f"Usage: {sys.argv[0]} <repos_base_path> <author_email> <start_date> <end_date>", file=sys.stderr)
        return 2

    base = sys.argv[1]
    author = sys.argv[2]
    start = sys.argv[3]
    end = sys.argv[4]

    try:
        datetime.strptime(start, "%Y-%m-%d")
        datetime.strptime(end, "%Y-%m-%d")
    except ValueError as e:
        print(f"Invalid date: {e}", file=sys.stderr)
        return 2

    repos_found = find_repos(base, max_depth=2)
    active_repos = []

    for repo_path in repos_found:
        commits = collect_repo_commits(repo_path, author, start, end)
        if not commits:
            continue
        active_repos.append({
            "name": os.path.basename(repo_path),
            "path": repo_path,
            "label": repo_label(repo_path),
            "commits": commits,
        })

    active_repos.sort(key=lambda r: len(r["commits"]), reverse=True)
    json.dump({"repos": active_repos}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
