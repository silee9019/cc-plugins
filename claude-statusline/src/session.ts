import { existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, closeSync } from "fs";
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
    // 마이그레이션: ticketId 필드가 없는 기존 세션
    if (!("ticketId" in data)) data.ticketId = "";
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
    ticketId: "",
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

// ─── Ticket ID 추출 ──────────────────────────────────────

const TICKET_RE = /\b[A-Z]{2,10}-\d+\b/;
const HASH_TICKET_RE = /#\d+\b/;

function extractTicketId(text: string): string {
  const match = text.match(TICKET_RE) || text.match(HASH_TICKET_RE);
  return match ? match[0] : "";
}

// ─── Custom Title (transcript에서 읽기) ──────────────────

function findCustomTitle(transcriptPath: string): string | null {
  try {
    const fd = openSync(transcriptPath, "r");
    const size = statSync(transcriptPath).size;
    const readSize = Math.min(size, 32768);
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
    closeSync(fd);

    const lines = buf.toString("utf-8").split("\n").reverse();
    for (const line of lines) {
      if (line.includes("custom-title")) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "custom-title" && typeof parsed.title === "string") {
            return parsed.title;
          }
        } catch { /* not valid JSON */ }
      }
    }
  } catch { /* transcript not readable */ }
  return null;
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

export function recordPrompt(
  session: SessionState,
  prompt: string | undefined,
  cwd: string,
  transcriptPath?: string,
): SessionState {
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
    updated.purpose = cleaned.slice(0, 60);
    updated.ticketId = extractTicketId(cleaned);
    updated.purposeSource = "auto";
  }

  // custom-title: transcript에서 읽어 purpose 덮어쓰기 (manual 제외)
  if (transcriptPath && updated.purposeSource !== "manual") {
    const customTitle = findCustomTitle(transcriptPath);
    if (customTitle) {
      updated.purpose = customTitle;
      updated.purposeSource = "rename";
    }
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
