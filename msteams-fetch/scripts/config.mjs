import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import YAML from "yaml";

const CONFIG_DIR = join(homedir(), ".config", "msteams-fetch");
const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");
const ALIASES_FILE = join(CONFIG_DIR, "aliases.yaml");
const TOKEN_CACHE_FILE = join(CONFIG_DIR, "token-cache.json");

export function paths() {
  return { CONFIG_DIR, CONFIG_FILE, ALIASES_FILE, TOKEN_CACHE_FILE };
}

export function loadConfig() {
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
  cfg.output.dir = expandHome(cfg.output.dir || "~/tmp/teams-context");
  cfg.defaults = cfg.defaults || {};
  cfg.defaults.since = cfg.defaults.since || "7d";
  cfg.defaults.limit = cfg.defaults.limit || 200;
  cfg.defaults.context_minutes = cfg.defaults.context_minutes ?? 0;
  cfg.auth.scopes = cfg.auth.scopes || ["Chat.Read", "User.Read"];

  // 0.4.0 cache layer defaults.
  cfg.cache = cfg.cache || {};
  cfg.cache.dir = expandHome(cfg.cache.dir || "~/.cache/msteams-fetch");
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

export function findSimilarAlias(name, aliases) {
  const keys = Object.keys(aliases);
  if (keys.length === 0) return null;
  const lower = name.toLowerCase();
  return keys.find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) || null;
}
