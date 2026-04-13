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
  const repliesData = await graphGet(
    `${GRAPH_BASE}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
    token,
  );
  const replies = repliesData.value || [];
  return [root, ...replies].sort((a, b) =>
    (a.createdDateTime || "").localeCompare(b.createdDateTime || ""),
  );
}

export async function fetchChatInfo({ token, chatId }) {
  return graphGet(`${GRAPH_BASE}/me/chats/${encodeURIComponent(chatId)}`, token);
}
