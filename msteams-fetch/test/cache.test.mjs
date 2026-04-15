import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, statSync, utimesSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cachePaths,
  loadIndex,
  saveIndex,
  appendRecords,
  listPartitions,
  readRange,
  latestWinsMerge,
  compactPartition,
  runGc,
  tombstoneRecord,
  partitionPath,
  safeAlias,
} from "../scripts/cache.mjs";
import { toKst, nowKst } from "../scripts/tz.mjs";

let tmpRoot;
let config;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "msteams-cache-test-"));
  config = {
    cache: {
      dir: join(tmpRoot, "cache"),
      retention_days: 30,
      log_retention_days: 14,
      sync_lock_path: join(tmpRoot, "cache", "sync.lock"),
      seed_since: "30d",
    },
    output: { dir: join(tmpRoot, "teams-context") },
  };
});

after(() => {
  // Best-effort cleanup of leftover dirs from any failed runs.
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function fixture(id, createdKst, extra = {}) {
  return {
    id,
    type: "channel",
    created: createdKst,
    modified: extra.modified || createdKst,
    from: { id: "u1", displayName: "Silee" },
    body_html: extra.body || `msg ${id}`,
    ...extra,
  };
}

test("loadIndex: returns empty skeleton when no file", () => {
  const idx = loadIndex(config);
  assert.equal(idx.schema_version, 1);
  assert.deepEqual(idx.channels, {});
  assert.deepEqual(idx.partitions, {});
  assert.equal(idx.chats.delta_link, null);
});

test("saveIndex / loadIndex round-trip", () => {
  const idx = loadIndex(config);
  idx.channels["foo"] = { delta_link: "L1", last_sync_at: "2026-04-15T08:00:00.000+09:00" };
  saveIndex(config, idx);
  const reloaded = loadIndex(config);
  assert.equal(reloaded.channels.foo.delta_link, "L1");
});

test("appendRecords: single partition round-trip via readRange", async () => {
  const alias = "connect-hub-dev";
  const records = [
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
    fixture("m2", "2026-04-13T10:30:00.000+09:00"),
  ];
  const stat = appendRecords(config, alias, records);
  assert.equal(stat.written, 2);
  assert.deepEqual(Object.keys(stat.partitions), ["2026-04-13"]);

  const { messages } = await readRange(config, alias, {});
  assert.equal(messages.length, 2);
  assert.equal(messages[0].id, "m1");
  assert.equal(messages[0].alias, alias); // alias is stamped on write
  assert.ok(messages[0].ingested_at.endsWith("+09:00"));
});

test("appendRecords: fan-out by created-date into multiple partitions", async () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
    fixture("m2", "2026-04-14T00:05:00.000+09:00"),
    fixture("m3", "2026-04-15T23:59:59.000+09:00"),
  ]);

  const p13 = partitionPath(config, alias, "2026-04-13");
  const p14 = partitionPath(config, alias, "2026-04-14");
  const p15 = partitionPath(config, alias, "2026-04-15");
  assert.ok(existsSync(p13) && existsSync(p14) && existsSync(p15));

  const idx = loadIndex(config);
  assert.deepEqual(idx.partitions[safeAlias(alias)], ["2026-04-13", "2026-04-14", "2026-04-15"]);

  const { messages } = await readRange(config, alias, {});
  assert.equal(messages.length, 3);
});

test("UTC-boundary: message at UTC 2026-04-12T15:00:00Z lands in 2026-04-13 partition", async () => {
  const alias = "chan-a";
  const kst = toKst("2026-04-12T15:00:00.000Z"); // = 2026-04-13T00:00:00+09:00
  appendRecords(config, alias, [fixture("m1", kst)]);
  const dates = listPartitions(config, alias, null, null);
  assert.deepEqual(dates, ["2026-04-13"]);
});

test("latestWinsMerge: duplicate id → latest modified wins", () => {
  const out = latestWinsMerge([
    fixture("m1", "2026-04-13T09:00:00.000+09:00", { body: "v1" }),
    fixture("m1", "2026-04-13T09:00:00.000+09:00", {
      modified: "2026-04-13T09:30:00.000+09:00",
      body: "v2",
    }),
  ]);
  assert.equal(out.size, 1);
  assert.equal(out.get("m1").body_html, "v2");
});

test("latestWinsMerge: tombstone removes id", () => {
  const out = latestWinsMerge([
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
    tombstoneRecord({
      id: "m1",
      alias: "chan-a",
      createdKst: "2026-04-13T09:00:00.000+09:00",
      deletedKst: "2026-04-13T10:00:00.000+09:00",
    }),
  ]);
  assert.equal(out.size, 0);
});

test("readRange: tombstone hidden by default, visible with includeDeleted", async () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
    fixture("m2", "2026-04-13T10:00:00.000+09:00"),
    tombstoneRecord({
      id: "m1",
      alias,
      createdKst: "2026-04-13T09:00:00.000+09:00",
      deletedKst: "2026-04-13T11:00:00.000+09:00",
    }),
  ]);
  const hidden = await readRange(config, alias, {});
  assert.deepEqual(hidden.messages.map((m) => m.id), ["m2"]);
  assert.equal(hidden.tombstones.length, 1);

  const shown = await readRange(config, alias, { includeDeleted: true });
  // includeDeleted retains the live (non-tombstone) record for m1 that still exists in the jsonl
  assert.ok(shown.messages.some((m) => m.id === "m1"));
});

