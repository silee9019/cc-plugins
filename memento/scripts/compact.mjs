/**
 * memento compact — Mechanical compaction of the memory tree.
 *
 * Ported from hipocampus cli/compact.mjs.
 * Handles below-threshold cases (copy/concat) without LLM.
 * Above-threshold cases are marked needs-summarization — the agent handles those.
 *
 * Project ID resolution: same logic as init.sh (git remote + CWD fallback, lowercase).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

// ─── Resolve MEMENTO_HOME from config.md ───

function resolveMementoHome() {
  const configFile = join(homedir(), ".claude", "plugins", "data", "memento-cc-plugins", "config.md");
  const legacy = join(homedir(), ".claude", "memento");

  if (!existsSync(configFile)) {
    console.error("[memento] DEPRECATED: legacy path ~/.claude/memento/ will be removed in 1.8.0.");
    console.error("[memento] Run /memento:setup to migrate data into your Obsidian vault.");
    return { home: legacy, vaultPath: null };
  }

  try {
    const content = readFileSync(configFile, "utf8");
    const vaultMatch = content.match(/^vault_path:\s*"(.*)"$/m);
    const rootMatch = content.match(/^memento_root:\s*"(.*)"$/m);
    const vaultPath = vaultMatch ? vaultMatch[1] : "";
    const mementoRoot = rootMatch ? rootMatch[1] : "";

    if (vaultPath && mementoRoot && existsSync(vaultPath) && statSync(vaultPath).isDirectory()) {
      return { home: join(vaultPath, mementoRoot), vaultPath };
    }
    console.error(`[memento] config invalid, falling back to legacy path ${legacy}`);
    return { home: legacy, vaultPath: null };
  } catch (err) {
    console.error(`[memento] config read error: ${err.message}, falling back to legacy path`);
    return { home: legacy, vaultPath: null };
  }
}

const { home: MEMENTO_HOME, vaultPath: VAULT_PATH } = resolveMementoHome();

function localISOString() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const absOff = Math.abs(off);
  const hh = String(Math.floor(absOff / 60)).padStart(2, "0");
  const mm = String(absOff % 60).padStart(2, "0");
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${hh}:${mm}`;
}

// ─── Project ID resolution (mirrors session-start.sh) ───

function resolveProjectId() {
  try {
    const remoteUrl = execSync("git remote get-url origin", { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    const match = remoteUrl.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return `${match[1]}-${match[2]}`.toLowerCase();
  } catch { /* no git remote */ }

  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    return gitRoot.replace(/\//g, "-").toLowerCase();
  } catch { /* no git */ }

  // VAULT_PATH가 설정된 상태에서 cwd가 vault 하위면 .obsidian 폴백을 건너뛴다
  // (자기참조 경로 방지)
  const cwd = process.cwd();
  const skipObsidianFallback =
    VAULT_PATH && (cwd === VAULT_PATH || cwd.startsWith(VAULT_PATH + "/"));

  if (!skipObsidianFallback) {
    let dir = cwd;
    while (dir !== "/") {
      if (existsSync(join(dir, ".obsidian"))) {
        return dir.replace(/\//g, "-").toLowerCase();
      }
      dir = dirname(dir);
    }
  }

  return cwd.replace(/\//g, "-").toLowerCase();
}

const PROJECT_ID = resolveProjectId();
const CWD = join(MEMENTO_HOME, "projects", PROJECT_ID);
const MEMORY = join(CWD, "memory");
const USER_DIR = join(MEMENTO_HOME, "user");
const USER_KNOWLEDGE = join(USER_DIR, "knowledge");

// ─── Cooldown gate ───

const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3시간
const stateFile = join(MEMORY, ".compaction-state.json");
const forceMode = process.argv.includes("--force");

if (!forceMode && existsSync(stateFile)) {
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (!state.lastCompactionRun) throw new Error("missing lastCompactionRun");
    const elapsed = Date.now() - new Date(state.lastCompactionRun).getTime();
    if (elapsed < COOLDOWN_MS) {
      console.log("  memento compact: cooldown active, skipped");
      process.exit(0);
    }
  } catch (err) {
    console.error(`  [memento] compaction state unreadable, proceeding: ${err.message}`);
  }
}

const DAILY_THRESHOLD = 200;
const WEEKLY_THRESHOLD = 300;
const MONTHLY_THRESHOLD = 500;

// Use local date to match the user's calendar day
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// ─── Helpers ───

const countLines = (filePath) => {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, "utf8").split("\n").length;
};

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const listRawDates = () => {
  if (!existsSync(MEMORY)) return [];
  return readdirSync(MEMORY)
    .filter(f => DATE_RE.test(f))
    .map(f => f.match(DATE_RE)[1])
    .sort();
};

