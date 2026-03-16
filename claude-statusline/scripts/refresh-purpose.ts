// 독립 프로세스로 실행: claude -p로 purpose 요약
// hook-handler에서 detached로 spawn됨
// 사용법: bun run refresh-purpose.ts <session-id> <prompt>

import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

const sessionId = process.argv[2];
const prompt = process.argv[3];
if (!sessionId || !prompt) process.exit(1);

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/scripts", "");
const sessionPath = join(pluginRoot, "data", "sessions", `${sessionId}.json`);

if (!existsSync(sessionPath)) process.exit(1);

// claude -p로 요약 요청
const result = Bun.spawnSync({
  cmd: [
    process.env.HOME + "/.local/bin/claude", "-p",
    `다음 사용자 프롬프트를 15자 이내 한국어로 핵심만 요약해. 티켓 ID(예: FEAT-42, #123)가 있으면 반드시 포함. 부연 설명 없이 요약만 출력:\n${prompt}`,
  ],
  timeout: 30_000,
  stderr: "ignore",
});

if (result.exitCode !== 0) {
  console.error(`[claude-statusline:refresh-purpose] claude -p exit ${result.exitCode}`);
  process.exit(1);
}

const summary = result.stdout.toString().trim().replace(/[\n\t\r]/g, " ").slice(0, 25);
if (!summary) process.exit(1);

try {
  const session = JSON.parse(readFileSync(sessionPath, "utf-8"));
  // manual로 설정된 경우 덮어쓰지 않음
  if (session.purposeSource === "manual") process.exit(0);
  session.purpose = summary;
  session.purposeSource = "auto";
  const tmp = `${sessionPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(session, null, 2));
  renameSync(tmp, sessionPath);
} catch (err) {
  console.error(`[claude-statusline:refresh-purpose] ${(err as Error).message}`);
  process.exit(1);
}
