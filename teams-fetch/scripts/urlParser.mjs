// Teams URL 파서
//
// 지원 포맷:
//   https://teams.microsoft.com/l/message/19%3Axxx%40thread.tacv2/1712345678901?context=...&tenantId=...&groupId=...
//   https://teams.microsoft.com/l/channel/19%3Axxx%40thread.tacv2/General?groupId=...&tenantId=...
//   https://teams.microsoft.com/l/chat/0/0?users=...
//   msteams:/l/message/... (동일 구조)

export function parseTeamsUrl(rawUrl) {
  let url;
  try {
    const normalized = rawUrl.startsWith("msteams:")
      ? rawUrl.replace(/^msteams:/, "https://teams.microsoft.com")
      : rawUrl;
    url = new URL(normalized);
  } catch {
    throw new Error(`URL 파싱 실패: ${rawUrl}`);
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  // ['l', 'message' | 'channel' | 'chat', ...]
  const kind = pathParts[1];

  if (kind === "message") {
    // /l/message/{encoded-channel-or-chat-id}/{messageId}
    const channelOrChatId = decodeURIComponent(pathParts[2] || "");
    const messageId = pathParts[3];
    const groupId = url.searchParams.get("groupId");
    if (groupId) {
      return {
        type: "thread",
        team_id: groupId,
        channel_id: channelOrChatId,
        message_id: messageId,
      };
    }
    // no groupId → 개인 채팅 메시지
    return {
      type: "chat",
      id: channelOrChatId,
      message_id: messageId,
    };
  }

  if (kind === "channel") {
    const channelId = decodeURIComponent(pathParts[2] || "");
    const groupId = url.searchParams.get("groupId");
    if (!groupId) throw new Error("channel URL에 groupId가 없습니다");
    return {
      type: "channel",
      team_id: groupId,
      channel_id: channelId,
    };
  }

  if (kind === "chat") {
    // /l/chat/{chatId}/conversations — 그룹/1:1 채팅 자체 링크
    const maybeId = decodeURIComponent(pathParts[2] || "");
    if (maybeId.startsWith("19:") && maybeId.includes("@thread")) {
      return { type: "chat", id: maybeId };
    }
    // /l/chat/0/0?users=a@b,c@d — chat id는 확보 불가
    throw new Error(
      "chat 생성 링크(/l/chat/0/0)는 chatId를 포함하지 않습니다. Teams 앱에서 채팅방 이름 옆 '...' → '채팅에 대한 링크 복사' 를 사용하세요.",
    );
  }

  throw new Error(`지원하지 않는 Teams URL 형식: ${kind}`);
}