test("readRange: since/until filter is strict on created", async () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
    fixture("m2", "2026-04-14T09:00:00.000+09:00"),
    fixture("m3", "2026-04-15T09:00:00.000+09:00"),
  ]);
  const { messages } = await readRange(config, alias, {
    since: "2026-04-14T00:00:00.000+09:00",
    until: "2026-04-14T23:59:59.999+09:00",
  });
  assert.deepEqual(messages.map((m) => m.id), ["m2"]);
});

test("readRange: modification in later partition updates earlier-created record", async () => {
  const alias = "chan-a";
  // Message created on 4/13 gets modified on 4/15 — the modification record's partition
  // is determined by the ORIGINAL created date, so it appends back to 4/13.jsonl.
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00", { body: "v1" }),
  ]);
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00", {
      modified: "2026-04-15T10:00:00.000+09:00",
      body: "v2-edited",
    }),
  ]);
  const { messages } = await readRange(config, alias, {});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body_html, "v2-edited");
});

test("listPartitions: index-based + date range filter", () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
    fixture("m2", "2026-04-14T09:00:00.000+09:00"),
    fixture("m3", "2026-04-15T09:00:00.000+09:00"),
  ]);
  const all = listPartitions(config, alias, null, null);
  assert.deepEqual(all, ["2026-04-13", "2026-04-14", "2026-04-15"]);

  const scoped = listPartitions(config, alias, "2026-04-14", "2026-04-14");
  assert.deepEqual(scoped, ["2026-04-14"]);
});

test("listPartitions: directory-scan fallback when index empty", () => {
  // Manually place a partition file without updating index.
  const alias = "chan-raw";
  const safe = safeAlias(alias);
  const dir = join(config.cache.dir, "data", safe);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "2026-04-13.jsonl"), "");
  const dates = listPartitions(config, alias, null, null);
  assert.deepEqual(dates, ["2026-04-13"]);
});

test("compactPartition: dedupes + preserves single tombstone + creates .bak", async () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00", { body: "v1" }),
    fixture("m1", "2026-04-13T09:00:00.000+09:00", {
      modified: "2026-04-13T09:30:00.000+09:00",
      body: "v2",
    }),
    fixture("m2", "2026-04-13T10:00:00.000+09:00"),
    tombstoneRecord({
      id: "m2",
      alias,
      createdKst: "2026-04-13T10:00:00.000+09:00",
    }),
  ]);
  const result = await compactPartition(config, alias, "2026-04-13");
  assert.equal(result.status, "compacted");
  assert.equal(result.before, 4);
  // After: m1 (latest) + tombstone for m2 (m2 live record dropped by latestWins tombstone)
  assert.equal(result.after, 2);

  // .bak exists
  const dir = join(config.cache.dir, "data", safeAlias(alias));
  const baks = readdirSync(dir).filter((f) => f.includes(".bak."));
  assert.equal(baks.length, 1);
});

test("runGc: deletes partition files older than retention + prunes index", () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", "2026-04-13T09:00:00.000+09:00"),
  ]);
  const file = partitionPath(config, alias, "2026-04-13");
  // Backdate the file's mtime to 40 days ago (retention 30).
  const ancientEpoch = Date.now() / 1000 - 40 * 86400;
  utimesSync(file, ancientEpoch, ancientEpoch);

  const dry = runGc(config, { dryRun: true });
  assert.equal(dry.partitions_deleted.length, 1);
  assert.ok(existsSync(file)); // still there

  const real = runGc(config, { dryRun: false });
  assert.equal(real.partitions_deleted.length, 1);
  assert.ok(!existsSync(file));

  const idx = loadIndex(config);
  assert.deepEqual(idx.partitions[safeAlias(alias)] || [], []);
});

test("runGc: leaves fresh partition alone", () => {
  const alias = "chan-a";
  appendRecords(config, alias, [
    fixture("m1", nowKst()),
  ]);
  const before = runGc(config, { dryRun: true });
  assert.equal(before.partitions_deleted.length, 0);
});

test("runGc: bak files older than 7 days deleted", () => {
  const alias = "chan-a";
  const dir = join(config.cache.dir, "data", safeAlias(alias));
  mkdirSync(dir, { recursive: true });
  const bak = join(dir, "2026-04-01.jsonl.bak.old");
  writeFileSync(bak, "x");
  const ancient = Date.now() / 1000 - 10 * 86400;
  utimesSync(bak, ancient, ancient);

  const r = runGc(config, { dryRun: false });
  assert.equal(r.backups_deleted.length, 1);
  assert.ok(!existsSync(bak));
});

test("cachePaths: uses config.cache.dir", () => {
  const p = cachePaths(config);
  assert.equal(p.DATA_DIR, join(config.cache.dir, "data"));
  assert.equal(p.INDEX_FILE, join(config.cache.dir, "index.json"));
});

test("appendRecords: missing id throws", () => {
  assert.throws(() => appendRecords(config, "a", [{ created: nowKst() }]), /missing id/);
});

test("safeAlias: preserves hangul, replaces other chars", () => {
  assert.equal(safeAlias("connect-hub-dev"), "connect-hub-dev");
  assert.equal(safeAlias("팀 채널/테스트"), "팀_채널_테스트");
});
