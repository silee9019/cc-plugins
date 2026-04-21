// Per-command last-read tracking so `--since auto` can resume from where the
// previous successful run left off. Keys are namespaced as `<group>.<cmd>[:<target>]`
// (e.g. `teams.fetch:team-channel`, `calendar.events`, `flow.runs:MyFlow`).
//
// The state file is ~/.config/m365-fetch/last-read.yaml (0600). A missing file
// or missing key falls back to parseSinceKst(fallbackSpec).

import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { paths, ensureDir } from "./config.mjs";
import { parseSinceKst, nowKst } from "./tz.mjs";

function stateFile() {
  return join(paths().CONFIG_DIR, "last-read.yaml");
}

export function loadLastRead() {
  const file = stateFile();
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, "utf8");
  const parsed = YAML.parse(raw) || {};
  return parsed.last_read || {};
}

export function getLastRead(key, fallbackSpec = "7d") {
  const state = loadLastRead();
  const iso = state[key];
  if (iso) return iso;
  return parseSinceKst(fallbackSpec);
}

export function setLastRead(key, iso) {
  const file = stateFile();
  const current = existsSync(file)
    ? YAML.parse(readFileSync(file, "utf8")) || {}
    : {};
  current.last_read = current.last_read || {};
  current.last_read[key] = iso || nowKst();
  ensureDir(file);
  writeFileSync(file, YAML.stringify(current), { mode: 0o600 });
  chmodSync(file, 0o600);
}

// Pure helpers for testing: operate on a state object instead of disk.
export function getLastReadFrom(state, key, fallbackSpec = "7d") {
  const iso = state && state[key];
  if (iso) return iso;
  return parseSinceKst(fallbackSpec);
}

export function setLastReadIn(state, key, iso) {
  const next = { ...(state || {}) };
  next[key] = iso || nowKst();
  return next;
}

// Key builders — centralize the naming convention so callers don't drift.
export function stateKey(group, cmd, target) {
  const base = `${group}.${cmd}`;
  return target ? `${base}:${target}` : base;
}
