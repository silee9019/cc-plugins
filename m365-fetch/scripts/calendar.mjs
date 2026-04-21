// Outlook calendar fetcher + markdown renderer.
//
// Uses /me/calendarView (for events expanded from recurrences in a time window)
// rather than /me/events (which returns raw series masters). Scopes required:
//   - Calendars.Read              (primary calendar)
//   - Calendars.Read.Shared       (shared calendars via /me/calendarView)

import YAML from "yaml";
import { graphGet } from "./graph.mjs";
import { fetchWithSlicing } from "./sliced-fetch.mjs";
import { toUtcForGraph, toKst } from "./tz.mjs";
import { htmlToMarkdown, formatKstDate, formatKstTime } from "./render.mjs";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function calendarViewBase(calendarId) {
  if (calendarId) {
    return `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;
  }
  return `${GRAPH_BASE}/me/calendarView`;
}

async function fetchWindow({ token, calendarId, sinceIso, untilIso, perPage }) {
  const params = new URLSearchParams({
    startDateTime: toUtcForGraph(sinceIso),
    endDateTime: toUtcForGraph(untilIso),
    $top: String(Math.min(perPage, 50)),
    $orderby: "start/dateTime",
  });
  let url = `${calendarViewBase(calendarId)}?${params}`;
  const out = [];
  while (url) {
    const data = await graphGet(url, token);
    for (const ev of data.value || []) out.push(ev);
    url = data["@odata.nextLink"] || null;
  }
  return out;
}

export async function listCalendars({ token }) {
  const data = await graphGet(`${GRAPH_BASE}/me/calendars`, token);
  return data.value || [];
}

export async function fetchCalendarEvents({
  token,
  calendarId,
  sinceIso,
  untilIso,
  chunkDays = 3,
  limit = 500,
  perPage = 50,
}) {
  const events = await fetchWithSlicing({
    sinceIso,
    untilIso,
    chunkDays,
    fetchOne: (w) =>
      fetchWindow({
        token,
        calendarId,
        sinceIso: w.sinceIso,
        untilIso: w.untilIso,
        perPage,
      }),
  });
  // Window slices can overlap on the boundary (prev.untilIso === next.sinceIso),
  // and $orderby asc within each window doesn't guarantee global order. Dedupe by id
  // and sort by start.
  const seen = new Map();
  for (const ev of events) {
    if (!seen.has(ev.id)) seen.set(ev.id, ev);
  }
  const out = [...seen.values()].sort((a, b) => {
    const sa = a?.start?.dateTime || "";
    const sb = b?.start?.dateTime || "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return out.slice(0, limit);
}

function organizerLabel(ev) {
  const o = ev.organizer?.emailAddress;
  if (!o) return "";
  return o.name ? `${o.name} <${o.address}>` : o.address;
}

function attendeeSummary(ev) {
  const list = ev.attendees || [];
  if (list.length === 0) return "";
  const names = list
    .slice(0, 6)
    .map((a) => a.emailAddress?.name || a.emailAddress?.address)
    .filter(Boolean);
  const more = list.length > 6 ? ` … +${list.length - 6}` : "";
  return names.length > 0 ? `${names.join(", ")}${more}` : "";
}

function locationLabel(ev) {
  const loc = ev.location?.displayName;
  if (loc) return loc;
  const locs = ev.locations || [];
  return locs.map((l) => l.displayName).filter(Boolean).join(" / ");
}

function eventBody(ev) {
  const body = ev.body;
  if (!body) return "";
  const raw = body.content || "";
  if (!raw.trim()) return "";
  if (body.contentType === "html") {
    return htmlToMarkdown(raw);
  }
  return raw.trim();
}

function fmtTimeWindow(ev) {
  const s = ev.start?.dateTime;
  const e = ev.end?.dateTime;
  if (!s) return "";
  if (ev.isAllDay) return "종일";
  const start = formatKstTime(toKst(`${s}Z`));
  const end = e ? formatKstTime(toKst(`${e}Z`)) : "";
  return end ? `${start}-${end}` : start;
}

export function renderCalendarEvents({ meta, events }) {
  const frontmatter = YAML.stringify({
    source: "outlook-calendar",
    calendar_id: meta.calendar_id || "default",
    range: meta.range,
    fetched_at: meta.fetched_at,
    event_count: events.length,
  }).trim();

  const lines = [`---\n${frontmatter}\n---`, "", `# 📅 Calendar: ${meta.range}`, ""];

  if (events.length === 0) {
    lines.push("_(해당 범위에 일정 없음)_");
    return lines.join("\n");
  }

  let currentDate = null;
  for (const ev of events) {
    const startIso = ev.start?.dateTime;
    const date = startIso ? formatKstDate(toKst(`${startIso}Z`)) : "(날짜 미상)";
    if (date !== currentDate) {
      lines.push(`## ${date}`, "");
      currentDate = date;
    }
    const when = fmtTimeWindow(ev);
    const subject = ev.subject || "(제목 없음)";
    lines.push(`### ${when} - ${subject}`);
    lines.push("");
    const meta2 = [];
    const organizer = organizerLabel(ev);
    if (organizer) meta2.push(`주최: ${organizer}`);
    const loc = locationLabel(ev);
    if (loc) meta2.push(`장소: ${loc}`);
    const att = attendeeSummary(ev);
    if (att) meta2.push(`참석: ${att}`);
    if (ev.onlineMeeting?.joinUrl) {
      meta2.push(`온라인: [${ev.onlineMeeting.joinUrl}](${ev.onlineMeeting.joinUrl})`);
    }
    if (meta2.length > 0) {
      lines.push(meta2.join(" · "));
      lines.push("");
    }
    const body = eventBody(ev);
    if (body) {
      lines.push(body);
      lines.push("");
    }
    if (ev.webLink) {
      lines.push(`🔗 [Outlook에서 열기](${ev.webLink})`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
