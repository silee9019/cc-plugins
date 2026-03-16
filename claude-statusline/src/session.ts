import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { getGitBranch } from "./git.js";
import { type SessionState, isValidSession } from "./types.js";

function getDataDir(): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/src", "");
  const dir = join(pluginRoot, "data", "sessions");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionPath(sessionId: string): string {
  return join(getDataDir(), `${sessionId}.json`);
}

export function loadSession(sessionId: string): SessionState | null {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (!isValidSession(data)) {
      console.error(`[claude-statusline] invalid session schema: ${path}`);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`[claude-statusline] session load failed (${path}): ${(err as Error).message}`);
    return null;
  }
}

// Atomic write: tmp → rename
export function saveSession(state: SessionState): void {
  const path = sessionPath(state.sessionId);
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, path);
  } catch (err) {
    console.error(`[claude-statusline] session save failed (${state.sessionId}): ${(err as Error).message}`);
    try { unlinkSync(tmp); } catch { /* cleanup best-effort */ }
  }
}

export function listSessions(): SessionState[] {
  const dir = getDataDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
  const sessions: SessionState[] = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      if (isValidSession(data)) sessions.push(data);
    } catch (err) {
      console.error(`[claude-statusline] skip corrupted session ${f}: ${(err as Error).message}`);
    }
  }
  return sessions.sort((a, b) =>
    new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  );
}

export function cleanupOldSessions(maxDays: number = 7): void {
  const dir = getDataDir();
  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const path = join(dir, f);
    try {
      const stat = statSync(path);
      if (stat.mtimeMs < cutoff) unlinkSync(path);
    } catch (err) {
      console.error(`[claude-statusline] cleanup failed ${f}: ${(err as Error).message}`);
    }
  }
}

export function createSession(sessionId: string, cwd: string, branch: string): SessionState {
  const now = new Date().toISOString();
  const state: SessionState = {
    sessionId,
    purpose: "",
    purposeSource: "auto",
    lastUserPrompt: "",
    promptCount: 0,
    createdAt: now,
    lastActivityAt: now,
    branch,
    workingDirectory: cwd,
    status: "active",
  };
  saveSession(state);
  return state;
}

// ─── Purpose 빌더 ──────────────────────────────────────

const TICKET_RE = /\b[A-Z]{2,10}-\d+\b/;
const HASH_TICKET_RE = /#\d+\b/;
const MAX_PURPOSE_LEN = 30;

function extractTicketId(text: string): string | null {
  const match = text.match(TICKET_RE) || text.match(HASH_TICKET_RE);
  return match ? match[0] : null;
}

function buildPurpose(prompt: string): string {
  const ticketId = extractTicketId(prompt);
  // 티켓 ID를 본문에서 제거 후 특수문자 제거: 알파벳, 숫자, 한글, 공백만 유지
  const withoutTicket = ticketId ? prompt.replace(ticketId, "") : prompt;
  const stripped = withoutTicket.replace(/[^a-zA-Z0-9가-힣\s]/g, "").replace(/\s+/g, " ").trim();
  const maxBody = ticketId ? MAX_PURPOSE_LEN - ticketId.length - 1 : MAX_PURPOSE_LEN;
  const truncated = stripped.slice(0, maxBody);
  return ticketId ? `${ticketId} ${truncated}` : truncated;
}

function summarizePurposeAsync(sessionId: string, prompt: string): void {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/src", "");
    const script = join(pluginRoot, "scripts", "refresh-purpose.ts");
    Bun.spawn(["bun", "run", script, sessionId, prompt], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdio: ["ignore", "ignore", "ignore"],
    }).unref();
  } catch (err) {
    console.error(`[claude-statusline] summarize-purpose spawn failed: ${(err as Error).message}`);
  }
}

// ─── 상태 전이 함수 ────────────────────────────────────

export function reactivateSession(session: SessionState, cwd: string): SessionState {
  const updated = { ...session };
  updated.lastActivityAt = new Date().toISOString();
  updated.branch = getGitBranch(cwd) ?? updated.branch;
  updated.status = "active";
  saveSession(updated);
  return updated;
}

export function recordPrompt(session: SessionState, prompt: string | undefined, cwd: string): SessionState {
  if (session.status === "completed") return session;
  const updated = { ...session };
  updated.promptCount += 1;
  updated.lastActivityAt = new Date().toISOString();

  const cleaned = prompt?.replace(/[\n\t\r]/g, " ");
  const isSlashCmd = cleaned ? /^\/\S/.test(cleaned.trim()) : true;

  if (cleaned && !isSlashCmd) {
    updated.lastUserPrompt = cleaned.slice(0, 200);
  }

  // 자동 purpose: 첫 유효 프롬프트에서만 설정 (manual 제외)
  if (cleaned && !isSlashCmd && updated.purposeSource !== "manual" && !updated.purpose) {
    updated.purpose = buildPurpose(cleaned);
    updated.purposeSource = "auto";
    summarizePurposeAsync(updated.sessionId, cleaned);
  }

  updated.branch = getGitBranch(cwd) ?? updated.branch;
  saveSession(updated);
  return updated;
}

export function completeSession(session: SessionState): SessionState {
  const updated = { ...session };
  updated.status = "completed";
  updated.lastActivityAt = new Date().toISOString();
  saveSession(updated);
  return updated;
}
