import { buildStatusLine } from "../src/format.js";
import { loadSession } from "../src/session.js";
import { fetchCostsSync } from "../src/cost.js";
import { isStatuslineInput, type CostData } from "../src/types.js";

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let input;
  try {
    const parsed = JSON.parse(raw);
    if (!isStatuslineInput(parsed)) {
      console.error("[claude-statusline] invalid input schema");
      process.exit(0);
    }
    input = parsed;
  } catch (err) {
    console.error(`[claude-statusline] stdin parse failed: ${(err as Error).message}`);
    console.error(`[claude-statusline] raw (first 200): ${raw.slice(0, 200)}`);
    process.exit(0);
  }

  const session = input.session_id ? loadSession(input.session_id) : null;
  const costs = fetchCostsSync();

  // 세션 비용은 statusline input에서 직접 획득 (원본 불변)
  const sessionCostOverride = input.cost?.total_cost_usd;
  const finalCosts: CostData = sessionCostOverride != null
    ? { ...costs, sessionCost: sessionCostOverride }
    : costs;

  const width = parseInt(process.env.COLUMNS ?? "120");
  const output = buildStatusLine(input, session, finalCosts, width);
  process.stdout.write(output);
}

main().catch((err) => {
  console.error(`[claude-statusline] ${err?.message ?? err}`);
  process.exit(0);
});
