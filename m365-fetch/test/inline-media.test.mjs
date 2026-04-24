import { test } from "node:test";
import assert from "node:assert/strict";
import { extractInlineMedia } from "../scripts/render.mjs";

test("video tag with hostedContents src is extracted", () => {
  const html =
    '<p><video src="https://graph.microsoft.com/v1.0/chats/X/messages/Y/hostedContents/Z/$value" width="1280" height="720" data-duration="PT16S" alt="미디어"></video></p>';
  const media = extractInlineMedia(html);
  assert.equal(media.length, 1);
  assert.equal(media[0].kind, "video");
  assert.match(media[0].url, /hostedContents\/Z\/\$value$/);
  assert.equal(media[0].meta, "1280x720, PT16S");
});

test("audio tag is extracted", () => {
  const html =
    '<audio src="https://graph.microsoft.com/v1.0/chats/X/messages/Y/hostedContents/A/$value"></audio>';
  const media = extractInlineMedia(html);
  assert.equal(media.length, 1);
  assert.equal(media[0].kind, "audio");
});

test("img with hostedContents is extracted, other images are skipped", () => {
  const html =
    '<img src="https://example.com/foo.png"> and ' +
    '<img src="https://graph.microsoft.com/v1.0/teams/T/channels/C/messages/M/hostedContents/H/$value">';
  const media = extractInlineMedia(html);
  assert.equal(media.length, 1);
  assert.equal(media[0].kind, "img");
  assert.match(media[0].url, /hostedContents\/H\/\$value$/);
});

test("no media returns empty array", () => {
  assert.deepEqual(extractInlineMedia("<p>hello</p>"), []);
  assert.deepEqual(extractInlineMedia(""), []);
  assert.deepEqual(extractInlineMedia(null), []);
});

test("multiple media tags are all captured in order", () => {
  const html =
    '<video src="https://graph.microsoft.com/v1.0/a/hostedContents/1/$value"></video>' +
    '<img src="https://graph.microsoft.com/v1.0/b/hostedContents/2/$value">';
  const media = extractInlineMedia(html);
  assert.equal(media.length, 2);
  assert.equal(media[0].kind, "video");
  assert.equal(media[1].kind, "img");
});
