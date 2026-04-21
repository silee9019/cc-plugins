import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceIsoRange } from "../scripts/tz.mjs";

const KST = "+09:00";

test("sliceIsoRange: equal since/until returns empty", () => {
  const iso = `2026-04-20T10:00:00.000${KST}`;
  assert.deepEqual(sliceIsoRange(iso, iso, 3), []);
});

test("sliceIsoRange: short range returns single window", () => {
  const since = `2026-04-20T10:00:00.000${KST}`;
  const until = `2026-04-21T10:00:00.000${KST}`;
  const slices = sliceIsoRange(since, until, 3);
  assert.equal(slices.length, 1);
  assert.equal(slices[0].sinceIso.slice(0, 10), "2026-04-20");
  assert.equal(slices[0].untilIso.slice(0, 10), "2026-04-21");
});

test("sliceIsoRange: 9 days chunked into 3-day windows yields 3 slices", () => {
  const since = `2026-04-01T00:00:00.000${KST}`;
  const until = `2026-04-10T00:00:00.000${KST}`;
  const slices = sliceIsoRange(since, until, 3);
  assert.equal(slices.length, 3);
  assert.equal(slices[0].sinceIso.slice(0, 10), "2026-04-01");
  assert.equal(slices[0].untilIso.slice(0, 10), "2026-04-04");
  assert.equal(slices[1].sinceIso.slice(0, 10), "2026-04-04");
  assert.equal(slices[1].untilIso.slice(0, 10), "2026-04-07");
  assert.equal(slices[2].sinceIso.slice(0, 10), "2026-04-07");
  assert.equal(slices[2].untilIso.slice(0, 10), "2026-04-10");
});

test("sliceIsoRange: 7 days with 3-day chunks has trailing partial window", () => {
  const since = `2026-04-01T00:00:00.000${KST}`;
  const until = `2026-04-08T00:00:00.000${KST}`;
  const slices = sliceIsoRange(since, until, 3);
  assert.equal(slices.length, 3);
  assert.equal(slices[2].sinceIso.slice(0, 10), "2026-04-07");
  assert.equal(slices[2].untilIso.slice(0, 10), "2026-04-08");
});

test("sliceIsoRange: windows cover the full range without gaps", () => {
  const since = `2026-04-01T00:00:00.000${KST}`;
  const until = `2026-04-15T00:00:00.000${KST}`;
  const slices = sliceIsoRange(since, until, 3);
  assert.equal(slices[0].sinceIso, since);
  assert.equal(slices.at(-1).untilIso, until);
  for (let i = 1; i < slices.length; i++) {
    assert.equal(slices[i].sinceIso, slices[i - 1].untilIso);
  }
});

test("sliceIsoRange: accepts UTC Z input and emits KST ISO windows", () => {
  const sinceUtc = "2026-04-01T00:00:00.000Z";
  const untilUtc = "2026-04-05T00:00:00.000Z";
  const slices = sliceIsoRange(sinceUtc, untilUtc, 3);
  assert.equal(slices.length, 2);
  for (const s of slices) {
    assert.match(s.sinceIso, /\+09:00$/);
    assert.match(s.untilIso, /\+09:00$/);
  }
});

test("sliceIsoRange: since > until throws", () => {
  const since = `2026-04-10T00:00:00.000${KST}`;
  const until = `2026-04-01T00:00:00.000${KST}`;
  assert.throws(() => sliceIsoRange(since, until, 3), /since .* > until/);
});

test("sliceIsoRange: maxDays < 1 throws", () => {
  const since = `2026-04-01T00:00:00.000${KST}`;
  const until = `2026-04-05T00:00:00.000${KST}`;
  assert.throws(() => sliceIsoRange(since, until, 0), /maxDays/);
  assert.throws(() => sliceIsoRange(since, until, 1.5), /maxDays/);
});

test("sliceIsoRange: maxDays=1 chunks daily", () => {
  const since = `2026-04-01T00:00:00.000${KST}`;
  const until = `2026-04-04T00:00:00.000${KST}`;
  const slices = sliceIsoRange(since, until, 1);
  assert.equal(slices.length, 3);
});
