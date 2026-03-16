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

  if (prompt) {
    updated.lastUserPrompt = prompt.replace(/[\n\t\r]/g, " ").slice(0, 200);
  }

  // 첫 프롬프트로 자동 purpose 설정
  if (updated.promptCount === 1 && !updated.purpose && prompt) {
    updated.purpose = prompt.replace(/[\n\t\r]/g, " ").slice(0, 60);
    updated.purposeSource = "auto";
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
