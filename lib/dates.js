export function monthRanges() {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const curStart = `${y}-${pad(m + 1)}-01`;
  const curEnd = `${y}-${pad(m + 1)}-${pad(now.getUTCDate())}`;
  const prev = new Date(Date.UTC(y, m - 1, 1));
  const prevStart = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-01`;
  const prevEndD = new Date(Date.UTC(y, m, 0));
  const prevEnd = `${prevEndD.getUTCFullYear()}-${pad(prevEndD.getUTCMonth() + 1)}-${pad(prevEndD.getUTCDate())}`;
  return { curStart, curEnd, prevStart, prevEnd };
}

const fmt = (d) => d.toISOString().slice(0, 10);

// The equal-length period immediately before [start, end].
export function prevPeriod(start, end) {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const days = Math.round((e - s) / 86400000) + 1;
  const prevEnd = new Date(s.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd), days };
}

// Resolve a range from optional inputs, defaulting to the current month-to-date
// and an equal-length prior period. Returns { start, end, prevStart, prevEnd }.
export function resolveRange(start, end) {
  if (!start || !end) {
    const m = monthRanges();
    return { start: m.curStart, end: m.curEnd, prevStart: m.prevStart, prevEnd: m.prevEnd };
  }
  const { prevStart, prevEnd } = prevPeriod(start, end);
  return { start, end, prevStart, prevEnd };
}
