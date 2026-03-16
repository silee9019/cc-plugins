// 독립 프로세스로 실행: ccusage → 캐시 파일 갱신
// hook-handler에서 detached로 spawn됨

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const CACHE_TTL_MS = 300_000; // 5분

interface CostData {
  sessionCost: number;
  weeklyCost: number;
  monthlyCost: number;
  dailyModels?: { opus: number; sonnet: number; haiku: number };
  available: boolean;
  cachedAt: string;
}

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/scripts", "");
const cachePath = join(pluginRoot, "data", "cost-cache.json");

// 캐시가 유효하면 종료
if (existsSync(cachePath)) {
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (data.cachedAt && Date.now() - new Date(data.cachedAt).getTime() < CACHE_TTL_MS) {
      process.exit(0);
    }
  } catch { /* 손상된 캐시 → 갱신 진행 */ }
}

// ccusage 실행
const result = Bun.spawnSync({
  cmd: ["ccusage", "--json"],
  timeout: 60_000,
  stderr: "ignore",
});

if (result.exitCode !== 0) {
  console.error(`[claude-statusline:refresh-cost] ccusage exit ${result.exitCode}`);
  process.exit(1);
}

try {
  const json = JSON.parse(result.stdout.toString());
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })();
  const month = today.slice(0, 7);

  const todayData = json.daily?.find((d: { date: string }) => d.date === today);

  const dailyModels = { opus: 0, sonnet: 0, haiku: 0 };
  if (todayData?.modelBreakdowns) {
    for (const m of todayData.modelBreakdowns) {
      const name = (m.modelName as string).toLowerCase();
      if (name.includes("opus")) dailyModels.opus += m.cost;
      else if (name.includes("sonnet")) dailyModels.sonnet += m.cost;
      else if (name.includes("haiku")) dailyModels.haiku += m.cost;
    }
  }

  const weeklyCost = (json.daily ?? [])
    .filter((d: { date: string }) => d.date >= weekStart)
    .reduce((sum: number, d: { totalCost: number }) => sum + d.totalCost, 0);

  const monthlyCost = (json.daily ?? [])
    .filter((d: { date: string }) => d.date.startsWith(month))
    .reduce((sum: number, d: { totalCost: number }) => sum + d.totalCost, 0);

  const data: CostData = {
    sessionCost: 0, weeklyCost, monthlyCost, dailyModels,
    available: true,
    cachedAt: new Date().toISOString(),
  };

  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${cachePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, cachePath);
} catch (err) {
  console.error(`[claude-statusline:refresh-cost] parse failed: ${(err as Error).message}`);
  process.exit(1);
}
