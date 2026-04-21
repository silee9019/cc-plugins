// Outlook mail fetcher + markdown renderer.
//
// Scopes required:
//   - Mail.Read               (/me mailbox)
//   - Mail.Read.Shared        (shared mailboxes via /me/mailFolders/<id>)
//
// Inbox fetches are range-filtered on receivedDateTime; single-message `get`
// expands attachments. Body is converted HTML→markdown via render.mjs.

import YAML from "yaml";
import { graphGet } from "./graph.mjs";
import { fetchWithSlicing } from "./sliced-fetch.mjs";
import { toUtcForGraph, toKst } from "./tz.mjs";
import { htmlToMarkdown, formatKstDate, formatKstTime } from "./render.mjs";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function inboxBase(folder) {
  const id = folder || "inbox";
  return `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(id)}/messages`;
}

async function fetchWindow({ token, folder, sinceIso, untilIso, perPage }) {
  const filter = `receivedDateTime ge ${toUtcForGraph(sinceIso)} and receivedDateTime le ${toUtcForGraph(untilIso)}`;
  const params = new URLSearchParams({
    $filter: filter,
    $orderby: "receivedDateTime desc",
    $top: String(Math.min(perPage, 50)),
  });
  let url = `${inboxBase(folder)}?${params}`;
  const out = [];
  while (url) {
    const data = await graphGet(url, token);
    for (const m of data.value || []) out.push(m);
    url = data["@odata.nextLink"] || null;
  }
  return out;
}

export async function fetchMailInbox({
  token,
  folder = "inbox",
  sinceIso,
  untilIso,
  chunkDays = 3,
  limit = 500,
  perPage = 50,
}) {
  const messages = await fetchWithSlicing({
    sinceIso,
    untilIso,
    chunkDays,
    fetchOne: (w) =>
      fetchWindow({
        token,
        folder,
        sinceIso: w.sinceIso,
        untilIso: w.untilIso,
        perPage,
      }),
  });
  const seen = new Map();
  for (const m of messages) {
    if (!seen.has(m.id)) seen.set(m.id, m);
  }
  // Newest first for inbox skim.
  const out = [...seen.values()].sort((a, b) => {
    const ra = a.receivedDateTime || "";
    const rb = b.receivedDateTime || "";
    return rb.localeCompare(ra);
  });
  return out.slice(0, limit);
}

export async function fetchMailMessage({ token, messageId, withAttachments = false }) {
  const params = new URLSearchParams();
  if (withAttachments) params.set("$expand", "attachments");
  const qs = params.toString();
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}${qs ? `?${qs}` : ""}`;
  return graphGet(url, token);
}

function senderLabel(m) {
  const s = m.from?.emailAddress || m.sender?.emailAddress;
  if (!s) return "(알 수 없음)";
  return s.name ? `${s.name} <${s.address}>` : s.address;
}

function recipientLabel(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const names = list
    .slice(0, 6)
    .map((r) => r.emailAddress?.name || r.emailAddress?.address)
    .filter(Boolean);
  const more = list.length > 6 ? ` … +${list.length - 6}` : "";
  return names.length ? `${names.join(", ")}${more}` : "";
}

function messageBody(m) {
  const body = m.body;
  if (!body) return m.bodyPreview || "";
  const raw = body.content || "";
  if (!raw.trim()) return m.bodyPreview || "";
  if (body.contentType === "html") return htmlToMarkdown(raw);
  return raw.trim();
}

function renderAttachmentsBlock(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const lines = attachments.map((a) => {
    const name = a.name || "(첨부)";
    const size = a.size ? ` (${Math.round(a.size / 1024)}KB)` : "";
    return `- 📎 ${name}${size}`;
  });
  return `\n\n${lines.join("\n")}`;
}

export function renderMailInbox({ meta, messages }) {
  const frontmatter = YAML.stringify({
    source: "outlook-mail",
    folder: meta.folder || "inbox",
    range: meta.range,
    fetched_at: meta.fetched_at,
    message_count: messages.length,
  }).trim();

  const lines = [
    `---\n${frontmatter}\n---`,
    "",
    `# 📧 Mail ${meta.folder || "inbox"}: ${meta.range}`,
    "",
  ];

  if (messages.length === 0) {
    lines.push("_(해당 범위에 메일 없음)_");
    return lines.join("\n");
  }

  let currentDate = null;
  for (const m of messages) {
    const recv = m.receivedDateTime;
    const date = recv ? formatKstDate(toKst(`${recv}Z`)) : "(날짜 미상)";
    const time = recv ? formatKstTime(toKst(`${recv}Z`)) : "";
    if (date !== currentDate) {
      lines.push(`## ${date}`, "");
      currentDate = date;
    }
    const subject = m.subject || "(제목 없음)";
    const linkTitle = m.webLink ? `[${subject}](${m.webLink})` : subject;
    lines.push(`### ${time} - ${linkTitle}`);
    lines.push("");
    const head = [`From: ${senderLabel(m)}`];
    const to = recipientLabel(m.toRecipients);
    if (to) head.push(`To: ${to}`);
    const cc = recipientLabel(m.ccRecipients);
    if (cc) head.push(`Cc: ${cc}`);
    if (m.hasAttachments) head.push("📎 첨부 있음");
    lines.push(head.join(" · "));
    lines.push("");
    lines.push(messageBody(m) || "_(본문 없음)_");
    lines.push("");
  }
  return lines.join("\n");
}

export function renderMailMessage({ meta, message }) {
  const m = message;
  const frontmatter = YAML.stringify({
    source: "outlook-mail-single",
    message_id: m.id,
    fetched_at: meta.fetched_at,
  }).trim();

  const recv = m.receivedDateTime;
  const when = recv ? `${formatKstDate(toKst(`${recv}Z`))} ${formatKstTime(toKst(`${recv}Z`))}` : "(시각 미상)";
  const subject = m.subject || "(제목 없음)";

  const lines = [
    `---\n${frontmatter}\n---`,
    "",
    `# 📧 ${subject}`,
    "",
    `**When**: ${when}`,
    `**From**: ${senderLabel(m)}`,
  ];
  const to = recipientLabel(m.toRecipients);
  if (to) lines.push(`**To**: ${to}`);
  const cc = recipientLabel(m.ccRecipients);
  if (cc) lines.push(`**Cc**: ${cc}`);
  if (m.webLink) lines.push(`**Link**: [Outlook에서 열기](${m.webLink})`);
  lines.push("");
  lines.push(messageBody(m) || "_(본문 없음)_");
  lines.push(renderAttachmentsBlock(m.attachments));
  return lines.join("\n");
}
