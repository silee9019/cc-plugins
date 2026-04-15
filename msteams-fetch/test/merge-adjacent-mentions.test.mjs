import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAdjacentMentions } from "../scripts/render.mjs";

// Helper: craft a mention entry matching Graph API shape.
function mkMention(id, userId, displayName, mentionText) {
  return {
    id,
    mentionText,
    mentioned: { user: { id: userId, displayName } },
  };
}

test("rule 1: same user id — merges to displayName", () => {
  const html = 'hi <at id="0">Sangin</at> <at id="1">Lee</at> there';
  const mentions = [
    mkMention(0, "u-1", "Sangin Lee", "Sangin"),
    mkMention(1, "u-1", "Sangin Lee", "Lee"),
  ];
  const { html: out } = mergeAdjacentMentions(html, mentions);
  assert.match(out, /<at id="0">Sangin Lee<\/at>/);
  assert.doesNotMatch(out, /<at id="1"/);
});

test("rule 2: different ids but displayName tokens match — merges", () => {
  const html = '<at id="0">상인</at><at id="1">이</at>';
  const mentions = [
    mkMention(0, "u-1", "상인 이", "상인"),
    mkMention(1, "u-2", "홍길동", "이"),
  ];
  const { html: out } = mergeAdjacentMentions(html, mentions);
  assert.match(out, /<at id="0">상인 이<\/at>/);
});

test("rule 3: mismatched tokens — leave untouched", () => {
  const html = '<at id="0">Alice</at> <at id="1">Bob</at>';
  const mentions = [
    mkMention(0, "u-1", "Alice Cooper", "Alice"),
    mkMention(1, "u-2", "Bob Marley", "Bob"),
  ];
  const { html: out } = mergeAdjacentMentions(html, mentions);
  assert.equal(out, html);
});

test("single mention — noop", () => {
  const html = 'hello <at id="0">Alice</at>';
  const mentions = [mkMention(0, "u-1", "Alice Cooper", "Alice")];
  const { html: out } = mergeAdjacentMentions(html, mentions);
  assert.equal(out, html);
});

test("three adjacent same-user mentions collapse left-to-right", () => {
  const html = '<at id="0">A</at> <at id="1">B</at> <at id="2">C</at>';
  const mentions = [
    mkMention(0, "u-1", "A B C", "A"),
    mkMention(1, "u-1", "A B C", "B"),
    mkMention(2, "u-1", "A B C", "C"),
  ];
  const { html: out } = mergeAdjacentMentions(html, mentions);
  // After passes: (A+B)=id0 → then id0+C=id0
  assert.match(out, /<at id="0">A B C<\/at>/);
  assert.doesNotMatch(out, /<at id="1"/);
  assert.doesNotMatch(out, /<at id="2"/);
});

test("empty/null inputs are safe", () => {
  assert.deepEqual(mergeAdjacentMentions("", []), { html: "", mentions: [] });
  assert.deepEqual(mergeAdjacentMentions(null, null), { html: "", mentions: [] });
});
