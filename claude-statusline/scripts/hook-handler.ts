import { loadSession, createSession, cleanupOldSessions, reactivateSession, recordPrompt, completeSession } from "../src/session.js";
import { refreshCostCacheAsync } from "../src/cost.js";
import { isHookEvent } from "../src/types.js";

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let event;
  try {
    const parsed = JSON.parse(raw);
    if (!isHookEvent(parsed)) {
      console.error("[claude-statusline:hook] invalid event schema");
      process.exit(1);
    }
    event = parsed;
  } catch (err) {
    console.error(`[claude-statusline:hook] stdin parse failed: ${(err as Error).message}`);
    console.error(`[claude-statusline:hook] raw (first 200): ${raw.slice(0, 200)}`);
    process.exit(1);
  }

  const { hook_event_name, session_id, cwd, prompt } = event;
  if (!session_id) process.exit(0);

  switch (hook_event_name) {
    case "SessionStart": {
      const existing = loadSession(session_id);
      if (existing) {
        reactivateSession(existing, cwd);
      } else {
        const { getGitBranch } = await import("../src/git.js");
        const branch = getGitBranch(cwd) ?? "";
        createSession(session_id, cwd, branch);
      }
      cleanupOldSessions(7);
      refreshCostCacheAsync();
      break;
    }

    case "UserPromptSubmit": {
      const session = loadSession(session_id);
      if (!session) break;
      recordPrompt(session, prompt, cwd);
      break;
    }

    case "SessionEnd": {
      const session = loadSession(session_id);
      if (!session) break;
      completeSession(session);
      break;
    }
  }
}

main().catch((err) => {
  console.error(`[claude-statusline:hook] ${err?.message ?? err}`);
  process.exit(1);
});
