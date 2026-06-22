import { getAccessToken } from "@/lib/google";
import { monthRanges, resolveRange } from "@/lib/dates";

async function gscQuery(siteUrl, body) {
  const tok = await getAccessToken();
  const r = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || `Search Console error ${r.status}`);
  return d;
}

// Totals for a date range (clicks, impressions, CTR, average position).
export async function gscSummary(siteUrl, start, end) {
  const d = await gscQuery(siteUrl, { startDate: start, endDate: end });
  const row = (d.rows && d.rows[0]) || {};
  return {
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  };
}

// Full GSC tab payload: current + previous summary, plus top keywords.
export async function gscReport(siteUrl, range) {
  const r = range && range.start ? range : resolveRange();
  const [summary, prevSummary, kw] = await Promise.all([
    gscSummary(siteUrl, r.start, r.end),
    gscSummary(siteUrl, r.prevStart, r.prevEnd),
    topKeywords(siteUrl, 30, r.start, r.end),
  ]);
  return { summary, prevSummary, rows: kw.rows, totals: kw.totals, range: r };
}

// List every Search Console property the service account can read.
export async function listSites() {
  const tok = await getAccessToken();
  const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || `Search Console error ${r.status}`);
  return (d.siteEntry || [])
    .filter((s) => s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ siteUrl: s.siteUrl, permission: s.permissionLevel }));
}

// List the sitemap files the owner submitted to Search Console for a property.
export async function listSitemaps(siteUrl) {
  const tok = await getAccessToken();
  const r = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    { headers: { Authorization: `Bearer ${tok}` } }
  );
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || `Search Console error ${r.status}`);
  return (d.sitemap || []).map((s) => s.path).filter(Boolean);
}

export async function topKeywords(siteUrl, limit = 30, start, end) {
  const { curStart, curEnd } = monthRanges();
  const s = start || curStart, e = end || curEnd;
  const d = await gscQuery(siteUrl, { startDate: s, endDate: e, dimensions: ["query"], rowLimit: Math.min(limit, 30) });
  const rows = (d.rows || []).map((x) => ({
    query: x.keys[0], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position,
  }));
  const totals = rows.reduce((a, x) => ({ clicks: a.clicks + x.clicks, impressions: a.impressions + x.impressions }), { clicks: 0, impressions: 0 });
  return { rows, totals, range: { curStart: s, curEnd: e } };
}
