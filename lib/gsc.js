import { getAccessToken } from "@/lib/google";
import { monthRanges } from "@/lib/dates";

export async function topKeywords(siteUrl, limit = 30) {
  const { curStart, curEnd } = monthRanges();
  const tok = await getAccessToken();
  const r = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: curStart, endDate: curEnd, dimensions: ["query"], rowLimit: Math.min(limit, 30) }),
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || `Search Console error ${r.status}`);
  const rows = (d.rows || []).map((x) => ({
    query: x.keys[0], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position,
  }));
  const totals = rows.reduce((a, x) => ({ clicks: a.clicks + x.clicks, impressions: a.impressions + x.impressions }), { clicks: 0, impressions: 0 });
  return { rows, totals, range: { curStart, curEnd } };
}
