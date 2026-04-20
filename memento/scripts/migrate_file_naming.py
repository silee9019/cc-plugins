#!/usr/bin/env python3
"""
memento 2.7.0 파일명 규칙 통일 — 일회성 마이그레이션 도구.

Vault 내부의 기존 파일을 새 규칙으로 리네임한다. 실행은 2단계:
  1. --dry-run : 리네임 대상 목록만 출력 (파일 변경 없음)
  2. --apply   : 실제 리네임 수행

매핑:
  daily_notes_path/YYYY-MM-DD.md
      → daily_notes_path/YYYY-MM-DD-planning.md
  daily_archive_path/**/YYYY-MM-DD.md
      → daily_archive_path/**/YYYY-MM-DD-planning.md
  weekly_notes_path/**/YYYY-WWW.md
      → weekly_notes_path/**/YYYY-WWW-weekly-review.md
  {user,ontology} decisions/YYYY-MM-DD-{slug}.md
      → YYYY-MM-DD-decision-{slug}.md
  inbox_folder_path/YYYY-MM-DD/{date} (category) {title}.md
      → inbox_folder_path/YYYY-MM-DD/{date}-{category}-{title}.md
  memento_root/projects/*/memory/YYYY-MM-DD.md
      → memento_root/projects/*/memory/YYYY-MM-DD-log.md

이미 새 규칙을 따르는 파일은 건드리지 않는다(idempotent).
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


CONFIG_PATH = Path.home() / ".claude/plugins/data/memento-cc-plugins/config.md"
LOG_DIR = CONFIG_PATH.parent

DATE_ONLY_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})\.md$")
WEEK_ONLY_RE = re.compile(r"^(\d{4})-W(\d{2})\.md$")
DECISION_LEGACY_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.md$")
INBOX_LEGACY_SPACE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})\s+\(([^)]+)\)\s+(.+)\.md$"
)
INBOX_LEGACY_PLAIN_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(.+)\.md$"
)


@dataclass
class Rename:
    src: Path
    dst: Path
    reason: str

    def describe(self, vault: Path) -> str:
        try:
            s = self.src.relative_to(vault)
            d = self.dst.relative_to(vault)
        except ValueError:
            s, d = self.src, self.dst
        return f"  [{self.reason}]\n    {s}\n      → {d}"


def read_config() -> dict:
    if not CONFIG_PATH.exists():
        sys.exit(
            f"[migrate] config.md not found: {CONFIG_PATH}\n"
            f"  /memento:setup 을 먼저 실행해 config를 생성하세요."
        )
    text = CONFIG_PATH.read_text(encoding="utf-8")
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped == "---":
            continue
        m = re.match(r'^(\w+):\s*"(.*)"$', stripped)
        if m:
            values[m.group(1)] = m.group(2)
        elif ":" in stripped and not stripped.startswith(" "):
            print(f"[migrate] warning: config.md line not parsed (quotes missing?): {stripped}", file=sys.stderr)
    required = ["vault_path", "memento_root"]
    missing = [k for k in required if not values.get(k)]
    if missing:
        sys.exit(
            f"[migrate] config.md missing keys: {missing}\n"
            f"  {CONFIG_PATH} 를 수동 확인하거나 /memento:setup 재실행."
        )
    return values


_GIT_AVAILABLE: bool | None = None


def ensure_git_available() -> bool:
    global _GIT_AVAILABLE
    if _GIT_AVAILABLE is not None:
        return _GIT_AVAILABLE
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True)
        _GIT_AVAILABLE = True
    except (FileNotFoundError, subprocess.CalledProcessError):
        _GIT_AVAILABLE = False
    return _GIT_AVAILABLE


def is_git_tracked(path: Path) -> bool:
    """파일이 git 추적 대상인지 확인. `git` 바이너리가 없으면 False(호출 전 ensure_git_available로 경고 처리)."""
    if not ensure_git_available():
        return False
    result = subprocess.run(
        ["git", "-C", str(path.parent), "ls-files", "--error-unmatch", path.name],
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def slugify_title(title: str) -> str:
    """inbox slug 규칙: 한글 허용, 공백→하이픈, 특수문자 제거, 대소문자 유지."""
    # 제거 대상: 괄호, 슬래시, 콜론, 물음표, 별표, 파이프, 꺾쇠, 따옴표
    cleaned = re.sub(r'[()\\/:?*|<>"]', "", title)
    # 연속 공백을 단일 하이픈으로
    cleaned = re.sub(r"\s+", "-", cleaned.strip())
    return cleaned


def collect_daily_working(vault: Path, daily_notes_path: str) -> list[Rename]:
    """daily_notes_path 바로 하위의 YYYY-MM-DD.md → YYYY-MM-DD-planning.md."""
    out: list[Rename] = []
    base = vault / daily_notes_path
    if not base.is_dir():
        return out
    for entry in sorted(base.iterdir()):
        if not entry.is_file():
            continue
        m = DATE_ONLY_RE.match(entry.name)
        if not m:
            continue
        dst = entry.with_name(f"{m.group(1)}-{m.group(2)}-{m.group(3)}-planning.md")
        if dst.exists():
            continue
        out.append(Rename(entry, dst, "daily-working"))
    return out


def collect_daily_archive(vault: Path, archive_path: str) -> list[Rename]:
    out: list[Rename] = []
    if not archive_path:
        return out
    base = vault / archive_path
    if not base.is_dir():
        return out
    for path in base.rglob("*.md"):
        m = DATE_ONLY_RE.match(path.name)
        if not m:
            continue
        dst = path.with_name(f"{m.group(1)}-{m.group(2)}-{m.group(3)}-planning.md")
        if dst.exists():
            continue
        out.append(Rename(path, dst, "daily-archive"))
    return out


def collect_weekly(vault: Path, weekly_path: str) -> list[Rename]:
    out: list[Rename] = []
    if not weekly_path:
        return out
    base = vault / weekly_path
    if not base.is_dir():
        return out
    for path in base.rglob("*.md"):
        m = WEEK_ONLY_RE.match(path.name)
        if not m:
            continue
        dst = path.with_name(f"{m.group(1)}-W{m.group(2)}-weekly-review.md")
        if dst.exists():
            continue
        out.append(Rename(path, dst, "weekly"))
    return out


def collect_decisions(vault: Path, decisions_dir: Path, reason: str) -> list[Rename]:
    out: list[Rename] = []
    if not decisions_dir.is_dir():
        return out
    for path in sorted(decisions_dir.iterdir()):
        if not path.is_file() or not path.name.endswith(".md"):
            continue
        # skip already-migrated files
        if re.match(r"^\d{4}-\d{2}-\d{2}-decision-", path.name):
            continue
        m = DECISION_LEGACY_RE.match(path.name)
        if not m:
            continue
        date_part, rest = m.group(1), m.group(2)
        dst = path.with_name(f"{date_part}-decision-{rest}.md")
        if dst.exists():
            continue
        out.append(Rename(path, dst, reason))
    return out


def collect_inbox_tasks(vault: Path, inbox_path: str) -> list[Rename]:
    out: list[Rename] = []
    if not inbox_path:
        return out
    base = vault / inbox_path
    if not base.is_dir():
        return out
    for date_dir in sorted(base.iterdir()):
        if not date_dir.is_dir():
            continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_dir.name):
            continue
        for path in sorted(date_dir.iterdir()):
            if not path.is_file() or not path.name.endswith(".md"):
                continue
            name = path.name
            # "YYYY-MM-DD (category) title.md"
            m = INBOX_LEGACY_SPACE_RE.match(name)
            if m:
                date_part, category, title = m.group(1), m.group(2), m.group(3)
                new_name = f"{date_part}-{slugify_title(category)}-{slugify_title(title)}.md"
            else:
                # "YYYY-MM-DD category title.md" (공백 분리, 괄호 없음)
                m = INBOX_LEGACY_PLAIN_RE.match(name)
                if not m:
                    continue
                date_part, category, title = m.group(1), m.group(2), m.group(3)
                new_name = f"{date_part}-{slugify_title(category)}-{slugify_title(title)}.md"
            if new_name == name:
                continue
            dst = path.with_name(new_name)
            if dst.exists():
                continue
            out.append(Rename(path, dst, "inbox-task"))
    return out


def collect_memory_raw(vault: Path, memento_root: str) -> list[Rename]:
    out: list[Rename] = []
    projects = vault / memento_root / "projects"
    if not projects.is_dir():
        return out
    for project_dir in sorted(projects.iterdir()):
        memory = project_dir / "memory"
        if not memory.is_dir():
            continue
        for path in sorted(memory.iterdir()):
            if not path.is_file():
                continue
            m = DATE_ONLY_RE.match(path.name)
            if not m:
                continue
            dst = path.with_name(f"{m.group(1)}-{m.group(2)}-{m.group(3)}-log.md")
            if dst.exists():
                continue
            out.append(Rename(path, dst, "raw-log"))
    return out


def apply_rename(r: Rename, allow_fallback: bool) -> str:
    """실제 리네임 수행. 사용된 메서드 이름('git-mv' | 'shutil') 반환.

    git-tracked 파일에서 `git mv` 실패 시 허용 플래그 없으면 RuntimeError를 raise.
    (기본값 — 조용한 폴백은 git rename 이력 유실 위험이 있어 의도적 opt-in 필요)"""
    r.dst.parent.mkdir(parents=True, exist_ok=True)
    if is_git_tracked(r.src):
        try:
            subprocess.run(
                ["git", "-C", str(r.src.parent), "mv", r.src.name, str(r.dst)],
                check=True,
                capture_output=True,
                text=True,
            )
            return "git-mv"
        except subprocess.CalledProcessError as e:
            stderr = (e.stderr or "").strip()
            if not allow_fallback:
                raise RuntimeError(
                    f"git mv 실패 ({r.src.name} → {r.dst.name}): {stderr or e}\n"
                    f"  --force-non-git-mv 로 shutil.move 폴백을 강제할 수 있으나,\n"
                    f"  rename history가 유실되어 git blame/log 추적이 끊어질 수 있습니다."
                ) from e
            print(
                f"  [warn] git mv 실패로 shutil.move 폴백: {r.src.name} — {stderr or 'unknown error'}",
                file=sys.stderr,
            )
    shutil.move(str(r.src), str(r.dst))
    return "shutil"


def print_banner(vault: Path) -> None:
    print("=" * 72)
    print("memento 2.7.0 파일명 규칙 통일 — 마이그레이션")
    print("=" * 72)
    print(f"vault: {vault}")
    if os.environ.get("RESILIO_SYNC_PAUSED") != "1":
        print()
        print("⚠  ResilioSync가 실행 중이라면 일시 중지를 권장합니다.")
        print("   (동기화 경합을 피하기 위함 — 스크립트는 경합해도 안전하지만")
        print("    동기화 트래픽을 아끼기 위해 중지 후 실행이 나음)")
    print()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="memento 2.7.0 file-naming migration")
    parser.add_argument("--dry-run", action="store_true", help="list only, do not rename")
    parser.add_argument("--apply", action="store_true", help="perform the rename")
    parser.add_argument("--vault", help="override vault_path from config")
    parser.add_argument("--memento-root", help="override memento_root from config")
    parser.add_argument(
        "--force-non-git-mv",
        action="store_true",
        help="git mv 실패 시 shutil.move로 폴백 허용 (기본: 실패 시 중단 — rename 이력 보존 우선)",
    )
    args = parser.parse_args(argv)

    if not args.dry_run and not args.apply:
        parser.error("must specify --dry-run or --apply")

    cfg = read_config()
    vault = Path(args.vault or cfg["vault_path"])
    if not vault.is_dir():
        sys.exit(f"[migrate] vault not found: {vault}")

    memento_root = args.memento_root or cfg["memento_root"]
    daily_notes = cfg.get("daily_notes_path", "01 Working")
    daily_archive = cfg.get("daily_archive_path", "")
    weekly = cfg.get("weekly_notes_path", "")
    inbox = cfg.get("inbox_folder_path", "")

    print_banner(vault)

    if not ensure_git_available():
        print(
            "⚠  git 바이너리를 찾을 수 없습니다. 모든 파일이 shutil.move로 처리되어\n"
            "   git rename 추적이 유실됩니다. git 설치 후 재시도하거나,\n"
            "   --force-non-git-mv 플래그로 의도적으로 폴백을 허용하세요.",
            file=sys.stderr,
        )
        if args.apply and not args.force_non_git_mv:
            sys.exit(1)

    all_renames: list[Rename] = []
    all_renames += collect_daily_working(vault, daily_notes)
    all_renames += collect_daily_archive(vault, daily_archive)
    all_renames += collect_weekly(vault, weekly)
    # user decisions
    all_renames += collect_decisions(vault, vault / memento_root / "user/decisions", "user-decision")
    # ontology decisions (knowledge-tools)
    all_renames += collect_decisions(vault, vault / "12 Records/decisions", "ontology-decision")
    all_renames += collect_inbox_tasks(vault, inbox)
    all_renames += collect_memory_raw(vault, memento_root)

    if not all_renames:
        print("리네임할 대상이 없습니다. (이미 새 규칙을 따르고 있음)")
        return 0

    by_reason: dict[str, list[Rename]] = {}
    for r in all_renames:
        by_reason.setdefault(r.reason, []).append(r)

    for reason in sorted(by_reason):
        items = by_reason[reason]
        print(f"[{reason}] {len(items)}건")
        for r in items:
            print(r.describe(vault))
        print()

    total = len(all_renames)
    if args.dry_run:
        print(f"dry-run 완료. 리네임 대상 총 {total}건.")
        print("실행하려면 --apply 옵션으로 다시 실행하세요.")
        return 0

    print(f"{total}건 리네임을 실행합니다...")
    errors: list[tuple[Rename, str]] = []
    successes: list[tuple[Rename, str]] = []
    log_ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = LOG_DIR / f"migrate_log_{log_ts}.tsv"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("w", encoding="utf-8") as log_f:
        log_f.write("status\tmethod\treason\tsrc\tdst\n")
        for r in all_renames:
            try:
                method = apply_rename(r, allow_fallback=args.force_non_git_mv)
                successes.append((r, method))
                log_f.write(f"ok\t{method}\t{r.reason}\t{r.src}\t{r.dst}\n")
            except (OSError, RuntimeError) as e:
                msg = str(e).splitlines()[0]  # 첫 줄만 짧게 기록 (상세 stderr는 print로)
                errors.append((r, str(e)))
                log_f.write(f"fail\t-\t{r.reason}\t{r.src}\t{r.dst}\t{msg}\n")

    print(f"\n로그 파일: {log_path}")
    print(f"성공 {len(successes)}건 (git-mv {sum(1 for _, m in successes if m == 'git-mv')}, "
          f"shutil {sum(1 for _, m in successes if m == 'shutil')})")

    if errors:
        print(f"\n⚠  실패: {len(errors)}건")
        for r, msg in errors:
            print(f"  {r.src} → {r.dst}:")
            for line in str(msg).splitlines():
                print(f"    {line}")
        print(
            f"\n실패한 파일은 원위치에 남아있습니다. 로그({log_path.name}) 확인 후 재실행하거나,\n"
            "  --force-non-git-mv 플래그로 shutil.move 폴백을 허용할 수 있습니다 (rename 이력은 유실)."
        )
        return 1

    print("\n모든 리네임 완료.")
    print("다음 단계:")
    print("  1. vault 내 wikilink([[YYYY-MM-DD]] 등)를 수동으로 점검/갱신")
    print("     또는 별도 rewrite 스크립트로 갱신")
    print("  2. config.md의 포맷 키를 2.7.0 기본값으로 갱신")
    print("  3. qmd collection refresh (프로젝트 + user)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
