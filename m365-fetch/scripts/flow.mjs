// Power Automate Flow Service wrapper — CRUD + runs.
//
// Resource: https://api.flow.microsoft.com (NOT Microsoft Graph). Scopes:
//   - https://service.flow.microsoft.com//Flows.Read.All       (list/get/runs)
//   - https://service.flow.microsoft.com//Flows.Manage.All     (create/update/delete)
//   - https://service.flow.microsoft.com//Activity.Read.All    (runs history)
//   - https://service.flow.microsoft.com//User                 (baseline service access)
//
// All endpoints require api-version=2016-11-01. Flow "name" fields are the
// immutable GUID portion of the resource id (not the displayName).

import YAML from "yaml";
import { toUtcForGraph, toKst } from "./tz.mjs";
import { fetchWithSlicing } from "./sliced-fetch.mjs";
import { formatKstDate, formatKstTime } from "./render.mjs";

const FLOW_BASE = "https://api.flow.microsoft.com";
const API_VERSION = "2016-11-01";

async function flowFetch(url, token, init = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Flow API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function withApiVersion(extra = {}) {
  const params = new URLSearchParams({ "api-version": API_VERSION, ...extra });
  return params;
}

// ─── Environment resolution ────────────────────────────────────────────────

let cachedEnv = null;

export async function listEnvironments({ token }) {
  const url = `${FLOW_BASE}/providers/Microsoft.ProcessSimple/environments?${withApiVersion()}`;
  const data = await flowFetch(url, token);
  return data?.value || [];
}

export async function resolveEnvironment({ token, configEnv, tenantId } = {}) {
  if (configEnv) return configEnv;
  if (cachedEnv) return cachedEnv;
  try {
    const list = await listEnvironments({ token });
    const def = list.find((e) => e?.properties?.isDefault === true);
    if (def?.name) {
      cachedEnv = def.name;
      return cachedEnv;
    }
    if (list[0]?.name) {
      cachedEnv = list[0].name;
      return cachedEnv;
    }
  } catch {
    // swallow, fall through to tenant fallback
  }
  if (tenantId) {
    cachedEnv = `Default-${tenantId}`;
    return cachedEnv;
  }
  throw new Error("flow environment 해석 실패: config.flow.default_env 또는 auth.tenant_id 필요");
}

export function _resetEnvCacheForTests() {
  cachedEnv = null;
}

// ─── Flow CRUD ─────────────────────────────────────────────────────────────

function flowsBase(env) {
  return `${FLOW_BASE}/providers/Microsoft.ProcessSimple/environments/${encodeURIComponent(env)}/flows`;
}

function flowResource(env, flowName) {
  return `${flowsBase(env)}/${encodeURIComponent(flowName)}`;
}

export async function listFlows({ token, env, ownedOnly = false }) {
  const params = withApiVersion();
  if (ownedOnly) params.set("$filter", "search('owned')");
  const url = `${flowsBase(env)}?${params}`;
  const out = [];
  let next = url;
  while (next) {
    const data = await flowFetch(next, token);
    for (const f of data?.value || []) out.push(f);
    next = data?.nextLink || null;
  }
  return out;
}

export async function getFlow({ token, env, flowName }) {
  const url = `${flowResource(env, flowName)}?${withApiVersion()}`;
  return flowFetch(url, token);
}

export async function createFlow({ token, env, body }) {
  const url = `${flowsBase(env)}?${withApiVersion()}`;
  return flowFetch(url, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateFlow({ token, env, flowName, body }) {
  const url = `${flowResource(env, flowName)}?${withApiVersion()}`;
  return flowFetch(url, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteFlow({ token, env, flowName }) {
  const url = `${flowResource(env, flowName)}?${withApiVersion()}`;
  await flowFetch(url, token, { method: "DELETE" });
  return { deleted: flowName, env };
}

// ─── Runs ─────────────────────────────────────────────────────────────────

function runsBase(env, flowName) {
  return `${flowResource(env, flowName)}/runs`;
}

async function fetchRunsWindow({ token, env, flowName, sinceIso, untilIso, top }) {
  const params = withApiVersion({
    $top: String(top),
  });
  const filter = `startTime ge ${toUtcForGraph(sinceIso)} and startTime le ${toUtcForGraph(untilIso)}`;
  params.set("$filter", filter);
  let url = `${runsBase(env, flowName)}?${params}`;
  const out = [];
  while (url) {
    const data = await flowFetch(url, token);
    for (const r of data?.value || []) out.push(r);
    url = data?.nextLink || null;
  }
  return out;
}

export async function listRuns({
  token,
  env,
  flowName,
  sinceIso,
  untilIso,
  chunkDays = 3,
  top = 50,
  limit = 500,
}) {
  const runs = await fetchWithSlicing({
    sinceIso,
    untilIso,
    chunkDays,
    fetchOne: (w) =>
      fetchRunsWindow({
        token,
        env,
        flowName,
        sinceIso: w.sinceIso,
        untilIso: w.untilIso,
        top,
      }),
  });
  const seen = new Map();
  for (const r of runs) {
    if (!seen.has(r.name)) seen.set(r.name, r);
  }
  const out = [...seen.values()].sort((a, b) => {
    const sa = a?.properties?.startTime || "";
    const sb = b?.properties?.startTime || "";
    return sb.localeCompare(sa);
  });
  return out.slice(0, limit);
}

export async function getRunDetail({ token, env, flowName, runId }) {
  const url = `${runsBase(env, flowName)}/${encodeURIComponent(runId)}?${withApiVersion()}`;
  return flowFetch(url, token);
}

export async function listRunActions({ token, env, flowName, runId }) {
  const url = `${runsBase(env, flowName)}/${encodeURIComponent(runId)}/actions?${withApiVersion()}`;
  const data = await flowFetch(url, token);
  return data?.value || [];
}

// ─── Renderers ────────────────────────────────────────────────────────────

function durationSeconds(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, (b - a) / 1000);
}

function fmtKst(utcIso) {
  if (!utcIso) return "";
  const iso = utcIso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(utcIso) ? utcIso : `${utcIso}Z`;
  const kst = toKst(iso);
  return `${formatKstDate(kst)} ${formatKstTime(kst)}`;
}

export function renderFlowList({ env, flows, fetchedAt }) {
  const frontmatter = YAML.stringify({
    source: "power-automate-flows",
    env,
    flow_count: flows.length,
    fetched_at: fetchedAt,
  }).trim();

  const lines = [`---\n${frontmatter}\n---`, "", `# 🔁 Flows (${env})`, ""];
  if (flows.length === 0) {
    lines.push("_(등록된 flow 없음)_");
    return lines.join("\n");
  }

  lines.push("| 이름 | 상태 | 생성 | 마지막 수정 | flowName |");
  lines.push("|------|------|------|-------------|---------|");
  for (const f of flows) {
    const p = f.properties || {};
    const dn = p.displayName || f.name;
    const state = p.state || "(unknown)";
    const created = fmtKst(p.createdTime);
    const modified = fmtKst(p.lastModifiedTime);
    lines.push(`| ${dn} | ${state} | ${created} | ${modified} | \`${f.name}\` |`);
  }
  return lines.join("\n");
}

export function renderFlowDetail({ flow, fetchedAt }) {
  const p = flow.properties || {};
  const frontmatter = YAML.stringify({
    source: "power-automate-flow",
    flow_name: flow.name,
    display_name: p.displayName || null,
    state: p.state || null,
    fetched_at: fetchedAt,
  }).trim();

  const lines = [
    `---\n${frontmatter}\n---`,
    "",
    `# 🔁 ${p.displayName || flow.name}`,
    "",
    `- **flowName**: \`${flow.name}\``,
    `- **state**: ${p.state || "(unknown)"}`,
    `- **createdTime**: ${fmtKst(p.createdTime)}`,
    `- **lastModifiedTime**: ${fmtKst(p.lastModifiedTime)}`,
  ];
  if (p.environment?.name) lines.push(`- **environment**: ${p.environment.name}`);
  if (p.templateName) lines.push(`- **template**: ${p.templateName}`);
  lines.push("");
  lines.push("## definition");
  lines.push("```json");
  lines.push(JSON.stringify(p.definition || {}, null, 2));
  lines.push("```");
  if (p.connectionReferences) {
    lines.push("");
    lines.push("## connectionReferences");
    lines.push("```json");
    lines.push(JSON.stringify(p.connectionReferences, null, 2));
    lines.push("```");
  }
  return lines.join("\n");
}

export function renderRunsList({ flowName, runs, range, env, fetchedAt }) {
  const frontmatter = YAML.stringify({
    source: "power-automate-runs",
    flow_name: flowName,
    env,
    range,
    fetched_at: fetchedAt,
    run_count: runs.length,
  }).trim();

  const lines = [
    `---\n${frontmatter}\n---`,
    "",
    `# 🔁 Runs: ${flowName} (${range})`,
    "",
  ];
  if (runs.length === 0) {
    lines.push("_(해당 범위에 run 없음)_");
    return lines.join("\n");
  }

  let currentDate = null;
  for (const r of runs) {
    const p = r.properties || {};
    const start = p.startTime;
    const end = p.endTime;
    const kst = start ? toKst(start.endsWith("Z") ? start : `${start}Z`) : "";
    const date = kst ? formatKstDate(kst) : "(날짜 미상)";
    const time = kst ? formatKstTime(kst) : "";
    if (date !== currentDate) {
      lines.push(`## ${date}`, "");
      currentDate = date;
    }
    const status = p.status || "(unknown)";
    const code = p.code ? ` [${p.code}]` : "";
    const dur = durationSeconds(start, end);
    const durText = dur !== null ? ` · ${dur.toFixed(2)}s` : "";
    const trigger = p.trigger?.name ? ` · trigger: ${p.trigger.name}` : "";
    lines.push(`- ${time} · **${status}**${code}${durText}${trigger} — \`${r.name}\``);
  }
  return lines.join("\n");
}

function renderAction(action, depth = 0) {
  const indent = "  ".repeat(depth);
  const p = action.properties || {};
  const status = p.status || "(unknown)";
  const code = p.code ? ` [${p.code}]` : "";
  const dur = durationSeconds(p.startTime, p.endTime);
  const durText = dur !== null ? ` · ${dur.toFixed(2)}s` : "";
  const out = [`${indent}- **${action.name}** · ${status}${code}${durText}`];
  const err = p.error?.message;
  if (err) out.push(`${indent}  ↳ error: ${err.slice(0, 200)}`);
  const inLink = p.inputsLink?.uri;
  const outLink = p.outputsLink?.uri;
  if (inLink) out.push(`${indent}  ↳ inputs: ${inLink}`);
  if (outLink) out.push(`${indent}  ↳ outputs: ${outLink}`);
  return out.join("\n");
}

export function renderRunDetail({ flowName, run, actions, env, fetchedAt }) {
  const p = run.properties || {};
  const frontmatter = YAML.stringify({
    source: "power-automate-run",
    flow_name: flowName,
    run_id: run.name,
    env,
    status: p.status || null,
    fetched_at: fetchedAt,
  }).trim();

  const dur = durationSeconds(p.startTime, p.endTime);
  const lines = [
    `---\n${frontmatter}\n---`,
    "",
    `# 🔁 Run: ${run.name}`,
    "",
    `- **flow**: ${flowName}`,
    `- **status**: ${p.status || "(unknown)"}${p.code ? ` [${p.code}]` : ""}`,
    `- **startTime**: ${fmtKst(p.startTime)}`,
    `- **endTime**: ${fmtKst(p.endTime)}`,
    `- **duration**: ${dur !== null ? `${dur.toFixed(2)}s` : "(미상)"}`,
  ];
  if (p.trigger) {
    lines.push("");
    lines.push("## trigger");
    lines.push(`- **name**: ${p.trigger.name || "(unknown)"}`);
    lines.push(`- **status**: ${p.trigger.status || "(unknown)"}`);
    if (p.trigger.inputsLink?.uri) lines.push(`- **inputs**: ${p.trigger.inputsLink.uri}`);
    if (p.trigger.outputsLink?.uri) lines.push(`- **outputs**: ${p.trigger.outputsLink.uri}`);
  }
  if (Array.isArray(actions) && actions.length > 0) {
    lines.push("");
    lines.push("## actions");
    for (const a of actions) {
      lines.push(renderAction(a, 0));
    }
  }
  return lines.join("\n");
}
