// Generic chunked-fetch wrapper: split a [sinceIso, untilIso] range into
// KST-ISO windows of at most `chunkDays`, call `fetchOne({ sinceIso, untilIso })`
// for each, and concatenate results. Callers are responsible for:
//   - converting each window's KST iso to whatever the target API expects
//     (typically toUtcForGraph for Graph $filter / calendarView)
//   - internal pagination (nextLink) inside fetchOne
//   - dedup/sort after concat if needed
//
// Returns a flat array of items in window order. Errors from any window
// propagate — we don't swallow partial failures because callers often need
// to know which window broke.

import { sliceIsoRange } from "./tz.mjs";

export async function fetchWithSlicing({
  sinceIso,
  untilIso,
  chunkDays = 3,
  fetchOne,
}) {
  if (typeof fetchOne !== "function") {
    throw new TypeError("fetchWithSlicing: fetchOne must be a function");
  }
  const windows = sliceIsoRange(sinceIso, untilIso, chunkDays);
  const out = [];
  for (const w of windows) {
    const page = await fetchOne(w);
    if (Array.isArray(page)) {
      for (const item of page) out.push(item);
    }
  }
  return out;
}
