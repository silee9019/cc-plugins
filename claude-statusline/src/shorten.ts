import { existsSync } from "fs";
import { basename, dirname } from "path";
import { ANSI } from "./types.js";

type ColorMode = "ansi" | "plain";

function color(mode: ColorMode) {
  if (mode === "plain") return { reset: "", dim: "", blue: "" };
  return { reset: ANSI.reset, dim: ANSI.dim, blue: ANSI.blue };
}

// 경로에서 상위로 탐색하며 모든 git repo명 수집
function collectGitRepos(fullPath: string, home: string): string[] {
  const repos: string[] = [];
  let check = fullPath;
  while (check !== "/" && check !== home) {
    if (existsSync(`${check}/.git`)) {
      repos.push(basename(check));
    }
    check = dirname(check);
  }
  return repos;
}

/**
 * 경로 축약
 * Rules:
 *   1. HOME → ~
 *   2. 절대경로(HOME 밖) → 상위 2폴더
 *   3. 모든 git repo명 보존
 *   4. 현재 폴더 보존
 *   5. 갭 → ↪N
 * Colors (ansi): git repo / 현재폴더 = blue, 나머지 = dim
 */
export function shortenPath(fullPath: string, mode: ColorMode = "ansi"): string {
  const c = color(mode);
  const home = process.env.HOME ?? "";
  let isHomePath = false;
  let displayPath = fullPath;

  if (home && fullPath.startsWith(home)) {
    displayPath = "~" + fullPath.slice(home.length);
    isHomePath = true;
  }

  const gitRepos = collectGitRepos(fullPath, home);
  const parts = displayPath.split("/");
  const total = parts.length;

  if (total <= 3) {
    return `${c.dim}${displayPath}${c.reset}`;
  }

  // 표시할 인덱스 결정
  const showSet = new Set<number>();
  if (isHomePath) {
    showSet.add(0); // ~
  } else {
    showSet.add(0); // empty string
    showSet.add(1); // first folder
  }
  showSet.add(total - 1); // current folder

  for (let i = 0; i < total; i++) {
    if (gitRepos.includes(parts[i])) showSet.add(i);
  }

  const sorted = [...showSet].sort((a, b) => a - b);

  // 조립
  const result: string[] = [];
  let prevShown = -1;

  for (const idx of sorted) {
    const p = parts[idx];
    if (p === "") {
      prevShown = idx;
      continue;
    }

    if (idx - prevShown > 1) {
      const skipped = idx - prevShown - 1;
      result.push(`${c.dim}↪${skipped}${c.reset}`);
    }

    const isGitRepo = gitRepos.includes(p);
    const isCurrent = idx === total - 1;
    if (isGitRepo || isCurrent) {
      result.push(`${c.blue}${p}${c.reset}`);
    } else {
      result.push(`${c.dim}${p}${c.reset}`);
    }
    prevShown = idx;
  }

  const joined = result.join(`${c.dim}/${c.reset}`);

  // 절대경로(~ 아닌)인 경우 / 접두사
  if (!isHomePath && parts[0] === "") {
    return `${c.dim}/${c.reset}${joined}`;
  }
  return joined;
}

/**
 * 브랜치명 축약
 * Pattern: {prefix/}{TICKET-ID-}{slug}
 * Slug: == 4단어 → first-↪N-last, > 4단어 → first2-↪N-last2
 */
export function shortenBranch(branch: string): string {
  const maxWords = 4;
  let prefix = "";
  let ticket = "";
  let slug = branch;

  const prefixMatch = branch.match(/^(feature|hotfix|bugfix|release|change)\//);
  if (prefixMatch) {
    prefix = prefixMatch[0];
    const rest = branch.slice(prefix.length);

    const ticketMatch = rest.match(/^([A-Z]+-[0-9]+-)(.+)$/);
    if (ticketMatch) {
      ticket = ticketMatch[1];
      slug = ticketMatch[2];
    } else {
      slug = rest;
    }
  }

  const words = slug.split("-");
  const count = words.length;

  if (count === maxWords) {
    const skipped = count - 2;
    slug = `${words[0]}-↪${skipped}-${words[count - 1]}`;
  } else if (count > maxWords) {
    const skipped = count - 4;
    slug = `${words[0]}-${words[1]}-↪${skipped}-${words[count - 2]}-${words[count - 1]}`;
  }

  return `${prefix}${ticket}${slug}`;
}
