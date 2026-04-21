import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import YAML from "yaml";

const CONFIG_DIR = join(homedir(), ".config", "m365-fetch");
const LEGACY_CONFIG_DIR = join(homedir(), ".config", "msteams-fetch");
const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");
const ALIASES_FILE = join(CONFIG_DIR, "aliases.yaml");
const TOKEN_CACHE_FILE = join(CONFIG_DIR, "token-cache.json");

// Full list of permissions consented on the m365-fetch app registration.
// Keep in sync with the Azure AD app manifest: adding a scope here without
// consenting it first will fail token acquisition with AADSTS65001.
const DEFAULT_GRAPH_SCOPES = [
  "Calendars.Read",
  "Calendars.Read.Shared",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "Chat.Read",
  "Chat.ReadBasic",
  "Files.Read.All",
  "Group.Read.All",
  "Mail.Read",
  "Mail.Read.Shared",
  "offline_access",
  "OnlineMeetings.Read",
  "People.Read",
  "Place.Read.All",
  "Presence.Read.All",
  "Tasks.Read",
  "Tasks.Read.Shared",
  "Team.ReadBasic.All",
  "TeamMember.Read.All",
  "User.Read",
  "User.Read.All",
];

const DEFAULT_FLOW_SCOPES = [
  "https://service.flow.microsoft.com//Activity.Read.All",
  "https://service.flow.microsoft.com//Flows.Manage.All",
  "https://service.flow.microsoft.com//Flows.Read.All",
  "https://service.flow.microsoft.com//User",
];

// One-shot legacy migration: `~/.config/msteams-fetch/` → `~/.config/m365-fetch/`.
// Only runs when the new dir doesn't exist yet, so re-running never clobbers newer state.
function migrateLegacyConfigDir() {
  if (existsSync(CONFIG_DIR)) return;
  if (!existsSync(LEGACY_CONFIG_DIR)) return;
  process.stderr.write(
    `[m365-fetch] legacy config 감지: ${LEGACY_CONFIG_DIR} → ${CONFIG_DIR}로 이전\n`,
  );
  renameSync(LEGACY_CONFIG_DIR, CONFIG_DIR);
}

export function paths() {
  return { CONFIG_DIR, CONFIG_FILE, ALIASES_FILE, TOKEN_CACHE_FILE };
}

export function loadConfig() {
  migrateLegacyConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(
      `설정 파일이 없습니다: ${CONFIG_FILE}\nREADME의 초기 설정 섹션을 참고해 생성하세요.`,
    );
  }
  const raw = readFileSync(CONFIG_FILE, "utf8");
  const cfg = YAML.parse(raw);
  if (!cfg?.auth?.tenant_id || !cfg?.auth?.client_id) {
    throw new Error("config.yaml에 auth.tenant_id와 auth.client_id가 필요합니다.");
  }
  cfg.output = cfg.output || {};
  cfg.output.dir = expandHome(cfg.output.dir || "~/tmp/m365-context");
  cfg.defaults = cfg.defaults || {};
  // "auto" = resolve from last-read state per command, fallback 7d on first run.
  // Explicit relative ("2h"/"1d"/"7d") or ISO values bypass state lookup.
  cfg.defaults.since = cfg.defaults.since || "auto";
  cfg.defaults.until = cfg.defaults.until || "now";
  cfg.defaults.chunk_days = cfg.defaults.chunk_days ?? 3;
  cfg.defaults.limit = cfg.defaults.limit || 200;
  cfg.defaults.context_minutes = cfg.defaults.context_minutes ?? 0;
  cfg.flow = cfg.flow || {};
  cfg.flow.default_env = cfg.flow.default_env ?? null;

  // Backward compat: msteams-fetch era used a single `scopes` list (all Graph).
  if (Array.isArray(cfg.auth.scopes) && !Array.isArray(cfg.auth.graph_scopes)) {
    cfg.auth.graph_scopes = cfg.auth.scopes;
  }
  delete cfg.auth.scopes;
  cfg.auth.graph_scopes =
    Array.isArray(cfg.auth.graph_scopes) && cfg.auth.graph_scopes.length > 0
      ? cfg.auth.graph_scopes
      : DEFAULT_GRAPH_SCOPES;
  cfg.auth.flow_scopes =
    Array.isArray(cfg.auth.flow_scopes) && cfg.auth.flow_scopes.length > 0
      ? cfg.auth.flow_scopes
      : DEFAULT_FLOW_SCOPES;

  // 0.3.4 inbox defaults: subscribed-chat + registered-channel aggregate fetch.
  cfg.inbox = cfg.inbox || {};
  cfg.inbox.exclude_chat_topics = Array.isArray(cfg.inbox.exclude_chat_topics)
    ? cfg.inbox.exclude_chat_topics
    : [];
  cfg.inbox.exclude_chat_ids = Array.isArray(cfg.inbox.exclude_chat_ids)
    ? cfg.inbox.exclude_chat_ids
    : [];
  cfg.inbox.exclude_chat_types = Array.isArray(cfg.inbox.exclude_chat_types)
    ? cfg.inbox.exclude_chat_types
    : [];

  // 0.4.0 cache layer defaults.
  cfg.cache = cfg.cache || {};
  cfg.cache.dir = expandHome(cfg.cache.dir || "~/.cache/m365-fetch");
  cfg.cache.retention_days = cfg.cache.retention_days ?? 30;
  cfg.cache.log_retention_days = cfg.cache.log_retention_days ?? 14;
  cfg.cache.sync_lock_path = expandHome(
    cfg.cache.sync_lock_path || join(cfg.cache.dir, "sync.lock"),
  );
  cfg.cache.seed_since = cfg.cache.seed_since || "30d";
  return cfg;
}

