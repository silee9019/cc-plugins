import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import YAML from "yaml";
import { nowKst } from "./tz.mjs";
import {
  fetchChatMessages,
  fetchChannelMessagesWithReplies,
  fetchThreadReplies,
  fetchChatMembers,
  fetchMeInfo,
  listMyChats,
} from "./graph.mjs";
import { renderOneMessage, formatKstDate } from "./render.mjs";
import { shouldIncludeChatInInbox, filterAliasesForAll } from "./config.mjs";

// Resolve a human-readable label for a chat. For 1:1 chats, looks up the counterpart
// name via the members endpoint; topics trump member resolution when present.
async function resolveChatLabel({ token, chat, meId, memberCache }) {
  if (chat.topic) return chat.topic;
  if (chat.chatType === "oneOnOne") {
    if (memberCache.has(chat.id)) return memberCache.get(chat.id);
    let label = null;
    try {
      const members = await fetchChatMembers({ token, chatId: chat.id });
      const other = members.find((m) => m.userId && m.userId !== meId);
      if (other?.displayName) label = `1:1 with ${other.displayName}`;
    } catch {}
    // Bot/app counterparts (e.g. Jira Cloud) don't appear in /members; peek at
    // the most recent message's sender identity as a fallback.
    if (!label) {
      try {
        const msgs = await fetchChatMessages({ token, chatId: chat.id, limit: 1 });
        const m = msgs[0];
        const fromUserId = m?.from?.user?.id;
        const userName = m?.from?.user?.displayName;
        const appName = m?.from?.application?.displayName;
        const other = fromUserId && fromUserId !== meId ? userName : appName || userName;
        if (other) label = `1:1 with ${other}`;
      } catch {}
    }
    label = label || `1:1 (${chat.id.slice(0, 18)})`;
    memberCache.set(chat.id, label);
    return label;
  }
  return `${chat.chatType || "chat"} (${chat.id.slice(0, 18)})`;
}