const isoWeek = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

const daysSince = (dateStr) => {
  const then = new Date(dateStr + "T00:00:00Z");
  const nowDate = new Date(today + "T00:00:00Z");
  return Math.floor((nowDate - then) / 86400000);
};

// ─── Step 1: Raw → Daily ───

const dailyDir = join(MEMORY, "daily");
mkdirSync(dailyDir, { recursive: true });

const rawDates = listRawDates();
let dailyUpdated = false;

for (const date of rawDates) {
  const rawPath = join(MEMORY, `${date}.md`);
  const dailyPath = join(dailyDir, `${date}.md`);
  const isToday = date === today;
  const status = isToday ? "tentative" : "fixed";

  if (existsSync(dailyPath)) {
    const existing = readFileSync(dailyPath, "utf8");
    if (existing.includes("status: fixed")) continue;
  }

  const rawLines = countLines(rawPath);
  if (rawLines === 0) continue;

  if (rawLines <= DAILY_THRESHOLD) {
    const rawContent = readFileSync(rawPath, "utf8");
    const frontmatter = `---\ntype: daily\nstatus: ${status}\nperiod: ${date}\nsource-files: [memory/${date}.md]\ntopics: []\n---\n\n`;
    writeFileSync(dailyPath, frontmatter + rawContent);
    dailyUpdated = true;
  } else if (!existsSync(dailyPath) || isToday) {
    const placeholder = `---\ntype: daily\nstatus: needs-summarization\nperiod: ${date}\nsource-files: [memory/${date}.md]\nlines: ${rawLines}\n---\n\nThis daily node exceeds ${DAILY_THRESHOLD} lines and needs LLM summarization.\nRun rebuild-memory-tree skill to generate the summary.\n`;
    writeFileSync(dailyPath, placeholder);
    dailyUpdated = true;
  }
}

// ─── Step 2: Daily → Weekly ───

const weeklyDir = join(MEMORY, "weekly");
mkdirSync(weeklyDir, { recursive: true });

const dailyFiles = existsSync(dailyDir)
  ? readdirSync(dailyDir).filter(f => DATE_RE.test(f)).map(f => f.match(DATE_RE)[1]).sort()
  : [];

const weekGroups = {};
for (const date of dailyFiles) {
  const week = isoWeek(date);
  if (!weekGroups[week]) weekGroups[week] = [];
  weekGroups[week].push(date);
}

let weeklyUpdated = false;

for (const [week, dates] of Object.entries(weekGroups)) {
  const weeklyPath = join(weeklyDir, `${week}.md`);

  const allPast = dates.every(d => d < today);
  const oldestDate = dates[0];
  const isFixed = allPast && daysSince(oldestDate) >= 7;
  const status = isFixed ? "fixed" : "tentative";

  if (existsSync(weeklyPath)) {
    const existing = readFileSync(weeklyPath, "utf8");
    if (existing.includes("status: fixed")) continue;
  }

  let combined = "";
  let totalLines = 0;
  for (const date of dates) {
    const dailyPath = join(dailyDir, `${date}.md`);
    if (existsSync(dailyPath)) {
      const content = readFileSync(dailyPath, "utf8");
      if (content.includes("needs-summarization")) continue;
      combined += `\n\n# ${date}\n\n` + content;
      totalLines += countLines(dailyPath);
    }
  }

  if (totalLines === 0) continue;

  if (totalLines <= WEEKLY_THRESHOLD) {
    const frontmatter = `---\ntype: weekly\nstatus: ${status}\nperiod: ${week}\ndates: ${dates[0]} to ${dates[dates.length - 1]}\nsource-files: [${dates.map(d => `memory/daily/${d}.md`).join(", ")}]\ntopics: []\n---\n`;
    writeFileSync(weeklyPath, frontmatter + combined);
    weeklyUpdated = true;
  } else if (!existsSync(weeklyPath) || status === "tentative") {
    const placeholder = `---\ntype: weekly\nstatus: needs-summarization\nperiod: ${week}\ndates: ${dates[0]} to ${dates[dates.length - 1]}\nlines: ${totalLines}\n---\n\nThis weekly node exceeds ${WEEKLY_THRESHOLD} lines and needs LLM summarization.\nRun rebuild-memory-tree skill to generate the summary.\n`;
    writeFileSync(weeklyPath, placeholder);
    weeklyUpdated = true;
  }
}

// ─── Step 3: Weekly → Monthly ───

const monthlyDir = join(MEMORY, "monthly");
mkdirSync(monthlyDir, { recursive: true });

