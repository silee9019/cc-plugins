import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { formatISO } from "date-fns";
import YAML from "yaml";
import {
  fetchAllChatMessages,
  fetchChannelMessages,
  fetchMeInfo,
  fetchChatInfo,
} from "./graph.mjs";
import { plainBodyText, renderOneMessage, formatKstDate } from "./render.mjs";

async function resolveTarget(token, name) {
  if (!name || name === "me") {
    const me = await fetchMeInfo({ token });
    return {
      mode: "me",
      userId: me.id,
      displayName: me.displayName || me.userPrincipalName || "me",
      label: `${me.displayName || me.userPrincipalName} (id: ${me.id})`,
    };
  }
  return { mode: "text", text: name, label: name };
}

function matchMessage(m, target, opts) {
  const matchedBy = [];

  if (!opts.bodyOnly) {
    const mentions = m.mentions || [];
    if (target.mode === "me") {
      if (mentions.some((x) => x?.mentioned?.user?.id === target.userId)) {
        matchedBy.push("mention");
      }
    } else {
      const needle = target.text.toLowerCase();
      if (
        mentions.some((x) => (x?.mentionText || "").toLowerCase().includes(needle))
      ) {
        matchedBy.push("mention");
      }
    }
  }

  if (!opts.mentionsOnly) {
    const text = plainBodyText(m).toLowerCase();
    const needle =
      target.mode === "me"
        ? (target.displayName || "").toLowerCase()
        : target.text.toLowerCase();
    if (needle && text.includes(needle)) matchedBy.push("body");
  }

  if (matchedBy.length === 0) return null;
  return matchedBy.length === 2 ? "both" : matchedBy[0];
}

function tagMessages(messages, source) {
  for (const m of messages) m._source = source;
  return messages;
}

async function collectChatMessages({ token, sinceIso, limit }) {
  const list = await fetchAllChatMessages({ token, sinceIso, limit });
  return tagMessages(list, { kind: "chat" });
}

async function collectChannelAlias({ token, alias, entry, sinceIso, limit }) {
  const list = await fetchChannelMessages({
    token,
    teamId: entry.team_id,
    channelId: entry.channel_id,
    sinceIso,
    limit,
  });
  return tagMessages(list, {
    kind: "channel",
    alias,
    label: entry.label || alias,
    team_id: entry.team_id,
    channel_id: entry.channel_id,
  });
}

function dedupeChannelAliases(aliases) {
  // 같은 channel_id를 가리키는 alias 중복 제거 (팀채널/팀채팅방 같은 동의어 처리)
  const seen = new Map();
  for (const [name, entry] of Object.entries(aliases)) {
    if (entry.type !== "channel") continue;
    const key = `${entry.team_id}::${entry.channel_id}`;
    if (!seen.has(key)) seen.set(key, { name, entry });
  }
  return Array.from(seen.values());
}

function chatLabelCache() {
  const cache = new Map();
  return async function labelFor(token, chatId) {
    if (cache.has(chatId)) return cache.get(chatId);
    try {
      const info = await fetchChatInfo({ token, chatId });
      const label =
        info.topic ||
        (info.chatType === "oneOnOne" ? "1:1 채팅" : info.chatType || "채팅") +
          ` (${chatId.slice(0, 12)}...)`;
      cache.set(chatId, label);
      return label;
    } catch {
      const fallback = `채팅 (${chatId.slice(0, 12)}...)`;
      cache.set(chatId, fallback);
      return fallback;
    }
  };
}

