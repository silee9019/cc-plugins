import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CostData } from "./types.js";

const CACHE_TTL_MS = 300_000; // 5분

interface CachedCostData extends CostData {
  cachedAt: string;
}

function getCachePath(): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/src", "");
  return join(pluginRoot, "data", "cost-cache.json");
}

// statusline에서 호출: 캐시만 읽기
export function fetchCostsSync(): CostData {
  const path = getCachePath();
  if (!existsSync(path)) return { sessionCost: 0, weeklyCost: 0, monthlyCost: 0, available: false };
  try {
    const data: CachedCostData = JSON.parse(readFileSync(path, "utf-8"));
    if (data.cachedAt && Date.now() - new Date(data.cachedAt).getTime() < CACHE_TTL_MS) {
      return data;
    }
  } catch (err) {
    console.error(`[claude-statusline] cache read failed: ${(err as Error).message}`);
  }
  return { sessionCost: 0, weeklyCost: 0, monthlyCost: 0, available: false };
}

// hook-handler에서 호출: refresh-cost.ts를 detached 프로세스로 실행
export function refreshCostCacheAsync(): void {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? import.meta.dir.replace("/src", "");

    // spawn 전 TTL 프리체크: 캐시 유효하면 프로세스 생성 자체를 차단
    const cachePath = join(pluginRoot, "data", "cost-cache.json");
    if (existsSync(cachePath)) {
      try {
        const data = JSON.parse(readFileSync(cachePath, "utf-8"));
        if (data.cachedAt && Date.now() - new Date(data.cachedAt).getTime() < CACHE_TTL_MS) {
          return;
        }
      } catch { /* 손상된 캐시 → 갱신 진행 */ }
    }

    const script = join(pluginRoot, "scripts", "refresh-cost.ts");
    Bun.spawn(["bun", "run", script], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdio: ["ignore", "ignore", "ignore"],
    }).unref();
  } catch (err) {
    console.error(`[claude-statusline] refresh-cost spawn failed: ${(err as Error).message}`);
  }
}
