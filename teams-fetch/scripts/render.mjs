import TurndownService from "turndown";
import YAML from "yaml";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

turndown.addRule("strikeAttachmentDivs", {
  filter: (node) => node.nodeName === "DIV" && node.getAttribute("itemtype") === "http://schema.skype.com/Message",
  replacement: (content) => content,
});

function htmlToMarkdown(html) {
  if (!html) return "";
  return turndown.turndown(html).trim();
}

function formatKstTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatKstDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function renderMentions(body, mentions) {
  if (!mentions || mentions.length === 0) return body;
  let out = body;
  for (const m of mentions) {
    const placeholder = `<at id="${m.id}">${m.mentionText || ""}</at>`;
    out = out.replaceAll(placeholder, `@${m.mentionText || "unknown"}`);
  }
  return out;
}

function renderAttachments(attachments) {
  if (!attachments || attachments.length === 0) return "";
  const lines = attachments
    .filter((a) => a.contentType !== "messageReference")
    .map((a) => {
      const name = a.name || a.contentUrl || "(첨부)";
      const url = a.contentUrl || "";
      return url ? `- 📎 [${name}](${url})` : `- 📎 ${name}`;
    });
  return lines.length ? `\n${lines.join("\n")}` : "";
}

function renderReactions(reactions) {
  if (!reactions || reactions.length === 0) return "";
  const counts = {};
  for (const r of reactions) {
    const key = r.reactionType || "?";
    counts[key] = (counts[key] || 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  return `\n*reactions*: ${summary}`;
}

function hasUsefulContent(m) {
  if (m.messageType && m.messageType !== "message") return false;
  const bodyHtml = m.body?.content || "";
  const text = bodyHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  if (text.length > 0) return true;
  const namedAttachments = (m.attachments || []).filter(
    (a) => a.contentType !== "messageReference" && a.name,
  );
  if (namedAttachments.length > 0) return true;
  return false;
}

function renderOneMessage(m) {
  if (m.messageType && m.messageType !== "message") {
    // system messages (member added, etc) — 간략히
    const summary = m.summary || m.messageType;
    return `_(system: ${summary})_`;
  }
  const sender =
    m.from?.user?.displayName ||
    m.from?.application?.displayName ||
    m.from?.device?.displayName ||
    "(알 수 없음)";
  const time = formatKstTime(m.createdDateTime);
  const bodyHtml = m.body?.content || "";
  const contentType = m.body?.contentType || "text";
  const body =
    contentType === "html"
      ? htmlToMarkdown(renderMentions(bodyHtml, m.mentions))
      : bodyHtml;

  const attachments = renderAttachments(m.attachments);
  const reactions = renderReactions(m.reactions);

  return `### ${time} — ${sender}\n\n${body}${attachments}${reactions}`;
}

export function renderMessages({ meta, messages }) {
  const filtered = messages.filter(hasUsefulContent);
  const skipped = messages.length - filtered.length;

  const frontmatter = YAML.stringify({
    source: "teams",
    alias: meta.alias,
    label: meta.label || "",
    type: meta.type,
    ...(meta.chat_id ? { chat_id: meta.chat_id } : {}),
    ...(meta.team_id ? { team_id: meta.team_id } : {}),
    ...(meta.channel_id ? { channel_id: meta.channel_id } : {}),
    ...(meta.message_id ? { message_id: meta.message_id } : {}),
    fetched_at: meta.fetched_at,
    range: meta.range,
    message_count: filtered.length,
    ...(skipped > 0 ? { skipped_empty: skipped } : {}),
  }).trim();

  const sections = [];
  sections.push(`---\n${frontmatter}\n---`);
  sections.push(`\n# ${meta.label || meta.alias}\n`);

  if (filtered.length === 0) {
    sections.push("_(해당 범위에 메시지 없음)_\n");
    return sections.join("\n");
  }

  let currentDate = null;
  for (const m of filtered) {
    const date = formatKstDate(m.createdDateTime);
    if (date !== currentDate) {
      sections.push(`\n## ${date}\n`);
      currentDate = date;
    }
    sections.push(renderOneMessage(m));
    sections.push("");
  }

  return sections.join("\n");
}