const WEEK_RE = /^(\d{4}-W\d{2})\.md$/;
const weeklyFiles = existsSync(weeklyDir)
  ? readdirSync(weeklyDir).filter(f => WEEK_RE.test(f)).map(f => f.match(WEEK_RE)[1]).sort()
  : [];

const monthGroups = {};
for (const week of weeklyFiles) {
  const [yearStr, weekNumStr] = week.split("-W");
  const year = parseInt(yearStr);
  const weekNum = parseInt(weekNumStr);
  const approxDate = new Date(Date.UTC(year, 0, 1 + (weekNum - 1) * 7));
  const month = `${year}-${String(approxDate.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!monthGroups[month]) monthGroups[month] = [];
  monthGroups[month].push(week);
}

let monthlyUpdated = false;

for (const [month, weeks] of Object.entries(monthGroups)) {
  const monthlyPath = join(monthlyDir, `${month}.md`);

  const monthEnd = new Date(Date.UTC(parseInt(month.slice(0, 4)), parseInt(month.slice(5)), 0));
  const monthEndStr = monthEnd.toISOString().slice(0, 10);
  const isFixed = daysSince(monthEndStr) >= 7;
  const status = isFixed ? "fixed" : "tentative";

  if (existsSync(monthlyPath)) {
    const existing = readFileSync(monthlyPath, "utf8");
    if (existing.includes("status: fixed")) continue;
  }

  let combined = "";
  let totalLines = 0;
  for (const week of weeks) {
    const weeklyPath = join(weeklyDir, `${week}.md`);
    if (existsSync(weeklyPath)) {
      const content = readFileSync(weeklyPath, "utf8");
      if (content.includes("needs-summarization")) continue;
      combined += `\n\n# ${week}\n\n` + content;
      totalLines += countLines(weeklyPath);
    }
  }

  if (totalLines === 0) continue;

  if (totalLines <= MONTHLY_THRESHOLD) {
    const frontmatter = `---\ntype: monthly\nstatus: ${status}\nperiod: ${month}\nweeks: [${weeks.join(", ")}]\nsource-files: [${weeks.map(w => `memory/weekly/${w}.md`).join(", ")}]\ntopics: []\n---\n`;
    writeFileSync(monthlyPath, frontmatter + combined);
    monthlyUpdated = true;
  } else if (!existsSync(monthlyPath) || status === "tentative") {
    const placeholder = `---\ntype: monthly\nstatus: needs-summarization\nperiod: ${month}\nlines: ${totalLines}\n---\n\nThis monthly node exceeds ${MONTHLY_THRESHOLD} lines and needs LLM summarization.\nRun rebuild-memory-tree skill to generate the summary.\n`;
    writeFileSync(monthlyPath, placeholder);
    monthlyUpdated = true;
  }
}

// ─── qmd resolution (shared by project + user reindex) ───

const qmdBin = (() => {
  try {
    return execSync("mise which qmd", { stdio: "pipe", encoding: "utf8" }).trim();
  } catch (e) {
    console.error(`  [memento] qmd path lookup skipped: ${e.message?.split("\n")[0] ?? "unknown"}`);
    return null;
  }
})();
const qmdCmd = qmdBin || "qmd";
const QMD_TIMEOUT_MS = 30_000;
const qmdFailures = [];

const qmdEnv = { ...process.env };
delete qmdEnv.BUN_INSTALL;

// ─── Step 4: Update ROOT.md ───

if (dailyUpdated || weeklyUpdated || monthlyUpdated) {
  const rootPath = join(MEMORY, "ROOT.md");
  if (existsSync(rootPath)) {
    let rootContent = readFileSync(rootPath, "utf8");
    rootContent = rootContent.replace(/last-updated:.*/, `last-updated: ${today}`);
    writeFileSync(rootPath, rootContent);
  }

  // Re-index project qmd
  try {
    execSync(`${qmdCmd} update`, { cwd: CWD, stdio: "pipe", timeout: QMD_TIMEOUT_MS, env: qmdEnv });
  } catch (e) {
    const reason = e.killed ? `timeout (${QMD_TIMEOUT_MS / 1000}s)` : (e.message?.split("\n")[0] ?? "unknown");
    qmdFailures.push(`update: ${reason}`);
  }
  try {
    execSync(`${qmdCmd} embed`, { cwd: CWD, stdio: "pipe", timeout: QMD_TIMEOUT_MS, env: qmdEnv });
  } catch (e) {
    const reason = e.killed ? `timeout (${QMD_TIMEOUT_MS / 1000}s)` : (e.message?.split("\n")[0] ?? "unknown");
    qmdFailures.push(`embed: ${reason}`);
  }
}

// ─── Step 5: User Scope — regenerate user/ROOT.md from knowledge files ───

