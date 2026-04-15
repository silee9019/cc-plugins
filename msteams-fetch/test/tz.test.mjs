import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nowKst,
  toKst,
  toUtcForGraph,
  kstDateString,
  parseSinceKst,
  kstIsoLt,
  kstIsoMax,
} from "../scripts/tz.mjs";

test("toKst: UTC Z → KST with +09:00 offset", () => {
  const result = toKst("2026-04-12T15:00:00.000Z");
  assert.equal(result, "2026-04-13T00:00:00.000+09:00");
});

test("toKst: already-KST string is normalized idempotently", () => {
  const first = toKst("2026-04-13T00:00:00.000+09:00");
  const second = toKst(first);
  assert.equal(first, "2026-04-13T00:00:00.000+09:00");
  assert.equal(first, second);
});

test("toKst: Date instance", () => {
  const d = new Date("2026-04-12T15:00:00.000Z");
  assert.equal(toKst(d), "2026-04-13T00:00:00.000+09:00");
});

test("toKst: rejects naive ISO string without offset", () => {
  assert.throws(() => toKst("2026-04-13T00:00:00"), /timezone offset/);
});

test("toKst: rejects invalid types", () => {
  assert.throws(() => toKst(12345), /expected Date or ISO string/);
  assert.throws(() => toKst("not-a-date+09:00"), /invalid ISO/);
});

test("toUtcForGraph: KST ISO → Z form", () => {
  assert.equal(
    toUtcForGraph("2026-04-13T00:00:00.000+09:00"),
    "2026-04-12T15:00:00.000Z",
  );
});

test("toUtcForGraph: round-trip with toKst preserves instant", () => {
  const kst = "2026-04-15T08:32:17.123+09:00";
  const utc = toUtcForGraph(kst);
  assert.equal(toKst(utc), kst);
});

test("kstDateString: extracts YYYY-MM-DD from KST ISO", () => {
  assert.equal(kstDateString("2026-04-13T00:00:00.000+09:00"), "2026-04-13");
  assert.equal(kstDateString("2026-04-15T23:59:59.999+09:00"), "2026-04-15");
});

test("kstDateString: boundary case — midnight KST is still that day", () => {
  // 2026-04-12T15:00:00Z === 2026-04-13T00:00:00+09:00 → date is 2026-04-13 (not 04-12)
  const kst = toKst("2026-04-12T15:00:00.000Z");
  assert.equal(kstDateString(kst), "2026-04-13");
});

test("kstDateString: UTC-boundary message stays in its KST day", () => {
  // A message sent at UTC 2026-04-13T14:59:59Z is KST 2026-04-13T23:59:59+09:00
  const kst = toKst("2026-04-13T14:59:59.000Z");
  assert.equal(kstDateString(kst), "2026-04-13");
  // One second later crosses to next KST day
  const kstNext = toKst("2026-04-13T15:00:00.000Z");
  assert.equal(kstDateString(kstNext), "2026-04-14");
});

test("kstDateString: rejects short input", () => {
  assert.throws(() => kstDateString("202"), /invalid KST ISO/);
});

test("parseSinceKst: relative 2h returns KST ISO ~2 hours ago", () => {
  const result = parseSinceKst("2h");
  assert.match(result, /\+09:00$/);
  const now = new Date().getTime();
  const parsed = new Date(result).getTime();
  const diffMs = now - parsed;
  // ~2 hours ± 5 seconds slack
  assert.ok(Math.abs(diffMs - 7_200_000) < 5_000, `diff ${diffMs} not near 2h`);
});

test("parseSinceKst: relative 7d", () => {
  const result = parseSinceKst("7d");
  assert.match(result, /\+09:00$/);
  const diffMs = new Date().getTime() - new Date(result).getTime();
  assert.ok(Math.abs(diffMs - 604_800_000) < 5_000);
});

test("parseSinceKst: absolute date becomes KST midnight", () => {
  assert.equal(
    parseSinceKst("2026-04-13"),
    "2026-04-13T00:00:00.000+09:00",
  );
});

test("parseSinceKst: accepts full ISO with offset", () => {
  assert.equal(
    parseSinceKst("2026-04-13T09:30:00+09:00"),
    "2026-04-13T09:30:00.000+09:00",
  );
  // UTC Z gets normalized to KST
  assert.equal(
    parseSinceKst("2026-04-12T15:00:00Z"),
    "2026-04-13T00:00:00.000+09:00",
  );
});

test("parseSinceKst: rejects unsupported forms", () => {
  assert.throws(() => parseSinceKst("yesterday"), /unsupported format/);
  assert.throws(() => parseSinceKst("2h30m"), /unsupported format/);
  assert.throws(() => parseSinceKst(""), /spec required/);
});

test("nowKst: returns KST-offset ISO", () => {
  const result = nowKst();
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/);
});

test("kstIsoLt / kstIsoMax: lexicographic ordering matches chronology", () => {
  const a = "2026-04-13T00:00:00.000+09:00";
  const b = "2026-04-13T09:30:00.000+09:00";
  assert.equal(kstIsoLt(a, b), true);
  assert.equal(kstIsoLt(b, a), false);
  assert.equal(kstIsoMax(a, b), b);
  assert.equal(kstIsoMax(b, a), b);
});
