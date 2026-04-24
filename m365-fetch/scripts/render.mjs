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

const CARD_CONTENT_TYPES = new Set([
  "application/vnd.microsoft.card.adaptive",
  "application/vnd.microsoft.card.hero",
  "application/vnd.microsoft.card.thumbnail",
  "application/vnd.microsoft.card.o365connector",
  "application/vnd.microsoft.teams.card.o365connector",
]);

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

// Merge adjacent <at> tags that refer to the same user (split Korean family/given
// name case). Teams sometimes emits `<at id="A">성</at>&nbsp;<at id="B">이름</at>` for
// a single mention; we collapse them to one `<at>` carrying the full displayName.
//
// Priority rules:
//   1. Same mentioned.user.id → merge, text = displayName if it contains every child
//      token, otherwise the deduped concatenation of children.
//   2. Different ids, but displayName tokens contain both child texts → merge.
//   3. Otherwise → leave alone.
//
// Multi-pass with a small guard so chains of 3+ mentions collapse left-to-right.
// mA.mentionText is updated so the downstream renderMentions substitution matches.
export function mergeAdjacentMentions(html, mentions) {
  if (!html || !Array.isArray(mentions) || mentions.length < 2) {
    return { html: html || "", mentions: mentions || [] };
  }
  const byId = new Map();
  for (const m of mentions) {
    byId.set(String(m.id), m);
  }
  // Allow plain whitespace AND `&nbsp;` between adjacent tags — Teams emits either.
  const pattern = /<at id="(\d+)">([^<]*)<\/at>(?:\s|&nbsp;)*<at id="(\d+)">([^<]*)<\/at>/;
  let out = html;
  let guard = 10;
  while (guard-- > 0) {
    let merged = false;
    const next = out.replace(pattern, (match, idA, textA, idB, textB) => {
      const mA = byId.get(idA);
      const mB = byId.get(idB);
      if (!mA || !mB) return match;
      const userA = mA.mentioned?.user?.id;
      const userB = mB.mentioned?.user?.id;
      const dnA = mA.mentioned?.user?.displayName || mA.mentionText || "";
      const dnB = mB.mentioned?.user?.displayName || mB.mentionText || "";
      // Rule 1: same user id. Graph often splits displayName to match each
      // mentionText fragment, so we can't trust dnA alone. Combine tokens from both
      // children, dedupe, and prefer dnA only when it already contains every token.
      if (userA && userB && userA === userB) {
        merged = true;
        const allTokens = [
          ...textA.trim().split(/\s+/),
          ...textB.trim().split(/\s+/),
        ].filter(Boolean);
        const dnTokens = dnA ? dnA.split(/\s+/).filter(Boolean) : [];
        const allInDn = dnTokens.length > 0 && allTokens.every((t) => dnTokens.includes(t));
        let name;
        if (allInDn) {
          name = dnA;
        } else {
          const seen = new Set();
          const parts = [];
          for (const t of allTokens) {
            if (!seen.has(t)) {
              seen.add(t);
              parts.push(t);
            }
          }
          name = parts.join(" ");
        }
        mA.mentionText = name;
        return `<at id="${idA}">${name}</at>`;
      }
      // Rule 2: A's displayName token set contains both child texts
      const tokensA = new Set(dnA.split(/\s+/).filter(Boolean));
      const ta = textA.trim();
      const tb = textB.trim();
      if (ta && tb && tokensA.has(ta) && tokensA.has(tb)) {
        merged = true;
        mA.mentionText = dnA;
        return `<at id="${idA}">${dnA}</at>`;
      }
      return match;
    });
    if (!merged) break;
    out = next;
  }
  return { html: out, mentions };
}

function isCardAttachment(a) {
  return a && CARD_CONTENT_TYPES.has(a.contentType);
}

function parseCardContent(a) {
  if (!a?.content) return null;
  if (typeof a.content === "object") return a.content;
  try {
    return JSON.parse(a.content);
  } catch {
    return null;
  }
}

