const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphGet(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

export async function fetchChatMessages({ token, chatId, sinceIso, limit }) {
  // Note: /me/chats/{id}/messages는 $filter/$orderby 미지원. 기본 createdDateTime desc로 옴.
  // since는 클라이언트에서 적용. since 이전 메시지가 나오면 페이지네이션 중단.
  const messages = [];
  const params = new URLSearchParams({ $top: String(Math.min(limit, 50)) });
  let url = `${GRAPH_BASE}/me/chats/${encodeURIComponent(chatId)}/messages?${params}`;

  let stop = false;
  while (url && messages.length < limit && !stop) {
    const data = await graphGet(url, token);
    const page = data.value || [];
    for (const m of page) {
      if (messages.length >= limit) break;
      if (sinceIso && m.createdDateTime && m.createdDateTime < sinceIso) {
        stop = true;
        break;
      }
      messages.push(m);
    }
    url = data["@odata.nextLink"] || null;
  }
  messages.reverse();
  return messages;
}

export async function fetchChannelMessages({ token, teamId, channelId, sinceIso, limit }) {
  const messages = [];
  const params = new URLSearchParams({
    $top: String(Math.min(limit, 50)),
  });
  let url = `${GRAPH_BASE}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?${params}`;

  while (url && messages.length < limit) {
    const data = await graphGet(url, token);
    const page = data.value || [];
    for (const m of page) {
      if (messages.length >= limit) break;
      if (sinceIso && m.lastModifiedDateTime && m.lastModifiedDateTime < sinceIso) continue;
      messages.push(m);
    }
    url = data["@odata.nextLink"] || null;
  }
  messages.reverse();
  return messages;
}

export async function fetchThreadReplies({ token, teamId, channelId, messageId }) {
  const root = await graphGet(
    `${GRAPH_BASE}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    token,
  );
  const replies = await fetchChannelReplies({ token, teamId, channelId, rootId: messageId });
  return [root, ...replies].sort((a, b) =>
    (a.createdDateTime || "").localeCompare(b.createdDateTime || ""),
  );
}

// Fetch all replies of a single channel root message (pages through nextLink).
// Reply objects have replyToId pointing at the root; render.mjs uses that to indent.
export async function fetchChannelReplies({ token, teamId, channelId, rootId }) {
  const out = [];
  let url = `${GRAPH_BASE}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(rootId)}/replies?$top=50`;
  while (url) {
    const data = await graphGet(url, token);
    for (const r of data.value || []) out.push(r);
    url = data["@odata.nextLink"] || null;
  }
  return out;
}

// Fetch channel roots via fetchChannelMessages, then pull replies for each root in parallel
// (bounded concurrency) and interleave them into a single chronological array.
// Returned messages mix roots and replies; replies carry replyToId so the renderer can group them.
//
// Verified 2026-04-15: /replies endpoint has no change-tracking support and root.lastModifiedDateTime
// does NOT propagate when a reply is added/edited, so we must fetch replies unconditionally for every
// root in the returned window. For user-initiated `fetch` this is fine (one-shot call).
export async function fetchChannelMessagesWithReplies({
  token, teamId, channelId, sinceIso, limit, concurrency = 4,
}) {
  const roots = await fetchChannelMessages({ token, teamId, channelId, sinceIso, limit });
  const replyLists = await mapWithLimit(roots, concurrency, (root) =>
    fetchChannelReplies({ token, teamId, channelId, rootId: root.id }).catch((err) => {
      process.stderr.write(`[msteams-fetch] /replies ${root.id.slice(-8)} 실패: ${err.message.slice(0, 100)}\n`);
      return [];
    }),
  );
  const all = [];
  for (let i = 0; i < roots.length; i++) {
    all.push(roots[i]);
    for (const r of replyLists[i]) all.push(r);
  }
  // Keep chronological order; sinceIso filter already applied to roots upstream.
  all.sort((a, b) => (a.createdDateTime || "").localeCompare(b.createdDateTime || ""));
  return all;
}

async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchChatInfo({ token, chatId }) {
  return graphGet(`${GRAPH_BASE}/me/chats/${encodeURIComponent(chatId)}`, token);
}

export async function fetchChatMembers({ token, chatId }) {
  const data = await graphGet(
    `${GRAPH_BASE}/me/chats/${encodeURIComponent(chatId)}/members`,
    token,
  );
  return data.value || [];
}

export async function fetchMeInfo({ token }) {
  return graphGet(`${GRAPH_BASE}/me`, token);
}

export async function listMyChats({ token, limit = 200 }) {
  const chats = [];
  let url = `${GRAPH_BASE}/me/chats?$top=50`;
  while (url && chats.length < limit) {
    const data = await graphGet(url, token);
    for (const c of data.value || []) {
      chats.push(c);
      if (chats.length >= limit) break;
    }
    url = data["@odata.nextLink"] || null;
  }
  return chats;
}

// delegated context에서 /me/chats/getAllMessages는 PreconditionFailed 발생.
// 대신 /me/chats 목록을 받아 각 채팅별로 fetchChatMessages 호출.
// 채팅이 많을 때 호출 횟수가 늘지만 throttling 위험은 낮음 (개인이 가입한 채팅 수 N).
export async function fetchAllChatMessages({ token, sinceIso, limit = 2000, perChatLimit = 200 }) {
  const chats = await listMyChats({ token });
  const out = [];
  for (const c of chats) {
    if (out.length >= limit) break;
    try {
      const list = await fetchChatMessages({
        token,
        chatId: c.id,
        sinceIso,
        limit: perChatLimit,
      });
      for (const m of list) {
        m.chatId = c.id;
        m._chatTopic = c.topic || null;
        m._chatType = c.chatType || null;
        out.push(m);
        if (out.length >= limit) break;
      }
    } catch (err) {
      // 개별 채팅 접근 실패는 무시하고 다음 채팅으로
      process.stderr.write(`[msteams-fetch] chat ${c.id.slice(0, 16)}... 스킵: ${err.message.slice(0, 80)}\n`);
    }
  }
  return out;
}
