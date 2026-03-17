/**
 * memento compact — Mechanical compaction of the memory tree.
 *
 * Ported from hipocampus cli/compact.mjs.
 * Handles below-threshold cases (copy/concat) without LLM.
 * Above-threshold cases are marked needs-summarization — the agent handles those.
 *
 * Project ID resolution: same logic as init.sh (git remote + CWD fallback, lowercase).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

// ─── Project ID resolution (mirrors init.sh) ───

function resolveProjectId() {
  try {
    const remoteUrl = execSync("git remote get-url origin", { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    const match = remoteUrl.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return `${match[1]}-${match[2]}`.toLowerCase();
  } catch { /* no git remote */ }

  return process.cwd().replace(/\//g, "-").toLowerCase();
}

const PROJECT_ID = resolveProjectId();
const CWD = join(homedir(), ".claude", "memento", "projects", PROJECT_ID);
const MEMORY = join(CWD, "memory");

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
    const placeholder = `---\ntype: daily\nstatus: needs-summarization\nperiod: ${date}\nsource-files: [memory/${date}.md]\nlines: ${rawLines}\n---\n\nThis daily node exceeds ${DAILY_THRESHOLD} lines and needs LLM summarization.\nRun memento-compaction skill to generate the summary.\n`;
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
    const placeholder = `---\ntype: weekly\nstatus: needs-summarization\nperiod: ${week}\ndates: ${dates[0]} to ${dates[dates.length - 1]}\nlines: ${totalLines}\n---\n\nThis weekly node exceeds ${WEEKLY_THRESHOLD} lines and needs LLM summarization.\nRun memento-compaction skill to generate the summary.\n`;
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
    const placeholder = `---\ntype: monthly\nstatus: needs-summarization\nperiod: ${month}\nlines: ${totalLines}\n---\n\nThis monthly node exceeds ${MONTHLY_THRESHOLD} lines and needs LLM summarization.\nRun memento-compaction skill to generate the summary.\n`;
    writeFileSync(monthlyPath, placeholder);
    monthlyUpdated = true;
  }
}

// ─── Step 4: Update ROOT.md ───

if (dailyUpdated || weeklyUpdated || monthlyUpdated) {
  const rootPath = join(MEMORY, "ROOT.md");
  if (existsSync(rootPath)) {
    let rootContent = readFileSync(rootPath, "utf8");
    rootContent = rootContent.replace(/last-updated:.*/, `last-updated: ${today}`);
    writeFileSync(rootPath, rootContent);
  }

  // Re-index qmd
  try {
    execSync("qmd update", { cwd: CWD, stdio: "pipe" });
    execSync("qmd embed", { cwd: CWD, stdio: "pipe" });
  } catch {
    console.error("  [memento] qmd reindex skipped (qmd not available or failed)");
  }
}

// ─── Summary ───

const actions = [];
if (dailyUpdated) actions.push("daily nodes updated");
if (weeklyUpdated) actions.push("weekly nodes updated");
if (monthlyUpdated) actions.push("monthly nodes updated");

if (actions.length > 0) {
  console.log(`  memento compact: ${actions.join(", ")}`);
} else {
  console.log("  memento compact: nothing to do");
}
