#!/usr/bin/env python3
"""Cross-project skill/command cache sync for Claude Code plugins."""

import hashlib
import json
import os
import re
import shutil
import time
from pathlib import Path

# ─── Constants ────────────────────────────────────────────────────────────────

CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000  # 3 days
CACHE_VERSION = 2
FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n?---\r?\n(.*)", re.DOTALL)


# ─── Frontmatter ──────────────────────────────────────────────────────────────


def parse_frontmatter(content: str) -> tuple[dict, str]:
    m = FRONTMATTER_RE.match(content)
    if not m:
        return {}, content
    data = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        colon = line.find(":")
        if colon < 0:
            continue
        key = line[:colon].strip()
        val = line[colon + 1 :].strip()
        # strip surrounding quotes
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        # type coercion
        if val.lower() == "true":
            data[key] = True
        elif val.lower() == "false":
            data[key] = False
        else:
            try:
                data[key] = int(val)
            except ValueError:
                try:
                    data[key] = float(val)
                except ValueError:
                    data[key] = val
    return data, m.group(2)


def stringify_frontmatter(data: dict, body: str) -> str:
    clean = {k: v for k, v in data.items() if v is not None}
    if not clean:
        return body
    lines = []
    for k, v in clean.items():
        if isinstance(v, bool):
            lines.append(f"{k}: {str(v).lower()}")
        elif isinstance(v, str):
            lines.append(f'{k}: "{v}"')
        else:
            lines.append(f"{k}: {v}")
    return "---\n" + "\n".join(lines) + "\n---\n" + body


# ─── Paths ────────────────────────────────────────────────────────────────────

PLUGIN_ROOT = Path(os.environ.get("CLAUDE_PLUGIN_ROOT", os.getcwd()))
CACHE_DIR = PLUGIN_ROOT / ".cache"
CONFIG_PATH = CACHE_DIR / "config.json"
METADATA_PATH = CACHE_DIR / "metadata.json"


def project_hash(project_dir: str) -> str:
    return hashlib.sha256(project_dir.encode()).hexdigest()[:6]


# ─── Config / Metadata ───────────────────────────────────────────────────────


def load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cfg = {"cacheTTL": CACHE_TTL_MS}
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
        return cfg


def load_metadata() -> dict:
    try:
        meta = json.loads(METADATA_PATH.read_text())
        if meta.get("version") == CACHE_VERSION:
            return meta
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return {"version": CACHE_VERSION, "projects": {}}


