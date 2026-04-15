// Local cache layer — SSOT for msteams-fetch 0.4.0.
// Append-only jsonl partitioned by KST created-date: `data/{safeAlias}/{YYYY-MM-DD}.jsonl`.
// Read-time latest-wins merge reconciles edits and tombstones without compaction on the hot path.
//
// All timestamps in stored records are KST ISO (see tz.mjs). Never import `Date` directly here
// except for `mtime` reads via statSync — those are compared against wall-clock epochs only,
// never written as record fields.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync,
  appendFileSync,
  createReadStream,
} from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname, basename } from "node:path";
import {
  nowKst,
  kstDateString,
  parseSinceKst,
  kstIsoLt,
} from "./tz.mjs";

const INDEX_SCHEMA_VERSION = 1;

// ─── Paths ─────────────────────────────────────────────────────────────────

export function cachePaths(config) {
  const root = config.cache.dir;
  return {
    CACHE_DIR: root,
    DATA_DIR: join(root, "data"),
    LOGS_DIR: join(root, "logs"),
    INDEX_FILE: join(root, "index.json"),
    LOCK_FILE: config.cache.sync_lock_path,
  };
}

// Filesystem-safe alias (mirrors cli.mjs rules but scoped to cache).
export function safeAlias(name) {
  return String(name).replace(/[^\w\uAC00-\uD7A3-]/g, "_");
}

export function partitionPath(config, alias, kstDate) {
  return join(cachePaths(config).DATA_DIR, safeAlias(alias), `${kstDate}.jsonl`);
}

