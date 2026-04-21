import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMailInbox, renderMailMessage } from "../scripts/mail.mjs";

function sampleMessage(overrides = {}) {
  return {
    id: "msg1",
    subject: "Weekly digest",
    receivedDateTime: "2026-04-21T00:15:00.0000000",
    from: { emailAddress: { name: "Alice", address: "alice@example.com" } },
    toRecipients: [{ emailAddress: { name: "Me", address: "me@example.com" } }],
    ccRecipients: [],
    hasAttachments: false,
    bodyPreview: "Top items this week...",
    body: { contentType: "text", content: "Top items this week: A, B, C" },
    webLink: "https://outlook.office.com/mail/item/1",
    ...overrides,
  };
}

test("renderMailInbox: empty returns placeholder", () => {
  const out = renderMailInbox({
    meta: { folder: "inbox", range: "r", fetched_at: "t" },
    messages: [],
  });
  assert.match(out, /해당 범위에 메일 없음/);
  assert.match(out, /source: outlook-mail/);
});

test("renderMailInbox: single text message renders KST date/time + subject link", () => {
  const out = renderMailInbox({
    meta: { folder: "inbox", range: "2026-04-20 ~ 2026-04-21", fetched_at: "t" },
    messages: [sampleMessage()],
  });
  // 00:15 UTC → 09:15 KST on 2026-04-21
  assert.match(out, /## 2026-04-21/);
  assert.match(out, /### 09:15 - \[Weekly digest\]\(https:\/\/outlook\.office\.com/);
  assert.match(out, /From: Alice <alice@example\.com>/);
  assert.match(out, /To: Me/);
  assert.match(out, /Top items this week: A, B, C/);
});

test("renderMailInbox: HTML body converted to markdown", () => {
  const out = renderMailInbox({
    meta: { folder: "inbox", range: "x", fetched_at: "y" },
    messages: [
      sampleMessage({
        body: { contentType: "html", content: "<p>Hi <strong>team</strong>!</p>" },
      }),
    ],
  });
  assert.match(out, /Hi \*\*team\*\*!/);
});

test("renderMailInbox: hasAttachments shows 📎 marker", () => {
  const out = renderMailInbox({
    meta: { folder: "inbox", range: "x", fetched_at: "y" },
    messages: [sampleMessage({ hasAttachments: true })],
  });
  assert.match(out, /📎 첨부 있음/);
});

test("renderMailInbox: body empty falls back to bodyPreview", () => {
  const out = renderMailInbox({
    meta: { folder: "inbox", range: "x", fetched_at: "y" },
    messages: [
      sampleMessage({
        body: { contentType: "text", content: "" },
        bodyPreview: "preview only",
      }),
    ],
  });
  assert.match(out, /preview only/);
});

test("renderMailMessage: attachments block lists names + size", () => {
  const out = renderMailMessage({
    meta: { fetched_at: "t" },
    message: sampleMessage({
      hasAttachments: true,
      attachments: [
        { name: "report.pdf", size: 124_880 },
        { name: "spec.docx", size: 48_000 },
      ],
    }),
  });
  assert.match(out, /📎 report\.pdf \(122KB\)/);
  assert.match(out, /📎 spec\.docx \(47KB\)/);
});