def save_metadata(meta: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(json.dumps(meta))


# ─── Scanner ──────────────────────────────────────────────────────────────────


def scan_skills(project_path: str, phash: str) -> list[dict]:
    skills_dir = Path(project_path) / ".claude" / "skills"
    if not skills_dir.is_dir():
        return []
    skills = []
    for entry in sorted(skills_dir.iterdir()):
        if entry.name.startswith("."):
            continue
        resolved = entry.resolve() if entry.is_symlink() else entry
        # Directory: SKILL.md or <dirname>.md
        if resolved.is_dir():
            skill_md = resolved / "SKILL.md"
            if not skill_md.exists():
                skill_md = resolved / f"{entry.name}.md"
            if skill_md.exists():
                try:
                    content = skill_md.read_text(encoding="utf-8")
                    data, _ = parse_frontmatter(content)
                    skills.append(
                        {
                            "name": data.get("name", entry.name),
                            "path": str(skill_md),
                            "projectPath": project_path,
                            "projectHash": phash,
                            "content": content,
                        }
                    )
                except OSError:
                    pass
        # Standalone .md file
        elif entry.suffix == ".md" and entry.is_file():
            try:
                content = entry.read_text(encoding="utf-8")
                data, _ = parse_frontmatter(content)
                name = data.get("name", entry.stem)
                skills.append(
                    {
                        "name": name,
                        "path": str(entry),
                        "projectPath": project_path,
                        "projectHash": phash,
                        "content": content,
                    }
                )
            except OSError:
                pass
    return skills


def scan_commands(project_path: str, phash: str) -> list[dict]:
    commands_dir = Path(project_path) / ".claude" / "commands"
    if not commands_dir.is_dir():
        return []
    return _scan_commands_recursive(commands_dir, project_path, phash, set(), "")


def _scan_commands_recursive(
    dir_path: Path, project_path: str, phash: str, visited: set, prefix: str
) -> list[dict]:
    try:
        real = dir_path.resolve()
    except OSError:
        return []
    if str(real) in visited:
        return []
    visited.add(str(real))
    commands = []
    try:
        entries = sorted(dir_path.iterdir())
    except OSError:
        return []
    for entry in entries:
        if entry.is_dir():
            if entry.name.startswith("."):
                continue
            sub_prefix = f"{prefix}:{entry.name}" if prefix else entry.name
            commands.extend(
                _scan_commands_recursive(entry, project_path, phash, visited, sub_prefix)
            )
        elif entry.suffix == ".md" and entry.is_file():
            base_name = entry.stem
            cmd_name = f"{prefix}:{base_name}" if prefix else base_name
            try:
                content = entry.read_text(encoding="utf-8")
                commands.append(
                    {
                        "name": cmd_name,
                        "path": str(entry),
                        "projectPath": project_path,
                        "projectHash": phash,
                        "content": content,
                    }
                )
            except OSError:
                pass
    return commands


# ─── Writer ───────────────────────────────────────────────────────────────────


def write_skill(skill: dict) -> None:
    skill_dir = PLUGIN_ROOT / "skills" / f"{skill['projectHash']}_{skill['name']}"
    skill_dir.mkdir(parents=True, exist_ok=True)
    data, body = parse_frontmatter(skill["content"])
    desc = data.get("description", "")
    data["name"] = skill["name"]
    data["description"] = f"[{skill['projectPath']}] {desc}" if desc else f"[{skill['projectPath']}]"
    data.pop("model", None)
    (skill_dir / "SKILL.md").write_text(stringify_frontmatter(data, body), encoding="utf-8")


def write_command(cmd: dict) -> None:
    cmd_dir = PLUGIN_ROOT / "commands" / cmd["projectHash"]
    cmd_dir.mkdir(parents=True, exist_ok=True)
    data, body = parse_frontmatter(cmd["content"])
    desc = data.get("description", "")
    data["description"] = f"[{cmd['projectPath']}] {desc}" if desc else f"[{cmd['projectPath']}]"
    data.pop("model", None)
    (cmd_dir / f"{cmd['name']}.md").write_text(stringify_frontmatter(data, body), encoding="utf-8")


# ─── Cleanup ──────────────────────────────────────────────────────────────────


def cleanup_project_files(phash: str) -> None:
    skills_dir = PLUGIN_ROOT / "skills"
    if skills_dir.is_dir():
        for d in skills_dir.iterdir():
            if d.is_dir() and d.name.startswith(f"{phash}_"):
                shutil.rmtree(d, ignore_errors=True)
    cmd_dir = PLUGIN_ROOT / "commands" / phash
    if cmd_dir.is_dir():
        shutil.rmtree(cmd_dir, ignore_errors=True)


def purge_expired(meta: dict, ttl: int) -> dict:
    now = int(time.time() * 1000)
    valid = {}
    for h, entry in meta.get("projects", {}).items():
        if now - entry.get("cachedAt", 0) <= ttl:
            valid[h] = entry
        else:
            cleanup_project_files(h)
    return {**meta, "projects": valid}


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    start = time.time()
    config = load_config()
    meta = load_metadata()
    cwd = os.getcwd()
    phash = project_hash(cwd)

    # Scan
    skills = scan_skills(cwd, phash)
    commands = scan_commands(cwd, phash)

    scanned = False
    if skills or commands:
        cleanup_project_files(phash)
        for s in skills:
            write_skill(s)
        for c in commands:
            write_command(c)
        meta["projects"][phash] = {
            "path": cwd,
            "cachedAt": int(time.time() * 1000),
            "skills": [{"name": s["name"], "content": s["content"]} for s in skills],
            "commands": [{"name": c["name"], "content": c["content"]} for c in commands],
        }
        scanned = True

    # Purge
    meta = purge_expired(meta, config.get("cacheTTL", CACHE_TTL_MS))
    save_metadata(meta)

    if scanned:
        duration = int((time.time() - start) * 1000)
        print(f"[skill-cache] cached {len(skills)} skills, {len(commands)} commands ({duration}ms)")


if __name__ == "__main__":
    main()
