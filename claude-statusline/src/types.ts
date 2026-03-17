// Claude Code statusline stdin JSON
export interface StatuslineInput {
  session_id: string;
  workspace: { current_dir: string };
  model: { display_name: string };
  context_window: {
    current_usage: {
      input_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    } | null;
    context_window_size: number;
  };
  version: string;
  cost?: { total_cost_usd?: number };
}

// 세션 상태 (JSON 파일 저장)
export interface SessionState {
  sessionId: string;
  ticketId: string;
  purpose: string;
  purposeSource: "auto" | "manual" | "rename";
  lastUserPrompt: string;
  promptCount: number;
  createdAt: string;
  lastActivityAt: string;
  branch: string;
  workingDirectory: string;
  status: "active" | "completed";
}

// 훅 이벤트 stdin JSON
export interface HookEvent {
  hook_event_name: "SessionStart" | "UserPromptSubmit" | "SessionEnd";
  session_id: string;
  cwd: string;
  prompt?: string;
  transcript_path?: string;
}

// 비용 데이터
export interface CostData {
  sessionCost: number;
  weeklyCost: number;
  monthlyCost: number;
  dailyModels?: {
    opus: number;
    sonnet: number;
    haiku: number;
  };
  available?: boolean;
}

// ANSI 색상 상수
export const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
} as const;

// ─── 런타임 가드 함수 ────────────────────────────────────

export function isStatuslineInput(v: unknown): v is StatuslineInput {
  return typeof v === "object" && v !== null
    && "session_id" in v && "workspace" in v && "context_window" in v;
}

export function isHookEvent(v: unknown): v is HookEvent {
  return typeof v === "object" && v !== null
    && "hook_event_name" in v && "session_id" in v && "cwd" in v;
}

export function isValidSession(v: unknown): v is SessionState {
  return typeof v === "object" && v !== null
    && "sessionId" in v && typeof (v as SessionState).promptCount === "number";
}
