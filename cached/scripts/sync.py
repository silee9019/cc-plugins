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
CACHE_VERSION = 3
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
        if meta.get("version") == 2:
            return _migrate_v2_to_v3(meta)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return {"version": CACHE_VERSION, "items": {}}


def save_metadata(meta: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(json.dumps(meta))


# ─── v2 → v3 Migration ──────────────────────────────────────────────────────


def _migrate_v2_to_v3(old_meta: dict) -> dict:
    """Migrate v2 (project-centric, content-storing) to v3 (item-centric, index-only)."""
    new_meta: dict = {"version": CACHE_VERSION, "items": {}}

    # Collect best item per name (most recent cachedAt wins)
    best: dict[str, dict] = {}
    for phash, entry in old_meta.get("projects", {}).items():
        cached_at = entry.get("cachedAt", 0)
        project_path = entry.get("path", "")
        for item_type, items_key in [("skill", "skills"), ("command", "commands")]:
            for item in entry.get(items_key, []):
                key = f"{item_type}::{item['name']}"
                if key not in best or cached_at > best[key]["cachedAt"]:
                    best[key] = {
                        "key": key,
                        "type": item_type,
                        "name": item["name"],
                        "content": item["content"],
                        "projectPath": project_path,
                        "projectHash": phash,
                        "cachedAt": cached_at,
                    }

    # Clean legacy physical files
    for subdir in ("skills", "commands"):
        d = PLUGIN_ROOT / subdir
        if d.is_dir():
            for entry in d.iterdir():
                if entry.is_dir() and not entry.name.startswith("."):
                    shutil.rmtree(entry, ignore_errors=True)

    # Write physical files from v2 content and build v3 metadata
    for info in best.values():
        physical_path = _write_from_content(
            info["content"], info["projectHash"], info["name"], info["type"]
        )
        new_meta["items"][info["key"]] = {
            "type": info["type"],
            "name": info["name"],
            "sourceProject": info["projectPath"],
            "projectHash": info["projectHash"],
            "sourcePath": "",
            "sourceMtime": info["cachedAt"] / 1000,
            "cachedAt": info["cachedAt"],
            "physicalPath": physical_path,
        }

    return new_meta


def _write_from_content(content: str, phash: str, name: str, item_type: str) -> str:
    """Write physical file from raw content (v2 migration only)."""
    data, body = parse_frontmatter(content)
    data.pop("model", None)
    if item_type == "skill":
        rel_path = f"skills/{phash}_{name}/SKILL.md"
    else:
        rel_path = f"commands/{phash}/{name}.md"
    abs_path = PLUGIN_ROOT / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(stringify_frontmatter(data, body), encoding="utf-8")
    return rel_path


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
        if resolved.is_dir():
            skill_md = resolved / "SKILL.md"
            if not skill_md.exists():
                skill_md = resolved / f"{entry.name}.md"
            if skill_md.exists():
                try:
                    data, _ = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
                    skills.append(
                        {
                            "name": data.get("name", entry.name),
                            "sourcePath": str(skill_md),
                            "sourceProject": project_path,
                            "projectHash": phash,
                            "sourceMtime": skill_md.stat().st_mtime,
                        }
                    )
                except OSError:
                    pass
        elif entry.suffix == ".md" and entry.is_file():
            try:
                data, _ = parse_frontmatter(entry.read_text(encoding="utf-8"))
                skills.append(
                    {
                        "name": data.get("name", entry.stem),
                        "sourcePath": str(entry),
                        "sourceProject": project_path,
                        "projectHash": phash,
                        "sourceMtime": entry.stat().st_mtime,
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
            cmd_name = f"{prefix}:{entry.stem}" if prefix else entry.stem
            try:
                commands.append(
                    {
                        "name": cmd_name,
                        "sourcePath": str(entry),
                        "sourceProject": project_path,
                        "projectHash": phash,
                        "sourceMtime": entry.stat().st_mtime,
                    }
                )
            except OSError:
                pass
    return commands


# ─── Writer ───────────────────────────────────────────────────────────────────


def write_skill(source_path: str, phash: str, name: str) -> str:
    """Read source file and write cached physical file. Returns relative path."""
    content = Path(source_path).read_text(encoding="utf-8")
    data, body = parse_frontmatter(content)
    data.pop("model", None)
    rel_path = f"skills/{phash}_{name}/SKILL.md"
    abs_path = PLUGIN_ROOT / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(stringify_frontmatter(data, body), encoding="utf-8")
    return rel_path


def write_command(source_path: str, phash: str, name: str) -> str:
    """Read source file and write cached physical file. Returns relative path."""
    content = Path(source_path).read_text(encoding="utf-8")
    data, body = parse_frontmatter(content)
    data.pop("model", None)
    rel_path = f"commands/{phash}/{name}.md"
    abs_path = PLUGIN_ROOT / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(stringify_frontmatter(data, body), encoding="utf-8")
    return rel_path


# ─── Cleanup ──────────────────────────────────────────────────────────────────


def delete_physical(physical_path: str) -> None:
    """Delete a single cached physical file and its empty parent directory."""
    abs_path = PLUGIN_ROOT / physical_path
    if abs_path.exists():
        abs_path.unlink()
    parent = abs_path.parent
    if parent.exists() and parent != PLUGIN_ROOT:
        remaining = [f for f in parent.iterdir() if f.name != ".gitkeep"]
        if not remaining:
            shutil.rmtree(parent, ignore_errors=True)


def purge_expired(meta: dict, ttl: int) -> dict:
    """Remove items older than TTL from metadata and delete their physical files."""
    now = int(time.time() * 1000)
    valid = {}
    for key, entry in meta.get("items", {}).items():
        if now - entry.get("cachedAt", 0) <= ttl:
            valid[key] = entry
        else:
            delete_physical(entry.get("physicalPath", ""))
    return {**meta, "items": valid}


def cleanup_orphans(meta: dict) -> dict:
    """Remove metadata entries whose physical files no longer exist."""
    valid = {}
    for key, entry in meta.get("items", {}).items():
        abs_path = PLUGIN_ROOT / entry.get("physicalPath", "")
        if abs_path.exists():
            valid[key] = entry
    return {**meta, "items": valid}


def cleanup_orphan_files(meta: dict) -> None:
    """Remove physical files not tracked in metadata (reverse orphan cleanup)."""
    tracked = {entry["physicalPath"] for entry in meta.get("items", {}).values()}
    for subdir in ("skills", "commands"):
        d = PLUGIN_ROOT / subdir
        if not d.is_dir():
            continue
        for entry in d.iterdir():
            if entry.name.startswith(".") or not entry.is_dir():
                continue
            entry_rel = f"{subdir}/{entry.name}/"
            if not any(p.startswith(entry_rel) for p in tracked):
                shutil.rmtree(entry, ignore_errors=True)


# ─── Sync ────────────────────────────────────────────────────────────────────


def sync_item(meta: dict, item: dict, item_type: str) -> str:
    """Sync a single scanned item against metadata. Returns action taken.

    Actions: "created", "replaced", "skipped"
    """
    key = f"{item_type}::{item['name']}"
    existing = meta["items"].get(key)

    if existing:
        if item["sourceMtime"] > existing["sourceMtime"]:
            delete_physical(existing["physicalPath"])
            physical_path = _write_item(item, item_type)
            meta["items"][key] = _make_entry(item, item_type, physical_path)
            return "replaced"
        return "skipped"

    physical_path = _write_item(item, item_type)
    meta["items"][key] = _make_entry(item, item_type, physical_path)
    return "created"


def _write_item(item: dict, item_type: str) -> str:
    if item_type == "skill":
        return write_skill(item["sourcePath"], item["projectHash"], item["name"])
    return write_command(item["sourcePath"], item["projectHash"], item["name"])


def _make_entry(item: dict, item_type: str, physical_path: str) -> dict:
    return {
        "type": item_type,
        "name": item["name"],
        "sourceProject": item["sourceProject"],
        "projectHash": item["projectHash"],
        "sourcePath": item["sourcePath"],
        "sourceMtime": item["sourceMtime"],
        "cachedAt": int(time.time() * 1000),
        "physicalPath": physical_path,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    start = time.time()
    config = load_config()
    meta = load_metadata()
    cwd = os.getcwd()
    phash = project_hash(cwd)

    # 1. Scan current project (metadata only, no content stored)
    skills = scan_skills(cwd, phash)
    commands = scan_commands(cwd, phash)

    # 2. Incremental sync: compare → create/replace/skip
    created = replaced = skipped = 0
    for s in skills:
        action = sync_item(meta, s, "skill")
        if action == "created":
            created += 1
        elif action == "replaced":
            replaced += 1
        else:
            skipped += 1
    for c in commands:
        action = sync_item(meta, c, "command")
        if action == "created":
            created += 1
        elif action == "replaced":
            replaced += 1
        else:
            skipped += 1

    # 3. Purge stale entries (TTL expired)
    before = len(meta.get("items", {}))
    meta = purge_expired(meta, config.get("cacheTTL", CACHE_TTL_MS))
    purged = before - len(meta["items"])

    # 4. Clean orphaned entries (physical file missing → remove from metadata)
    meta = cleanup_orphans(meta)

    # 5. Clean orphan files (not tracked in metadata → remove from disk)
    cleanup_orphan_files(meta)

    # 6. Save
    save_metadata(meta)

    duration = int((time.time() - start) * 1000)
    total = len(meta["items"])
    print(
        f"[skill-cache] {total} items cached"
        f" (+{created} ~{replaced} -{purged})"
        f" ({duration}ms)"
    )


if __name__ == "__main__":
    main()
