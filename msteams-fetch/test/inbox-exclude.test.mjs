import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldIncludeChatInInbox } from "../scripts/config.mjs";

test("empty config includes everything", () => {
  const chat = { id: "19:abc", topic: "Random", chatType: "group" };
  const r = shouldIncludeChatInInbox(chat, {});
  assert.equal(r.include, true);
});

test("excludes chat by case-insensitive topic substring", () => {
  const chat = { id: "19:abc", topic: "😈 Connect PR방", chatType: "group" };
  const r = shouldIncludeChatInInbox(chat, { exclude_chat_topics: ["Connect PR방"] });
  assert.equal(r.include, false);
  assert.match(r.reason, /topic/);
});

test("excludes when chat_id matches exactly", () => {
  const chat = { id: "19:xyz", topic: "Some topic", chatType: "group" };
  const r = shouldIncludeChatInInbox(chat, { exclude_chat_ids: ["19:xyz"] });
  assert.equal(r.include, false);
  assert.equal(r.reason, "chat_id");
});

test("excludes by chat_type", () => {
  const chat = { id: "19:abc", topic: null, chatType: "oneOnOne" };
  const r = shouldIncludeChatInInbox(chat, { exclude_chat_types: ["oneOnOne"] });
  assert.equal(r.include, false);
  assert.equal(r.reason, "chat_type");
});

test("extra excludeIds parameter takes effect", () => {
  const chat = { id: "19:runtime", topic: "x", chatType: "group" };
  const r = shouldIncludeChatInInbox(chat, {}, ["19:runtime"]);
  assert.equal(r.include, false);
});

test("null topic is safe against topic exclusions", () => {
  const chat = { id: "19:abc", topic: null, chatType: "oneOnOne" };
  const r = shouldIncludeChatInInbox(chat, { exclude_chat_topics: ["anything"] });
  assert.equal(r.include, true);
});

test("partial topic match still excludes", () => {
  const chat = { id: "19:abc", topic: "PR방 for Connect monorepo", chatType: "group" };
  const r = shouldIncludeChatInInbox(chat, { exclude_chat_topics: ["pr방"] });
  assert.equal(r.include, false);
});
