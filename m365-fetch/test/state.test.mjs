import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLastReadFrom,
  setLastReadIn,
  stateKey,
} from "../scripts/state.mjs";

test("getLastReadFrom: returns stored iso when key present", () => {
  const state = { "teams.fetch:my-alias": "2026-04-20T10:00:00.000+09:00" };
  assert.equal(
    getLastReadFrom(state, "teams.fetch:my-alias"),
    "2026-04-20T10:00:00.000+09:00",
  );
});

test("getLastReadFrom: missing key falls back to 7d KST ISO", () => {
  const iso = getLastReadFrom({}, "calendar.events", "7d");
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/);
});

test("getLastReadFrom: null state is safe", () => {
  const iso = getLastReadFrom(null, "mail.inbox:inbox");
  assert.match(iso, /\+09:00$/);
});

test("setLastReadIn: returns new object with key set", () => {
  const before = { "teams.inbox": "2026-04-19T09:00:00.000+09:00" };
  const after = setLastReadIn(before, "mail.inbox:inbox", "2026-04-21T09:00:00.000+09:00");
  assert.equal(after["teams.inbox"], "2026-04-19T09:00:00.000+09:00");
  assert.equal(after["mail.inbox:inbox"], "2026-04-21T09:00:00.000+09:00");
  assert.notStrictEqual(before, after);
});

test("setLastReadIn: omitted iso falls back to nowKst", () => {
  const after = setLastReadIn({}, "teams.fetch:x");
  assert.match(after["teams.fetch:x"], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/);
});

test("stateKey: base form without target", () => {
  assert.equal(stateKey("teams", "inbox"), "teams.inbox");
  assert.equal(stateKey("calendar", "events", undefined), "calendar.events");
});

test("stateKey: target-qualified form", () => {
  assert.equal(stateKey("teams", "fetch", "my-alias"), "teams.fetch:my-alias");
  assert.equal(stateKey("mail", "inbox", "sentitems"), "mail.inbox:sentitems");
  assert.equal(stateKey("flow", "runs", "MyFlowName"), "flow.runs:MyFlowName");
});
