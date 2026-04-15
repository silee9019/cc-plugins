// KST 전역 규약 (Asia/Seoul, +09:00, no DST).
// 다른 모듈은 이 파일의 함수만 사용. `new Date()` / `Date.now()` / `toISOString()` 직접 호출 금지.
// UTC는 Graph API 경계에서만 순간적으로 존재한다 (toUtcForGraph / toKst).

const KST_OFFSET_MINUTES = 9 * 60;
const KST_OFFSET_MS = KST_OFFSET_MINUTES * 60 * 1000;
const KST_OFFSET_LABEL = "+09:00";

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad3(n) {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return `${n}`;
}

// Internal: Date → KST ISO string `YYYY-MM-DDTHH:MM:SS.sss+09:00`.
function formatKstIso(date) {
  const kstMs = date.getTime() + KST_OFFSET_MS;
  const shifted = new Date(kstMs);
  const y = shifted.getUTCFullYear();
  const mo = pad2(shifted.getUTCMonth() + 1);
  const d = pad2(shifted.getUTCDate());
  const h = pad2(shifted.getUTCHours());
  const mi = pad2(shifted.getUTCMinutes());
  const s = pad2(shifted.getUTCSeconds());
  const ms = pad3(shifted.getUTCMilliseconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${KST_OFFSET_LABEL}`;
}

// Public: current instant as KST ISO string.
export function nowKst() {
  return formatKstIso(new Date());
}

// Public: convert any Date or ISO string (UTC `Z`, KST `+09:00`, or naive) to KST ISO.
// Naive strings without offset are rejected — callers must be explicit.
export function toKst(input) {
  if (input instanceof Date) {
    return formatKstIso(input);
  }
  if (typeof input !== "string") {
    throw new TypeError(`toKst: expected Date or ISO string, got ${typeof input}`);
  }
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) {
    throw new Error(`toKst: ISO string must include timezone offset, got "${input}"`);
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`toKst: invalid ISO string "${input}"`);
  }
  return formatKstIso(d);
}

// Public: convert KST ISO (or any TZ-aware ISO) to UTC ISO for Graph API wire transfer.
// Output uses `Z` suffix (RFC3339 zulu form expected by Graph $filter).
export function toUtcForGraph(kstIso) {
  if (typeof kstIso !== "string") {
    throw new TypeError(`toUtcForGraph: expected ISO string, got ${typeof kstIso}`);
  }
  const d = new Date(kstIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`toUtcForGraph: invalid ISO string "${kstIso}"`);
  }
  // Manual zulu format — avoids hitting Date.prototype.toISOString directly in callers.
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  const ms = pad3(d.getUTCMilliseconds());
  return `${y}-${mo}-${day}T${h}:${mi}:${s}.${ms}Z`;
}

// Public: extract `YYYY-MM-DD` from a KST ISO string. Input must already be KST.
// O(1) substring — no parsing cost in hot read paths.
export function kstDateString(kstIso) {
  if (typeof kstIso !== "string" || kstIso.length < 10) {
    throw new Error(`kstDateString: invalid KST ISO "${kstIso}"`);
  }
  return kstIso.slice(0, 10);
}

// Public: parse `--since` spec into KST ISO.
// Accepts: `2h`, `1d`, `7d`, `2026-04-13`, or TZ-aware ISO string.
// Relative specs are computed against the current KST wall clock.
export function parseSinceKst(spec) {
  if (typeof spec !== "string" || spec.length === 0) {
    throw new Error(`parseSinceKst: spec required`);
  }

  const rel = /^(\d+)([hd])$/.exec(spec);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = unit === "h" ? n * 3_600_000 : n * 86_400_000;
    return formatKstIso(new Date(Date.now() - ms));
  }

  // Absolute date `YYYY-MM-DD` → KST midnight.
  const absDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spec);
  if (absDate) {
    // Treat as KST local midnight: construct via UTC epoch at `YYYY-MM-DDT00:00:00+09:00`.
    const iso = `${spec}T00:00:00${KST_OFFSET_LABEL}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`parseSinceKst: invalid date "${spec}"`);
    }
    return formatKstIso(d);
  }

  // Full ISO with offset.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(spec)) {
    return toKst(spec);
  }

  throw new Error(`parseSinceKst: unsupported format "${spec}" (use 2h, 1d, 7d, YYYY-MM-DD, or full ISO)`);
}

// Public: compare two KST ISO strings lexicographically.
// Safe because the fixed-width format + same offset gives chronological order.
export function kstIsoLt(a, b) {
  return a < b;
}

export function kstIsoMax(a, b) {
  return a >= b ? a : b;
}