function aliasDir(config, alias) {
  return join(cachePaths(config).DATA_DIR, safeAlias(alias));
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

// ─── Index (metadata) ──────────────────────────────────────────────────────

export function loadIndex(config) {
  const { INDEX_FILE, CACHE_DIR } = cachePaths(config);
  if (!existsSync(INDEX_FILE)) {
    ensureDir(CACHE_DIR);
    return {
      schema_version: INDEX_SCHEMA_VERSION,
      chats: { delta_link: null, last_sync_at: null, last_error: null },
      channels: {},
      partitions: {}, // { [safeAlias]: [kstDate...] }
      last_compacted_at: {}, // { [safeAlias]: { [kstDate]: kstIso } }
    };
  }
  const raw = readFileSync(INDEX_FILE, "utf8");
  const parsed = JSON.parse(raw);
  parsed.chats ||= { delta_link: null, last_sync_at: null, last_error: null };
  parsed.channels ||= {};
  parsed.partitions ||= {};
  parsed.last_compacted_at ||= {};
  return parsed;
}

export function saveIndex(config, index) {
  const { INDEX_FILE, CACHE_DIR } = cachePaths(config);
  ensureDir(CACHE_DIR);
  const tmp = `${INDEX_FILE}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(index, null, 2));
  renameSync(tmp, INDEX_FILE);
}

// ─── Append-only writes ────────────────────────────────────────────────────

// records: [{ id, alias?, created (kst iso), modified (kst iso), ... }, ...]
// Groups by KST created-date, appends to corresponding partition file, updates index.partitions.
// Returns { written: N, partitions: {date: count, ...} }.
export function appendRecords(config, alias, records, { index } = {}) {
  if (!records || records.length === 0) {
    return { written: 0, partitions: {} };
  }
  const ownIndex = index || loadIndex(config);
  const safe = safeAlias(alias);
  ensureDir(aliasDir(config, alias));

  const groups = new Map(); // kstDate → lines[]
  const ingested = nowKst();
  for (const r of records) {
    if (!r.id || !r.created) {
      throw new Error(
        `appendRecords: record missing id/created: ${JSON.stringify(r).slice(0, 120)}`,
      );
    }
    const date = kstDateString(r.created);
    const enriched = { ...r, alias, ingested_at: r.ingested_at || ingested };
    const line = JSON.stringify(enriched);
    const arr = groups.get(date) || [];
    arr.push(line);
    groups.set(date, arr);
  }

  const counts = {};
  for (const [date, lines] of groups) {
    const file = partitionPath(config, alias, date);
    appendFileSync(file, lines.join("\n") + "\n");
    counts[date] = lines.length;
  }

  // Update index.partitions[safe] ← union of existing + new dates.
  const existing = new Set(ownIndex.partitions[safe] || []);
  for (const d of groups.keys()) existing.add(d);
  ownIndex.partitions[safe] = [...existing].sort();

  if (!index) {
    // Caller didn't pass an index to mutate → persist immediately.
    saveIndex(config, ownIndex);
  }

  return { written: records.length, partitions: counts };
}

// Construct a tombstone record for a deleted message.
// Caller passes the original created KST iso so the tombstone lands in the same partition.
export function tombstoneRecord({ id, alias, createdKst, deletedKst }) {
  return {
    id,
    alias,
    tombstone: true,
    created: createdKst,
    deleted_at: deletedKst || nowKst(),
  };
}

// ─── Partition listing ─────────────────────────────────────────────────────

// Returns sorted list of KST date strings that have partition files for this alias
// and fall within [sinceDate, untilDate] inclusive. Either bound may be null.
// Uses index.partitions when available, falls back to directory scan.
export function listPartitions(config, alias, sinceDate, untilDate, { index } = {}) {
  const safe = safeAlias(alias);
  let dates = [];
  const idx = index || loadIndex(config);
  const tracked = idx.partitions[safe];
  if (tracked && tracked.length > 0) {
    dates = [...tracked];
  } else {
    // Directory scan fallback.
    const dir = aliasDir(config, alias);
    if (existsSync(dir)) {
      dates = readdirSync(dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .map((f) => f.slice(0, 10));
    }
  }
  return dates
    .filter((d) => (sinceDate ? d >= sinceDate : true))
    .filter((d) => (untilDate ? d <= untilDate : true))
    .sort();
}

// ─── Reads ─────────────────────────────────────────────────────────────────

// readRange: stream each partition file, apply latest-wins merge, filter by created range.
// Options:
//   - since, until: KST ISO strings (inclusive), either may be null
//   - includeDeleted: boolean, default false
// Returns { messages: [...], tombstones: [...] }. Messages sorted by created ascending.
export async function readRange(
  config,
  alias,
  { since = null, until = null, includeDeleted = false, index = null } = {},
) {
  const sinceDate = since ? kstDateString(since) : null;
  const untilDate = until ? kstDateString(until) : null;
  const partitions = listPartitions(config, alias, sinceDate, untilDate, { index });

  const merged = new Map(); // id → record (latest-wins)
  const tombstoneIds = new Set();
  const tombstoneRecs = [];

  for (const date of partitions) {
    const file = partitionPath(config, alias, date);
    if (!existsSync(file)) continue;
    await forEachLine(file, (line) => {
      if (!line) return;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        // Corrupt line — skip but keep going.
        return;
      }
      if (rec.tombstone) {
        tombstoneIds.add(rec.id);
        tombstoneRecs.push(rec);
        return;
      }
      const prev = merged.get(rec.id);
      if (!prev || isNewer(rec, prev)) {
        merged.set(rec.id, rec);
      }
    });
  }

  // Apply tombstones.
  if (!includeDeleted) {
    for (const id of tombstoneIds) merged.delete(id);
  }

  // Range filter on created (not partition date, to be precise about partition boundaries).
  const messages = [];
  for (const rec of merged.values()) {
    if (since && kstIsoLt(rec.created, since)) continue;
    if (until && kstIsoLt(until, rec.created)) continue;
    messages.push(rec);
  }
  messages.sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));

  return { messages, tombstones: tombstoneRecs };
}

function isNewer(a, b) {
  const am = a.modified || a.created;
  const bm = b.modified || b.created;
  return am > bm;
}

function forEachLine(file, fn) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => fn(line));
    rl.on("close", resolve);
    rl.on("error", reject);
  });
}

// ─── Pure merge ────────────────────────────────────────────────────────────

// Latest-wins merge over an in-memory array. Exposed for tests and compaction.
export function latestWinsMerge(records) {
  const out = new Map();
  const tombstoneIds = new Set();
  for (const rec of records) {
    if (rec.tombstone) {
      tombstoneIds.add(rec.id);
      continue;
    }
    const prev = out.get(rec.id);
    if (!prev || isNewer(rec, prev)) {
      out.set(rec.id, rec);
    }
  }
  for (const id of tombstoneIds) out.delete(id);
  return out;
}

// ─── Compaction ────────────────────────────────────────────────────────────

// Rewrite a single partition file with latest-wins merged records + tombstones preserved
// (tombstones remain for audit and for --show-deleted reads).
export async function compactPartition(config, alias, date) {
  const file = partitionPath(config, alias, date);
  if (!existsSync(file)) {
    return { alias, date, status: "missing" };
  }
  const all = [];
  await forEachLine(file, (line) => {
    if (!line) return;
    try {
      all.push(JSON.parse(line));
    } catch { /* skip corrupt */ }
  });

  const tombstones = all.filter((r) => r.tombstone);
  const liveMap = latestWinsMerge(all);

  // Preserve tombstones so future reads can still hide/reveal deleted messages correctly.
  const finalLines = [
    ...[...liveMap.values()].map((r) => JSON.stringify(r)),
    ...dedupeTombstones(tombstones).map((r) => JSON.stringify(r)),
  ];

  const compactedTs = nowKst().replace(/[:.]/g, "-");
  const backup = `${file}.bak.${compactedTs}`;
  renameSync(file, backup);
  writeFileSync(file, finalLines.join("\n") + (finalLines.length ? "\n" : ""));

  const index = loadIndex(config);
  const safe = safeAlias(alias);
  index.last_compacted_at[safe] ||= {};
  index.last_compacted_at[safe][date] = nowKst();
  saveIndex(config, index);

  return {
    alias,
    date,
    status: "compacted",
    before: all.length,
    after: finalLines.length,
    backup,
  };
}

function dedupeTombstones(tombstones) {
  const seen = new Set();
  const out = [];
  for (const t of tombstones) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

// ─── Garbage collection ────────────────────────────────────────────────────

// Deletes partition files older than retention_days, .bak files > 7 days, and
// `~/tmp/teams-context/` files > cache_retention_days. Log files > log_retention_days.
// Returns a dry-run friendly report.
export function runGc(config, { dryRun = false } = {}) {
  const { DATA_DIR, LOGS_DIR } = cachePaths(config);
  const retentionMs = config.cache.retention_days * 86_400_000;
  const backupRetentionMs = 7 * 86_400_000;
  const logRetentionMs = config.cache.log_retention_days * 86_400_000;
  const outputDir = config.output?.dir;

  const now = Date.now();
  const actions = {
    partitions_deleted: [],
    backups_deleted: [],
    logs_deleted: [],
    output_deleted: [],
  };

  // Partitions: delete files whose mtime > retention.
  if (existsSync(DATA_DIR)) {
    for (const aliasDirName of readdirSync(DATA_DIR)) {
      const aliasPath = join(DATA_DIR, aliasDirName);
      if (!isDir(aliasPath)) continue;
      for (const file of readdirSync(aliasPath)) {
        const full = join(aliasPath, file);
        if (isSymlink(full)) continue;
        const age = now - statSync(full).mtimeMs;
        if (file.endsWith(".jsonl") && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) {
          if (age > retentionMs) {
            actions.partitions_deleted.push(full);
            if (!dryRun) unlinkSync(full);
          }
        } else if (file.includes(".bak.")) {
          if (age > backupRetentionMs) {
            actions.backups_deleted.push(full);
            if (!dryRun) unlinkSync(full);
          }
        }
      }
    }
  }

  // Logs.
  if (existsSync(LOGS_DIR)) {
    for (const file of readdirSync(LOGS_DIR)) {
      const full = join(LOGS_DIR, file);
      if (isSymlink(full)) continue;
      const age = now - statSync(full).mtimeMs;
      if (age > logRetentionMs) {
        actions.logs_deleted.push(full);
        if (!dryRun) unlinkSync(full);
      }
    }
  }

  // User-visible output dir.
  if (outputDir && existsSync(outputDir) && isSafeOutputDir(outputDir)) {
    for (const file of readdirSync(outputDir)) {
      const full = join(outputDir, file);
      if (isSymlink(full)) continue;
      if (!isDir(full)) {
        const age = now - statSync(full).mtimeMs;
        if (age > retentionMs) {
          actions.output_deleted.push(full);
          if (!dryRun) unlinkSync(full);
        }
      }
    }
  }

  // After deletions, prune index.partitions of dates with no surviving file.
  if (!dryRun && actions.partitions_deleted.length > 0) {
    const index = loadIndex(config);
    for (const deleted of actions.partitions_deleted) {
      const parent = basename(dirname(deleted));
      const date = basename(deleted, ".jsonl");
      const arr = index.partitions[parent];
      if (arr) {
        index.partitions[parent] = arr.filter((d) => d !== date);
      }
    }
    saveIndex(config, index);
  }

  return { dryRun, ...actions };
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function isSymlink(p) {
  try { return statSync(p, { throwIfNoEntry: false })?.isSymbolicLink?.() || false; } catch { return false; }
}

function isSafeOutputDir(p) {
  // Belt-and-suspenders: never GC something that isn't clearly ours.
  return p.includes("teams-context") || p.includes("msteams-fetch");
}