export function loadAliases() {
  if (!existsSync(ALIASES_FILE)) {
    return {};
  }
  const raw = readFileSync(ALIASES_FILE, "utf8");
  const parsed = YAML.parse(raw) || {};
  return parsed.aliases || {};
}

export function saveAlias(name, entry) {
  const current = existsSync(ALIASES_FILE)
    ? YAML.parse(readFileSync(ALIASES_FILE, "utf8")) || {}
    : {};
  current.aliases = current.aliases || {};
  current.aliases[name] = entry;
  ensureDir(ALIASES_FILE);
  writeFileSync(ALIASES_FILE, YAML.stringify(current), { mode: 0o600 });
  chmodSync(ALIASES_FILE, 0o600);
}

export function expandHome(p) {
  if (!p) return p;
  if (p.startsWith("~")) return join(homedir(), p.slice(1));
  return p;
}

export function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function filterAliasesForAll(aliases, extraExcludes = []) {
  const excludeSet = new Set(extraExcludes);
  const result = {};
  for (const [name, entry] of Object.entries(aliases)) {
    if (entry.exclude_from_all === true) continue;
    if (excludeSet.has(name)) continue;
    result[name] = entry;
  }
  return result;
}

// Decide whether a subscribed chat should be included in inbox output.
// Matches are case-insensitive substring matches against chat.topic, plus exact
// chat.id and chatType matches. Returns { include: boolean, reason: string? }.
export function shouldIncludeChatInInbox(chat, inboxCfg, extraExcludeIds = []) {
  const topic = chat.topic || "";
  const lowerTopic = topic.toLowerCase();
  const excludeTopics = (inboxCfg?.exclude_chat_topics || []).map((t) => String(t).toLowerCase());
  const excludeIds = new Set([...(inboxCfg?.exclude_chat_ids || []), ...extraExcludeIds]);
  const excludeTypes = new Set(inboxCfg?.exclude_chat_types || []);

  if (excludeIds.has(chat.id)) return { include: false, reason: "chat_id" };
  if (excludeTypes.has(chat.chatType)) return { include: false, reason: "chat_type" };
  for (const needle of excludeTopics) {
    if (needle && lowerTopic.includes(needle)) return { include: false, reason: `topic~${needle}` };
  }
  return { include: true };
}

export function findSimilarAlias(name, aliases) {
  const keys = Object.keys(aliases);
  if (keys.length === 0) return null;
  const lower = name.toLowerCase();
  return keys.find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) || null;
}
