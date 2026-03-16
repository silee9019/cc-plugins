import { displayWidth, truncate } from "./cjk.js";
import { shortenPath, shortenBranch } from "./shorten.js";
import { getGitBranch } from "./git.js";
import { ANSI, type StatuslineInput, type SessionState, type CostData } from "./types.js";

const dim = (s: string) => `${ANSI.dim}${s}${ANSI.reset}`;
const magenta = (s: string) => `${ANSI.magenta}${s}${ANSI.reset}`;
const SEP = dim(" | ");

function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return dim(`${h}:${m}`);
}

function formatModelShort(displayName: string): string {
  // "Claude 4.6 Opus" → "Opus 4.6", "Claude Opus 4.6 (1M context)" → "Opus 4.6"
  const match = displayName.match(/(?:Claude\s+)?(\d+\.\d+)\s+(Opus|Sonnet|Haiku)/i)
    || displayName.match(/(?:Claude\s+)?(Opus|Sonnet|Haiku)\s+(\d+\.\d+)/i);
  if (match) {
    const [, a, b] = match;
    const name = /^\d/.test(a) ? b : a;
    const ver = /^\d/.test(a) ? a : b;
    return `${name} ${ver}`;
  }
  return displayName.replace(/Claude\s+/i, "").replace(/\s*\(.*\)/, "");
}

function formatContextBar(currentUsage: StatuslineInput["context_window"]["current_usage"], windowSize: number): string {
  if (!currentUsage) return "░░░░░░░░░░  0%";

  const current = currentUsage.input_tokens
    + currentUsage.cache_creation_input_tokens
    + currentUsage.cache_read_input_tokens;
  const pct = Math.round((current * 100) / windowSize);
  const thresholdPct = parseInt(process.env.CLAUDE_AUTOCOMPACT_THRESHOLD ?? "77");
  const filled = Math.floor(pct / 10);
  const markerPos = Math.floor(thresholdPct / 10);

  let bar = "";
  for (let i = 0; i < 10; i++) {
    if (i < filled) bar += "█";
    else if (thresholdPct > 0 && i === markerPos) bar += "▒";
    else bar += "░";
  }

  return `${bar} ${String(pct).padStart(3)}%`;
}

function formatElapsed(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d${hours % 24}h`;
  if (hours > 0) return `${hours}h${mins % 60}m`;
  return `${mins}m`;
}

function formatSessionCost(cost: number, available?: boolean): string {
  if (available === false) return "$--";
  return `$${cost < 0.01 ? "0.00" : cost.toFixed(2)}`;
}

function formatDailyModels(costs: CostData): string {
  if (costs.available === false) return "$--";
  if (!costs.dailyModels) return "$0";
  const parts: string[] = [];
  const { opus, sonnet, haiku } = costs.dailyModels;
  if (opus > 0) parts.push(`Opus $${Math.round(opus)}`);
  if (sonnet > 0) parts.push(`Sonnet $${Math.round(sonnet)}`);
  if (haiku > 0) parts.push(`Haiku $${Math.round(haiku)}`);
  return parts.length > 0 ? parts.join(" ") : "$0";
}

function formatWeeklyCost(cost: number, available?: boolean): string {
  if (available === false) return "W$--";
  return `W$${Math.round(cost)}`;
}

function formatMonthlyCost(cost: number, available?: boolean): string {
  if (available === false) return "M$--";
  return `M$${Math.round(cost)}`;
}

// ─── 반응형 세그먼트 빌더 ────────────────────────────────────

interface Segment {
  text: string;
  width: number;
  priority: number; // 낮을수록 먼저 제거
}

function seg(text: string, priority: number): Segment {
  return { text, width: displayWidth(text), priority };
}

function fitSegments(segments: Segment[], budget: number, separator: string): string {
  const sepWidth = displayWidth(separator);
  let active = [...segments];

  while (active.length > 1) {
    const totalWidth = active.reduce((sum, s) => sum + s.width, 0)
      + (active.length - 1) * sepWidth;
    if (totalWidth <= budget) break;
    // 가장 낮은 priority 세그먼트를 뒤에서부터 제거
    const minPriority = Math.min(...active.map((s) => s.priority));
    const idx = active.findLastIndex((s) => s.priority === minPriority);
    if (idx >= 0) active.splice(idx, 1);
    else break;
  }

  return active.map((s) => s.text).join(separator);
}

// ─── Line 빌더 ──────────────────────────────────────────────

export function buildLine1(input: StatuslineInput, termWidth: number): string {
  const branch = getGitBranch(input.workspace.current_dir);
  const segments: Segment[] = [
    seg(formatTime(), 100),
    seg(shortenPath(input.workspace.current_dir, "ansi"), 90),
  ];

  if (branch) {
    segments.push(seg(magenta(`【${shortenBranch(branch)}】`), 80));
  }
  segments.push(seg(dim(`v${input.version}`), 20)); // 버전: 낮은 priority

  // 모델명 + 프로그레스바를 세퍼레이터 없이 하나의 세그먼트로 결합
  const model = formatModelShort(input.model.display_name);
  const contextBar = formatContextBar(input.context_window.current_usage, input.context_window.context_window_size);
  segments.push(seg(dim(`${model} ${contextBar}`), 70));

  return fitSegments(segments, termWidth, SEP);
}

export function buildLine2(
  input: StatuslineInput,
  session: SessionState | null,
  costs: CostData,
  termWidth: number,
): string {
  const segments: Segment[] = [];

  // 경과시간
  if (session) {
    segments.push(seg(dim(formatElapsed(session.lastActivityAt || session.createdAt)), 60));
  }

  // Purpose
  if (session?.purpose) {
    const maxPurposeCols = Math.min(Math.floor(termWidth * 0.4), 50);
    segments.push(seg(truncate(session.purpose, maxPurposeCols), 50));
  } else if (session) {
    segments.push(seg(dim("(no purpose)"), 10));
  }

  // 비용 (모델별 일일 → 주간 → 월간, 우선도 낮은 순으로 제거)
  segments.push(seg(dim(formatDailyModels(costs)), 40));
  segments.push(seg(dim(formatWeeklyCost(costs.weeklyCost, costs.available)), 20));
  segments.push(seg(dim(formatMonthlyCost(costs.monthlyCost, costs.available)), 10));

  return fitSegments(segments, termWidth, SEP);
}

export function buildLine3(session: SessionState | null, termWidth: number): string | null {
  if (!session?.lastUserPrompt) return null;

  const turnLabel = dim(`#${session.promptCount}`);
  const turnWidth = displayWidth(turnLabel);
  const sepW = displayWidth(SEP);
  const maxPromptCols = Math.max(termWidth - turnWidth - sepW, 15);
  const promptText = truncate(session.lastUserPrompt, maxPromptCols);

  return `${turnLabel}${SEP}${promptText}`;
}

export function buildStatusLine(
  input: StatuslineInput,
  session: SessionState | null,
  costs: CostData,
  termWidth: number,
): string {
  const line1 = buildLine1(input, termWidth);
  const line2 = buildLine2(input, session, costs, termWidth);
  const line3 = buildLine3(session, termWidth);
  return [line1, line2, line3].filter(Boolean).join("\n")
    .replace(/  +/g, " ");
}