function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function renderChatSection({ label, chatType, messages }) {
  const lines = [];
  lines.push(`## ${label} (${chatType || "chat"}, ${messages.length}건)`);
  lines.push("");
  // Newest first within a chat, for quick skim.
  const sorted = messages
    .slice()
    .sort((a, b) => (b.createdDateTime || "").localeCompare(a.createdDateTime || ""));
  let currentDate = null;
  for (const m of sorted) {
    const date = formatKstDate(m.createdDateTime);
    if (date !== currentDate) {
      lines.push(`### ${date}`);
      lines.push("");
      currentDate = date;
    }
    // Downshift sender heading one level so it nests under the date.
    lines.push(renderOneMessage(m).replace(/^### /, "#### "));
    lines.push("");
  }
  return lines.join("\n");
}

async function collectChatSections({ token, cfg, sinceIso, perChatLimit, extraExcludeIds }) {
  const me = await fetchMeInfo({ token });
  const chats = await listMyChats({ token });
  const memberCache = new Map();
  const included = [];
  const skipped = [];

  const excludeTopicsLower = (cfg.inbox?.exclude_chat_topics || []).map((t) =>
    String(t).toLowerCase(),
  );

  for (const chat of chats) {
    const decision = shouldIncludeChatInInbox(chat, cfg.inbox, extraExcludeIds);
    if (!decision.include) {
      skipped.push({ id: chat.id, topic: chat.topic, reason: decision.reason });
      continue;
    }
    // For 1:1 chats with empty topic, also match exclude_chat_topics against the
    // resolved counterpart label (e.g. "1:1 with Jira Cloud") so users can filter
    // bot/noise chats without needing their raw chat.id.
    let preLabel = null;
    if (!chat.topic && chat.chatType === "oneOnOne" && excludeTopicsLower.length > 0) {
      preLabel = await resolveChatLabel({ token, chat, meId: me.id, memberCache });
      const lower = preLabel.toLowerCase();
      const hit = excludeTopicsLower.find((n) => n && lower.includes(n));
      if (hit) {
        skipped.push({ id: chat.id, topic: preLabel, reason: `label~${hit}` });
        continue;
      }
    }
    try {
      const messages = await fetchChatMessages({
        token,
        chatId: chat.id,
        sinceIso,
        limit: perChatLimit,
      });
      if (messages.length === 0) continue;
      const label = preLabel || (await resolveChatLabel({ token, chat, meId: me.id, memberCache }));
      included.push({ id: chat.id, label, chatType: chat.chatType, messages });
    } catch (err) {
      process.stderr.write(
        `[inbox] chat ${chat.id.slice(0, 16)}... 스킵: ${String(err.message).slice(0, 80)}\n`,
      );
    }
  }
  return { included, skipped, totalChats: chats.length };
}

async function collectChannelSections({ token, aliases, extraExcludes, sinceIso, limit }) {
  const targets = filterAliasesForAll(aliases, extraExcludes);
  const sections = [];
  for (const [alias, entry] of Object.entries(targets)) {
    try {
      let messages;
      if (entry.type === "channel") {
        messages = await fetchChannelMessagesWithReplies({
          token,
          teamId: entry.team_id,
          channelId: entry.channel_id,
          sinceIso,
          limit,
        });
      } else if (entry.type === "thread") {
        messages = await fetchThreadReplies({
          token,
          teamId: entry.team_id,
          channelId: entry.channel_id,
          messageId: entry.message_id,
        });
      } else if (entry.type === "chat") {
        messages = await fetchChatMessages({
          token,
          chatId: entry.id,
          sinceIso,
          limit,
        });
      } else {
        continue;
      }
      if (messages.length === 0) continue;
      sections.push({
        alias,
        label: entry.label || alias,
        type: entry.type,
        messages,
      });
    } catch (err) {
      process.stderr.write(
        `[inbox] alias ${alias} 스킵: ${String(err.message).slice(0, 100)}\n`,
      );
    }
  }
  return sections;
}

export async function runInbox({ cfg, token, aliases, sinceIso, sinceKst, opts }) {
  const perChatLimit = Number(opts.limit || cfg.defaults.limit);
  const extraExcludeIds = opts.excludeChatId
    ? opts.excludeChatId.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const extraExcludeAliases = opts.excludeAlias
    ? opts.excludeAlias.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const [chatResult, channelSections] = await Promise.all([
    collectChatSections({
      token,
      cfg,
      sinceIso,
      perChatLimit,
      extraExcludeIds,
    }),
    collectChannelSections({
      token,
      aliases,
      extraExcludes: extraExcludeAliases,
      sinceIso,
      limit: perChatLimit,
    }),
  ]);

  // Sort sections by newest message desc so latest-touched surfaces first.
  const newestOf = (msgs) =>
    msgs.reduce((acc, m) => (m.createdDateTime > acc ? m.createdDateTime : acc), "");

  const chatSections = chatResult.included
    .map((s) => ({ kind: "chat", ...s, newest: newestOf(s.messages) }))
    .sort((a, b) => b.newest.localeCompare(a.newest));
  const channelSorted = channelSections
    .map((s) => ({ kind: "channel", ...s, newest: newestOf(s.messages) }))
    .sort((a, b) => b.newest.localeCompare(a.newest));

  const totalMessages =
    chatSections.reduce((s, x) => s + x.messages.length, 0) +
    channelSorted.reduce((s, x) => s + x.messages.length, 0);

  const nowStr = nowKst();
  const frontmatter = YAML.stringify({
    source: "teams-inbox",
    range: sinceKst ? `${sinceKst} ~ ${nowStr}` : sinceIso ? `${sinceIso} ~ ${nowStr}` : "all",
    fetched_at: nowStr,
    total_chats: chatSections.length,
    total_channels: channelSorted.length,
    skipped_chats: chatResult.skipped.length,
    skipped_chats_detail: chatResult.skipped,
    message_count: totalMessages,
  }).trim();

  const out = [`---\n${frontmatter}\n---`, "", "# Teams Inbox", ""];

  if (channelSorted.length > 0) {
    out.push("# 채널");
    out.push("");
    for (const s of channelSorted) {
      out.push(
        renderChatSection({
          label: s.label,
          chatType: `channel:${s.alias}`,
          messages: s.messages,
        }),
      );
    }
  }

  if (chatSections.length > 0) {
    out.push("# 채팅");
    out.push("");
    for (const s of chatSections) {
      out.push(
        renderChatSection({ label: s.label, chatType: s.chatType, messages: s.messages }),
      );
    }
  }

  if (chatSections.length === 0 && channelSorted.length === 0) {
    out.push("_(해당 범위에 메시지 없음)_");
  }

  const stamp = nowStr.slice(0, 16).replace(":", "");
  const outPath = opts.out || join(cfg.output.dir, `inbox-${stamp}.md`);
  ensureParentDir(outPath);
  writeFileSync(outPath, out.join("\n"), "utf8");

  return {
    outPath,
    totalMessages,
    chatCount: chatSections.length,
    channelCount: channelSorted.length,
    skippedChats: chatResult.skipped,
  };
}
