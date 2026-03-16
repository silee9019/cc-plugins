import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import type { CostData } from "./types.js";

const CACHE_TTL_MS = 60_000; // 60초

// 캐시 전용 래퍼 타입 (CostData에서 cachedAt 분리)
interface CachedCostData extends CostData {
  cachedAt: string;
}

function getCachePath(): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/src", "");
  return join(pluginRoot, "data", "cost-cache.json");
}

function readCache(): CostData | null {
  const path = getCachePath();
  if (!existsSync(path)) return null;
  try {
    const data: CachedCostData = JSON.parse(readFileSync(path, "utf-8"));
    if (data.cachedAt && Date.now() - new Date(data.cachedAt).getTime() < CACHE_TTL_MS) {
      return data;
    }
  } catch (err) {
    console.error(`[claude-statusline] cache read failed: ${(err as Error).message}`);
  }
  return null;
}

function writeCache(data: CostData): void {
  try {
    const path = getCachePath();
    const tmp = `${path}.tmp`;
    const cached: CachedCostData = { ...data, cachedAt: new Date().toISOString() };
    writeFileSync(tmp, JSON.stringify(cached));
    renameSync(tmp, path);
  } catch (err) {
    console.error(`[claude-statusline] cache write failed: ${(err as Error).message}`);
  }
}

export function fetchCostsSync(): CostData {
  const cached = readCache();
  if (cached) return cached;

  const empty: CostData = { sessionCost: 0, weeklyCost: 0, monthlyCost: 0, available: false };

  try {
    const result = Bun.spawnSync({
      cmd: ["bunx", "ccusage", "--json"],
      timeout: 3000,
      stderr: "ignore",
    });
    if (result.exitCode !== 0) {
      console.error(`[claude-statusline] ccusage exit ${result.exitCode}`);
      return empty;
    }

    const json = JSON.parse(result.stdout.toString());
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getWeekStart();
    const month = today.slice(0, 7);

    const todayData = json.daily?.find((d: { date: string }) => d.date === today);

    // 모델별 일일 비용
    const dailyModels = { opus: 0, sonnet: 0, haiku: 0 };
    if (todayData?.modelBreakdowns) {
      for (const m of todayData.modelBreakdowns) {
        const name = (m.modelName as string).toLowerCase();
        if (name.includes("opus")) dailyModels.opus += m.cost;
        else if (name.includes("sonnet")) dailyModels.sonnet += m.cost;
        else if (name.includes("haiku")) dailyModels.haiku += m.cost;
      }
    }

    // 주간/월간
    const weeklyCost = (json.daily ?? [])
      .filter((d: { date: string }) => d.date >= weekStart)
      .reduce((sum: number, d: { totalCost: number }) => sum + d.totalCost, 0);

    const monthlyCost = (json.daily ?? [])
      .filter((d: { date: string }) => d.date.startsWith(month))
      .reduce((sum: number, d: { totalCost: number }) => sum + d.totalCost, 0);

    const data: CostData = { sessionCost: 0, weeklyCost, monthlyCost, dailyModels, available: true };
    writeCache(data);
    return data;
  } catch (err) {
    console.error(`[claude-statusline] cost fetch failed: ${(err as Error).message}`);
    return empty;
  }
}

// 가장 최근 일요일 (주간 시작)
function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
