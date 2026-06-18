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