async function groupChatMatches(token, matches) {
  const labelFor = chatLabelCache();
  const groups = new Map();
  for (const m of matches) {
    const chatId = m.chatId || m._source?.chatId || "(unknown)";
    if (!groups.has(chatId)) {
      const label = await labelFor(token, chatId);
      groups.set(chatId, { label, chatId, messages: [] });
    }
    groups.get(chatId).messages.push(m);
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function renderSearchOutput({ target, opts, matches, channelGroups, chatGroups, range, fetchedAt }) {
  const frontmatter = YAML.stringify({
    source: "teams-search",
    query: target.mode === "me" ? "me" : target.text,
    target: target.label,
    match_modes: [
      ...(opts.mentionsOnly || !opts.bodyOnly ? ["mention"] : []),
      ...(opts.bodyOnly || !opts.mentionsOnly ? ["body"] : []),
    ].filter((v, i, arr) => arr.indexOf(v) === i),
    range,
    fetched_at: fetchedAt,
    total_matches: matches.length,
    channel_aliases_scanned: channelGroups.scanned,
    chat_threads_matched: chatGroups.length,
  }).trim();

  const sections = [`---\n${frontmatter}\n---`, `\n# 🔍 msteams search: ${target.label}\n`];

  if (matches.length === 0) {
    sections.push("_(매칭 결과 없음)_\n");
    return sections.join("\n");
  }

  for (const g of channelGroups.groups) {
    if (g.messages.length === 0) continue;
    sections.push(`\n## ${g.label} (channel)\n`);
    appendDateGrouped(sections, g.messages);
  }

  if (chatGroups.length > 0) {
    sections.push(`\n## 1:1/그룹 채팅\n`);
    for (const g of chatGroups) {
      sections.push(`\n### ${g.label}\n`);
      appendDateGrouped(sections, g.messages, "####");
    }
  }

  return sections.join("\n");
}

function appendDateGrouped(sections, messages, dateHeading = "###") {
  const sorted = messages
    .slice()
    .sort((a, b) => (b.createdDateTime || "").localeCompare(a.createdDateTime || ""));
  let currentDate = null;
  for (const m of sorted) {
    const date = formatKstDate(m.createdDateTime);
    if (date !== currentDate) {
      sections.push(`\n${dateHeading} ${date}\n`);
      currentDate = date;
    }
    const tag = m._matchedBy ? `   [${m._matchedBy}]` : "";
    const rendered = renderOneMessage(m).replace(/^### /, `#### `).replace(/(— [^\n]+)/, `$1${tag}`);
    sections.push(rendered);
    if (m.webUrl) sections.push(`\n🔗 [Teams에서 열기](${m.webUrl})`);
    sections.push("");
  }
}

function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function safeFileSlug(s) {
  return s.replace(/[^\w가-힣-]/g, "_").slice(0, 40);
}

export async function runSearch({ cfg, token, aliases, name, sinceIso, until, opts }) {
  const target = await resolveTarget(token, name);

  const channelEntries = dedupeChannelAliases(aliases);
  const limitPerSource = Number(opts.limit || 500);

  const [chatList, ...channelLists] = await Promise.all([
    collectChatMessages({ token, sinceIso, limit: 2000 }),
    ...channelEntries.map((c) =>
      collectChannelAlias({
        token,
        alias: c.name,
        entry: c.entry,
        sinceIso,
        limit: 500,
      }),
    ),
  ]);

  const allMessages = [
    ...chatList,
    ...channelLists.flat(),
  ];

  const matches = [];
  for (const m of allMessages) {
    if (until && m.createdDateTime && m.createdDateTime > until) continue;
    const matchedBy = matchMessage(m, target, opts);
    if (matchedBy) {
      m._matchedBy = matchedBy;
      matches.push(m);
    }
  }

  matches.sort((a, b) => (b.createdDateTime || "").localeCompare(a.createdDateTime || ""));
  const limited = matches.slice(0, limitPerSource);

  // 그룹핑
  const channelGroups = {
    scanned: channelEntries.length,
    groups: channelEntries.map(({ name: aliasName, entry }) => ({
      label: entry.label || aliasName,
      messages: limited.filter(
        (m) =>
          m._source?.kind === "channel" &&
          m._source.team_id === entry.team_id &&
          m._source.channel_id === entry.channel_id,
      ),
    })),
  };
  const chatGroups = await groupChatMatches(
    token,
    limited.filter((m) => m._source?.kind === "chat"),
  );

  const now = new Date();
  const range = sinceIso ? `${sinceIso} ~ ${formatISO(now)}` : "all";
  const markdown = renderSearchOutput({
    target,
    opts,
    matches: limited,
    channelGroups,
    chatGroups,
    range,
    fetchedAt: formatISO(now),
  });

  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}`;
  const slug = safeFileSlug(target.mode === "me" ? "me" : target.text);
  const outPath =
    opts.out || join(cfg.output.dir, `search-${slug}-${stamp}.md`);
  ensureParentDir(outPath);
  writeFileSync(outPath, markdown, "utf8");

  return { outPath, totalMatches: limited.length, scanned: { chats: chatList.length, channels: channelLists.flat().length } };
}

function pad(n) {
  return String(n).padStart(2, "0");
}