function walkAdaptiveBody(nodes, out, depth) {
  if (!Array.isArray(nodes) || depth > 20) return;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    switch (node.type) {
      case "TextBlock": {
        const t = String(node.text || "").trim();
        if (t) out.lines.push(t);
        break;
      }
      case "RichTextBlock": {
        const inlines = (node.inlines || [])
          .map((i) => (typeof i === "string" ? i : i?.text || ""))
          .join("");
        const t = inlines.trim();
        if (t) out.lines.push(t);
        break;
      }
      case "FactSet": {
        for (const f of node.facts || []) {
          if (f?.title || f?.value) {
            out.lines.push(`- **${f.title || ""}**: ${f.value || ""}`);
          }
        }
        break;
      }
      case "Image": {
        if (node.url) out.lines.push(`![](${node.url})`);
        break;
      }
      case "Container":
      case "ColumnSet":
      case "ActionSet": {
        if (node.type === "ColumnSet") {
          for (const col of node.columns || []) {
            walkAdaptiveBody(col?.items, out, depth + 1);
          }
        } else {
          walkAdaptiveBody(node.items, out, depth + 1);
        }
        if (node.actions) walkAdaptiveActions(node.actions, out);
        break;
      }
      default: {
        // 알 수 없는 type이라도 items/columns가 있으면 재귀
        if (Array.isArray(node.items)) walkAdaptiveBody(node.items, out, depth + 1);
        if (Array.isArray(node.columns)) {
          for (const col of node.columns) walkAdaptiveBody(col?.items, out, depth + 1);
        }
        if (typeof node.text === "string" && node.text.trim()) {
          out.lines.push(node.text.trim());
        }
      }
    }
  }
}

function walkAdaptiveActions(actions, out) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || typeof a !== "object") continue;
    if (a.type === "Action.OpenUrl" && a.url) {
      out.actionLinks.push(`- [${a.title || a.url}](${a.url})`);
    }
  }
}

function extractAdaptiveCard(content) {
  const out = { lines: [], actionLinks: [] };
  walkAdaptiveBody(content.body, out, 0);
  walkAdaptiveActions(content.actions, out);
  return out;
}

function extractHeroCard(content) {
  const out = { lines: [], actionLinks: [] };
  if (content.title) out.lines.push(`**${content.title}**`);
  if (content.subtitle) out.lines.push(`_${content.subtitle}_`);
  if (content.text) out.lines.push(String(content.text).trim());
  for (const img of content.images || []) {
    if (img?.url) out.lines.push(`![](${img.url})`);
  }
  for (const b of content.buttons || []) {
    if (b?.type === "openUrl" && b.value) {
      out.actionLinks.push(`- [${b.title || b.value}](${b.value})`);
    }
  }
  return out;
}

function extractO365Connector(content) {
  const out = { lines: [], actionLinks: [] };
  if (content.title) out.lines.push(`**${content.title}**`);
  if (content.summary) out.lines.push(content.summary);
  if (content.text) out.lines.push(String(content.text).trim());
  for (const sec of content.sections || []) {
    if (sec.activityTitle) out.lines.push(`**${sec.activityTitle}**`);
    if (sec.activitySubtitle) out.lines.push(`_${sec.activitySubtitle}_`);
    if (sec.text) out.lines.push(String(sec.text).trim());
    for (const f of sec.facts || []) {
      out.lines.push(`- **${f.name || ""}**: ${f.value || ""}`);
    }
  }
  for (const action of content.potentialAction || []) {
    if (action?.["@type"] === "OpenUri") {
      for (const t of action.targets || []) {
        if (t?.uri) out.actionLinks.push(`- [${action.name || t.uri}](${t.uri})`);
      }
    }
  }
  return out;
}

function extractCardText(attachment) {
  if (!isCardAttachment(attachment)) return null;
  if (attachment._cardExtracted !== undefined) return attachment._cardExtracted;
  const content = parseCardContent(attachment);
  let result;
  if (!content) {
    result = { lines: ["_(카드 파싱 실패)_"], actionLinks: [] };
  } else if (
    attachment.contentType === "application/vnd.microsoft.card.adaptive"
  ) {
    result = extractAdaptiveCard(content);
  } else if (
    attachment.contentType === "application/vnd.microsoft.card.hero" ||
    attachment.contentType === "application/vnd.microsoft.card.thumbnail"
  ) {
    result = extractHeroCard(content);
  } else {
    result = extractO365Connector(content);
  }
  attachment._cardExtracted = result;
  return result;
}