let userUpdated = false;

if (existsSync(USER_KNOWLEDGE)) {
  const knowledgeFiles = readdirSync(USER_KNOWLEDGE)
    .filter(f => f.endsWith(".md"))
    .sort();

  const entries = [];
  for (const file of knowledgeFiles) {
    const content = readFileSync(join(USER_KNOWLEDGE, file), "utf8");
    const titleMatch = content.match(/^title:\s*(.+)$/m);
    const sourceMatch = content.match(/^source-project:\s*(.+)$/m);
    const createdMatch = content.match(/^created:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, "");
    const source = sourceMatch ? sourceMatch[1].trim() : "unknown";
    const created = createdMatch ? createdMatch[1].trim() : "unknown";
    entries.push(`- ${file.replace(/\.md$/, "")}: ${title} (${source}, ${created})`);
  }

  const indexBody = entries.length > 0 ? entries.join("\n") : "(no entries yet)";
  const userRoot = [
    "---",
    "type: user-root",
    `last-updated: ${today}`,
    `entries: ${knowledgeFiles.length}`,
    "---",
    "",
    "## Knowledge Index",
    indexBody,
    "",
  ].join("\n");

  const userRootPath = join(USER_DIR, "ROOT.md");
  const existing = existsSync(userRootPath)
    ? readFileSync(userRootPath, "utf8")
    : "";
  if (existing !== userRoot) {
    writeFileSync(userRootPath, userRoot);
    userUpdated = true;
  }
}

// Re-index user qmd
if (userUpdated && existsSync(USER_DIR)) {
  try {
    execSync(`${qmdCmd} update`, { cwd: USER_DIR, stdio: "pipe", timeout: QMD_TIMEOUT_MS, env: qmdEnv });
  } catch (e) {
    const reason = e.killed ? `timeout (${QMD_TIMEOUT_MS / 1000}s)` : (e.message?.split("\n")[0] ?? "unknown");
    qmdFailures.push(`user-update: ${reason}`);
  }
  try {
    execSync(`${qmdCmd} embed`, { cwd: USER_DIR, stdio: "pipe", timeout: QMD_TIMEOUT_MS, env: qmdEnv });
  } catch (e) {
    const reason = e.killed ? `timeout (${QMD_TIMEOUT_MS / 1000}s)` : (e.message?.split("\n")[0] ?? "unknown");
    qmdFailures.push(`user-embed: ${reason}`);
  }
}

if (qmdFailures.length > 0) {
  console.error(`\n  ⚠️  [memento] qmd FAILED — 검색 인덱스가 갱신되지 않았습니다!`);
  for (const f of qmdFailures) console.error(`    - ${f}`);
  console.error(`    수동 실행: cd ${CWD} && ${qmdCmd} update && ${qmdCmd} embed\n`);
}

// ─── Summary ───

const actions = [];
if (dailyUpdated) actions.push("daily nodes updated");
if (weeklyUpdated) actions.push("weekly nodes updated");
if (monthlyUpdated) actions.push("monthly nodes updated");
if (userUpdated) actions.push("user knowledge index updated");

// ─── Step 8: Prune empty projects ───

const projectsDir = join(homedir(), ".claude", "memento", "projects");
let pruned = 0;
if (existsSync(projectsDir)) {
  for (const name of readdirSync(projectsDir)) {
    if (name === PROJECT_ID) continue;
    const dir = join(projectsDir, name);
    const memDir = join(dir, "memory");
    const rawLogs = existsSync(memDir)
      ? readdirSync(memDir).filter(f => DATE_RE.test(f))
      : [];
    const workingLines = countLines(join(dir, "WORKING.md"));
    const knowledgeFiles = existsSync(join(dir, "knowledge"))
      ? readdirSync(join(dir, "knowledge")).filter(f => f.endsWith(".md"))
      : [];
    if (rawLogs.length === 0 && workingLines <= 10 && knowledgeFiles.length === 0) {
      rmSync(dir, { recursive: true, force: true });
      pruned++;
    }
  }
}

// ─── Summary ───

if (pruned > 0) actions.push(`${pruned} empty projects pruned`);

if (actions.length > 0) {
  console.log(`  memento compact: ${actions.join(", ")}`);
} else {
  console.log("  memento compact: nothing to do");
}

// ─── Update cooldown timestamp (after successful compaction) ───

try {
  writeFileSync(stateFile, JSON.stringify({ lastCompactionRun: localISOString() }));
} catch (err) {
  console.error(`  [memento] failed to write compaction state: ${err.message}`);
}

// qmd 실패 시 exit code 0 유지 (compact 자체는 성공) — 경고는 stderr로 출력됨
