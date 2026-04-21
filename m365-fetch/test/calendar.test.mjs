import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCalendarEvents } from "../scripts/calendar.mjs";

function sampleEvent(overrides = {}) {
  return {
    id: "evt1",
    subject: "Team Weekly",
    isAllDay: false,
    start: { dateTime: "2026-04-21T01:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-04-21T02:00:00.0000000", timeZone: "UTC" },
    organizer: { emailAddress: { name: "Alice", address: "alice@example.com" } },
    location: { displayName: "Conference Room A" },
    attendees: [
      { emailAddress: { name: "Bob", address: "bob@example.com" } },
      { emailAddress: { name: "Carol", address: "carol@example.com" } },
    ],
    body: { contentType: "text", content: "Agenda: KR1 review" },
    onlineMeeting: null,
    webLink: "https://outlook.office.com/calendar/item/1",
    ...overrides,
  };
}

test("renderCalendarEvents: empty list shows placeholder", () => {
  const out = renderCalendarEvents({
    meta: { range: "2026-04-20 ~ 2026-04-21", fetched_at: "2026-04-21T10:00:00+09:00" },
    events: [],
  });
  assert.match(out, /해당 범위에 일정 없음/);
  assert.match(out, /source: outlook-calendar/);
});

test("renderCalendarEvents: single event renders date group + time window in KST", () => {
  const out = renderCalendarEvents({
    meta: { range: "2026-04-20 ~ 2026-04-22", fetched_at: "2026-04-21T10:00:00+09:00" },
    events: [sampleEvent()],
  });
  // start 01:00 UTC → 10:00 KST, end 02:00 UTC → 11:00 KST
  assert.match(out, /## 2026-04-21/);
  assert.match(out, /### 10:00-11:00 - Team Weekly/);
  assert.match(out, /주최: Alice <alice@example\.com>/);
  assert.match(out, /장소: Conference Room A/);
  assert.match(out, /참석: Bob, Carol/);
  assert.match(out, /Agenda: KR1 review/);
  assert.match(out, /🔗 \[Outlook에서 열기\]/);
});

test("renderCalendarEvents: isAllDay shows '종일' instead of hh:mm-hh:mm", () => {
  const out = renderCalendarEvents({
    meta: { range: "x", fetched_at: "y" },
    events: [sampleEvent({ isAllDay: true })],
  });
  assert.match(out, /### 종일 - Team Weekly/);
});

test("renderCalendarEvents: HTML body is converted to markdown", () => {
  const out = renderCalendarEvents({
    meta: { range: "x", fetched_at: "y" },
    events: [
      sampleEvent({
        body: {
          contentType: "html",
          content: "<p>Hello <strong>world</strong></p>",
        },
      }),
    ],
  });
  assert.match(out, /Hello \*\*world\*\*/);
});

test("renderCalendarEvents: attendee list truncates at 6 with +N suffix", () => {
  const attendees = Array.from({ length: 9 }, (_, i) => ({
    emailAddress: { name: `P${i}`, address: `p${i}@x` },
  }));
  const out = renderCalendarEvents({
    meta: { range: "x", fetched_at: "y" },
    events: [sampleEvent({ attendees })],
  });
  assert.match(out, /참석: P0, P1, P2, P3, P4, P5 … \+3/);
});