function renderCardBlock(attachments) {
  if (!attachments) return "";
  const parts = [];
  for (const a of attachments) {
    const card = extractCardText(a);
    if (!card) continue;
    if (card.lines.length === 0 && card.actionLinks.length === 0) continue;
    parts.push("*(📋 카드)*");
    if (card.lines.length) parts.push(card.lines.join("\n\n"));
    if (card.actionLinks.length) parts.push(card.actionLinks.join("\n"));
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

function renderFileAttachments(attachments) {
  if (!attachments || attachments.length === 0) return "";
  const lines = attachments
    .filter((a) => a.contentType !== "messageReference" && !isCardAttachment(a))
    .map((a) => {
      const name = a.name || a.contentUrl || "(첨부)";
      const url = a.contentUrl || "";
      return url ? `- 📎 [${name}](${url})` : `- 📎 ${name}`;
    });
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

// Extract inline <video>/<audio>/<img> hostedContents references from the raw
// message body HTML. Teams embeds these as <video src="https://graph.microsoft.com
// /v1.0/.../hostedContents/<id>/$value">; turndown drops <video> entirely, so we
// surface them as downloadable lines that teams download-media can consume.
export function extractInlineMedia(html) {
  if (!html) return [];
  const results = [];
  const tagRe = /<(video|audio|img)\b[^>]*>/gi;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[0];
    const srcMatch = attrs.match(/\bsrc="([^"]+)"/i);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    if (!src.includes("hostedContents")) continue;
    const widthMatch = attrs.match(/\bwidth="(\d+)"/i);
    const heightMatch = attrs.match(/\bheight="(\d+)"/i);
    const durationMatch = attrs.match(/\bdata-duration="([^"]+)"/i);
    const meta = [];
    if (widthMatch && heightMatch) meta.push(`${widthMatch[1]}x${heightMatch[1]}`);
    if (durationMatch) meta.push(durationMatch[1]);
    results.push({
      kind: tag,
      url: src,
      meta: meta.join(", "),
    });
  }
  return results;
}

function renderInlineMedia(mediaList) {
  if (!mediaList || mediaList.length === 0) return "";
  const icons = { video: "🎥", audio: "🔊", img: "🖼️" };
  const labels = { video: "video", audio: "audio", img: "image" };
  const lines = mediaList.map((m) => {
    const icon = icons[m.kind] || "📎";
    const label = labels[m.kind] || m.kind;
    const metaPart = m.meta ? ` [${m.meta}]` : "";
    return `- ${icon} ${label}${metaPart}: ${m.url}`;
  });
  return `\n\n${lines.join("\n")}`;
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
    .join(" / ");
  return `\n\n*reactions*: ${summary}`;
}

function hasUsefulContent(m) {
  if (m.messageType && m.messageType !== "message") return false;
  const bodyHtml = m.body?.content || "";
  const text = bodyHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  if (text.length > 0) return true;
  const namedFiles = (m.attachments || []).filter(
    (a) => a.contentType !== "messageReference" && !isCardAttachment(a) && a.name,
  );
  if (namedFiles.length > 0) return true;
  for (const a of m.attachments || []) {
    const card = extractCardText(a);
    if (card && (card.lines.length > 0 || card.actionLinks.length > 0)) return true;
  }
  if (extractInlineMedia(bodyHtml).length > 0) return true;
  return false;
}

function renderOneMessage(m, { isReply = false } = {}) {
  if (m.messageType && m.messageType !== "message") {
    const summary = m.summary || m.messageType;
    return `_(system: ${summary})_`;
  }
  const sender =
    m.from?.user?.displayName ||
    m.from?.application?.displayName ||
    m.from?.device?.displayName ||
    "(알 수 없음)";
  const time = formatKstTime(m.createdDateTime);
  const bodyHtmlRaw = m.body?.content || "";
  const contentType = m.body?.contentType || "text";
  const { html: mergedHtml } = mergeAdjacentMentions(bodyHtmlRaw, m.mentions);
  const body =
    contentType === "html"
      ? htmlToMarkdown(renderMentions(mergedHtml, m.mentions))
      : bodyHtmlRaw;

  const cardBlock = renderCardBlock(m.attachments);
  const files = renderFileAttachments(m.attachments);
  const inlineMedia = renderInlineMedia(extractInlineMedia(bodyHtmlRaw));
  const reactions = renderReactions(m.reactions);

  const heading = isReply ? "####" : "###";
  const block = `${heading} ${time} - ${sender}\n\n${body}${cardBlock}${files}${inlineMedia}${reactions}`;
  if (!isReply) return block;
  // Indent replies as blockquotes so threading is visually obvious in markdown viewers.
  return block
    .split("\n")
    .map((l) => (l.length > 0 ? `> ${l}` : ">"))
    .join("\n");
}

export function plainBodyText(m) {
  const bodyHtml = m.body?.content || "";
  const stripped = bodyHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const cardLines = [];
  for (const a of m.attachments || []) {
    const card = extractCardText(a);
    if (card?.lines?.length) cardLines.push(card.lines.join("\n"));
  }
  return [stripped, ...cardLines].filter(Boolean).join("\n");
}

export { extractCardText, isCardAttachment };

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
    sections.push(renderOneMessage(m, { isReply: Boolean(m.replyToId) }));
    sections.push("");
  }

  return sections.join("\n");
}

export { formatKstDate, formatKstTime, renderOneMessage, htmlToMarkdown };
