import { getAccessToken } from "@/lib/google";
import { monthRanges, resolveRange } from "@/lib/dates";

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

async function gfetch(url, opts = {}) {
  const tok = await getAccessToken();
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || `Google Analytics error ${r.status}`);
  return d;
}

export async function listProperties() {
  const d = await gfetch(`${ADMIN}/accountSummaries?pageSize=200`);
  const props = [];
  (d.accountSummaries || []).forEach((a) =>
    (a.propertySummaries || []).forEach((p) =>
      props.push({ id: String(p.property).replace("properties/", ""), name: p.displayName, account: a.displayName })));
  return props;
}

function runReport(propertyId, body) {
  return gfetch(`${DATA}/properties/${propertyId}:runReport`, { method: "POST", body: JSON.stringify(body) });
}

async function scalar(pid, metric, start, end) {
  const d = await runReport(pid, { dateRanges: [{ startDate: start, endDate: end }], metrics: [{ name: metric }] });
  const v = d.rows && d.rows[0] && d.rows[0].metricValues && d.rows[0].metricValues[0];
  return v ? Number(v.value) : 0;
}

async function topRows(pid, dimension, metric, start, end, limit, dimensionFilter) {
  const body = {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit,
  };
  if (dimensionFilter) body.dimensionFilter = dimensionFilter;
  const d = await runReport(pid, body);
  return (d.rows || []).map((r) => ({ key: r.dimensionValues[0].value, value: Number(r.metricValues[0].value) }));
}

// events with a conversions-style metric, falling back if keyEvents is unsupported
async function eventRows(pid, start, end, limit) {
  for (const metric of ["keyEvents", "conversions", "eventCount"]) {
    try {
      const rows = await topRows(pid, "eventName", metric, start, end, limit);
      return { metric, rows };
    } catch (e) { /* try next */ }
  }
  return { metric: "eventCount", rows: [] };
}

async function safeTop(...args) { try { return await topRows(...args); } catch (e) { return []; } }
async function safeScalar(pid, metrics, start, end) {
  for (const m of metrics) { try { return await scalar(pid, m, start, end); } catch (e) { /* try next */ } }
  return 0;
}

// Known AI-assistant referral sources (GA4 sessionSource values).
const AI_SOURCE_GROUPS = [
  ["ChatGPT", ["chatgpt", "openai", "oai.azure"]],
  ["Gemini", ["gemini", "bard.google"]],
  ["Perplexity", ["perplexity"]],
  ["Microsoft Copilot", ["copilot", "edgeservices"]],
  ["Claude", ["claude.ai"]],
  ["Other AI", ["poe.com", "you.com", "phind", "deepseek", "grok"]],
];
function classifyAiSource(source) {
  const s = (source || "").toLowerCase();
  for (const [label, pats] of AI_SOURCE_GROUPS) if (pats.some((p) => s.includes(p))) return label;
  return null;
}

export async function buildGaReport(propertyId, range) {
  const r = range && range.start ? range : (() => { const m = monthRanges(); return { start: m.curStart, end: m.curEnd, prevStart: m.prevStart, prevEnd: m.prevEnd }; })();
  const curStart = r.start, curEnd = r.end, prevStart = r.prevStart, prevEnd = r.prevEnd;

  const [usersCur, usersPrev, topPagesCur, topPagesPrev, sources, referrals, countries, events, aiRowsRaw, landingRaw, sessionsCur, engagedCur, keyEventsCur] = await Promise.all([
    scalar(propertyId, "activeUsers", curStart, curEnd),
    scalar(propertyId, "activeUsers", prevStart, prevEnd),
    topRows(propertyId, "pagePath", "screenPageViews", curStart, curEnd, 10),
    topRows(propertyId, "pagePath", "screenPageViews", prevStart, prevEnd, 200),
    topRows(propertyId, "sessionDefaultChannelGroup", "totalUsers", curStart, curEnd, 10),
    topRows(propertyId, "sessionSource", "totalUsers", curStart, curEnd, 10,
      { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Referral" } } }),
    topRows(propertyId, "country", "screenPageViews", curStart, curEnd, 10),
    eventRows(propertyId, curStart, curEnd, 20),
    safeTop(propertyId, "sessionSource", "totalUsers", curStart, curEnd, 250),
    safeTop(propertyId, "landingPage", "sessions", curStart, curEnd, 12),
    safeScalar(propertyId, ["sessions"], curStart, curEnd),
    safeScalar(propertyId, ["engagedSessions"], curStart, curEnd),
    safeScalar(propertyId, ["keyEvents", "conversions"], curStart, curEnd),
  ]);

  const prevMap = Object.fromEntries(topPagesPrev.map((r) => [r.key, r.value]));
  const topPages = topPagesCur.map((r) => ({ page: r.key, views: r.value, prevViews: prevMap[r.key] || 0 }));

  // AI-assistant referrals (ChatGPT, Gemini, Perplexity, Copilot, Claude…)
  const aiAgg = {};
  for (const row of aiRowsRaw) {
    const label = classifyAiSource(row.key);
    if (label) aiAgg[label] = (aiAgg[label] || 0) + row.value;
  }
  const aiRows = Object.entries(aiAgg).map(([source, users]) => ({ source, users })).sort((a, b) => b.users - a.users);
  const aiTotal = aiRows.reduce((s, x) => s + x.users, 0);

  return {
    range: { curStart, curEnd, prevStart, prevEnd },
    users: { current: usersCur, previous: usersPrev },
    topPages,
    sources: sources.map((r) => ({ source: r.key, users: r.value })),
    referrals: referrals.map((r) => ({ source: r.key, users: r.value })),
    countries: countries.map((r) => ({ country: r.key, views: r.value })),
    events: { metric: events.metric, rows: events.rows.map((r) => ({ event: r.key, count: r.value })) },
    ai: { total: aiTotal, rows: aiRows },
    landingPages: (landingRaw || []).map((r) => ({ page: r.key, sessions: r.value })),
    journey: { users: usersCur, sessions: sessionsCur, engaged: engagedCur, keyEvents: keyEventsCur },
  };
}
