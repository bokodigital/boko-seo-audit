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

// ---------------------------------------------------------------------------
// AI referral tracking
// One list drives both the server-side GA4 regex filter and the labelling, so
// the two can never drift apart. Patterns are matched against sessionSource.
// Note: Google AI Overviews / AI Mode clicks arrive as google / organic and
// cannot be separated in GA4; some AI apps strip the referrer (shows as Direct).
// ---------------------------------------------------------------------------
export const AI_ASSISTANTS = [
  { label: "ChatGPT", domain: "chatgpt.com", re: "chatgpt|openai" },
  { label: "Perplexity", domain: "perplexity.ai", re: "perplexity" },
  { label: "Gemini", domain: "gemini.google.com", re: "gemini\\.google|bard\\.google" },
  { label: "Microsoft Copilot", domain: "copilot.microsoft.com", re: "copilot|edgeservices\\.bing" },
  { label: "Claude", domain: "claude.ai", re: "claude\\.ai|anthropic" },
  { label: "Meta AI", domain: "meta.ai", re: "(^|\\.)meta\\.ai" },
  { label: "Grok", domain: "grok.com", re: "grok" },
  { label: "DeepSeek", domain: "chat.deepseek.com", re: "deepseek" },
  { label: "Mistral", domain: "mistral.ai", re: "mistral\\.ai" },
  { label: "Other AI", domain: null, re: "(^|\\.)you\\.com|poe\\.com|phind|kagi\\.com" },
];
const AI_REGEX = AI_ASSISTANTS.map((a) => a.re).join("|");
const AI_COMPILED = AI_ASSISTANTS.map((a) => [a.label, new RegExp(a.re, "i")]);

export function classifyAiSource(source) {
  const s = (source || "").toLowerCase();
  for (const [label, re] of AI_COMPILED) if (re.test(s)) return label;
  return null;
}

const AI_FILTER = { filter: { fieldName: "sessionSource", stringFilter: { matchType: "PARTIAL_REGEXP", value: AI_REGEX, caseSensitive: false } } };

// Parse a runReport response into objects keyed by header name. Handles the
// automatic "dateRange" dimension GA4 adds when two date ranges are requested.
export function parseRows(d) {
  const dh = (d.dimensionHeaders || []).map((h) => h.name);
  const mh = (d.metricHeaders || []).map((h) => h.name);
  return (d.rows || []).map((r) => {
    const o = {};
    dh.forEach((n, i) => { o[n] = r.dimensionValues[i].value; });
    mh.forEach((n, i) => { o[n] = Number(r.metricValues[i].value) || 0; });
    if (!("dateRange" in o)) o.dateRange = "date_range_0";
    return o;
  });
}

// Try a report with key events, falling back to conversions, then without.
async function runWithKeyEvents(pid, body) {
  for (const ke of ["keyEvents", "conversions", null]) {
    const metrics = [...body.metrics, ...(ke ? [{ name: ke }] : [])];
    try {
      const d = await runReport(pid, { ...body, metrics });
      return { keyMetric: ke, rows: parseRows(d) };
    } catch (e) { if (!ke) throw e; }
  }
}

// Aggregate AI rows (current + previous period) into the report shape.
export function summariseAi(rows, landingRows, site, keyMetric) {
  const blank = () => ({ users: 0, sessions: 0, engaged: 0, keyEvents: 0 });
  const by = {};
  const totals = { cur: blank(), prev: blank() };
  for (const r of rows) {
    const label = classifyAiSource(r.sessionSource);
    if (!label) continue;
    const per = r.dateRange === "date_range_1" ? "prev" : "cur";
    if (!by[label]) by[label] = { cur: blank(), prev: blank(), raw: new Set() };
    const t = by[label][per];
    t.users += r.totalUsers || 0; t.sessions += r.sessions || 0;
    t.engaged += r.engagedSessions || 0; t.keyEvents += keyMetric ? (r[keyMetric] || 0) : 0;
    const tt = totals[per];
    tt.users += r.totalUsers || 0; tt.sessions += r.sessions || 0;
    tt.engaged += r.engagedSessions || 0; tt.keyEvents += keyMetric ? (r[keyMetric] || 0) : 0;
    if (per === "cur") by[label].raw.add(r.sessionSource);
  }
  const rate = (a, b) => (b ? a / b : 0);
  const assistants = Object.entries(by).map(([source, v]) => ({
    source,
    domain: (AI_ASSISTANTS.find((a) => a.label === source) || {}).domain || null,
    users: v.cur.users, usersPrev: v.prev.users,
    sessions: v.cur.sessions, sessionsPrev: v.prev.sessions,
    engagementRate: rate(v.cur.engaged, v.cur.sessions),
    keyEvents: v.cur.keyEvents,
    rawSources: [...v.raw],
  })).sort((a, b) => b.sessions - a.sessions || b.usersPrev - a.usersPrev);

  const lp = {};
  for (const r of landingRows || []) {
    const label = classifyAiSource(r.sessionSource);
    if (!label) continue;
    const k = r.landingPage || "(not set)";
    if (!lp[k]) lp[k] = { page: k, sessions: 0, assistants: new Set() };
    lp[k].sessions += r.sessions || 0; lp[k].assistants.add(label);
  }
  const landingPages = Object.values(lp).sort((a, b) => b.sessions - a.sessions).slice(0, 10)
    .map((x) => ({ page: x.page, sessions: x.sessions, assistants: [...x.assistants] }));

  return {
    // `total` and `rows` kept for backward compatibility with older UI code.
    total: totals.cur.users,
    rows: assistants,
    users: totals.cur.users, usersPrev: totals.prev.users,
    sessions: totals.cur.sessions, sessionsPrev: totals.prev.sessions,
    engaged: totals.cur.engaged,
    keyEvents: totals.cur.keyEvents, keyEventsPrev: totals.prev.keyEvents,
    keyMetric,
    share: rate(totals.cur.sessions, site.sessions),
    sharePrev: rate(totals.prev.sessions, site.sessionsPrev),
    engagementRate: rate(totals.cur.engaged, totals.cur.sessions),
    siteEngagementRate: rate(site.engaged, site.sessions),
    landingPages,
  };
}

async function aiReferrals(pid, r, site) {
  const ranges = [{ startDate: r.start, endDate: r.end }, { startDate: r.prevStart, endDate: r.prevEnd }];
  const [bySource, byLanding] = await Promise.all([
    runWithKeyEvents(pid, {
      dateRanges: ranges,
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "engagedSessions" }],
      dimensionFilter: AI_FILTER,
      limit: 500,
    }),
    runReport(pid, {
      dateRanges: [ranges[0]],
      dimensions: [{ name: "landingPage" }, { name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: AI_FILTER,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 200,
    }).then(parseRows).catch(() => []),
  ]);
  return summariseAi(bySource.rows, byLanding, site, bySource.keyMetric);
}

// Users / sessions / engaged sessions for both periods in ONE request.
async function siteTotals(pid, r) {
  const d = await runReport(pid, {
    dateRanges: [{ startDate: r.start, endDate: r.end }, { startDate: r.prevStart, endDate: r.prevEnd }],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }],
  });
  const rows = parseRows(d);
  const cur = rows.find((x) => x.dateRange === "date_range_0") || {};
  const prev = rows.find((x) => x.dateRange === "date_range_1") || {};
  return {
    users: cur.activeUsers || 0, usersPrev: prev.activeUsers || 0,
    sessions: cur.sessions || 0, sessionsPrev: prev.sessions || 0,
    engaged: cur.engagedSessions || 0,
  };
}

const EMPTY_AI = { error: true, total: 0, rows: [], users: 0, usersPrev: 0, sessions: 0, sessionsPrev: 0, engaged: 0, keyEvents: 0, keyEventsPrev: 0, keyMetric: null, share: 0, sharePrev: 0, engagementRate: 0, siteEngagementRate: 0, landingPages: [] };

export async function buildGaReport(propertyId, range) {
  const r = range && range.start ? range : (() => { const m = monthRanges(); return { start: m.curStart, end: m.curEnd, prevStart: m.prevStart, prevEnd: m.prevEnd }; })();
  const curStart = r.start, curEnd = r.end, prevStart = r.prevStart, prevEnd = r.prevEnd;

  // GA4 allows ~10 concurrent requests per property, so the report runs in two
  // waves of at most 8 rather than firing everything at once.
  const [site, topPagesCur, topPagesPrev, sources, referrals, countries, events, keyEventsCur] = await Promise.all([
    siteTotals(propertyId, r),
    topRows(propertyId, "pagePath", "screenPageViews", curStart, curEnd, 10),
    topRows(propertyId, "pagePath", "screenPageViews", prevStart, prevEnd, 200),
    topRows(propertyId, "sessionDefaultChannelGroup", "totalUsers", curStart, curEnd, 10),
    topRows(propertyId, "sessionSource", "totalUsers", curStart, curEnd, 10,
      { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Referral" } } }),
    topRows(propertyId, "country", "screenPageViews", curStart, curEnd, 10),
    eventRows(propertyId, curStart, curEnd, 20),
    safeScalar(propertyId, ["keyEvents", "conversions"], curStart, curEnd),
  ]);
  const [ai, landingRaw] = await Promise.all([
    aiReferrals(propertyId, r, site).catch(() => EMPTY_AI),
    safeTop(propertyId, "landingPage", "sessions", curStart, curEnd, 12),
  ]);

  const prevMap = Object.fromEntries(topPagesPrev.map((x) => [x.key, x.value]));
  const topPages = topPagesCur.map((x) => ({ page: x.key, views: x.value, prevViews: prevMap[x.key] || 0 }));

  return {
    range: { curStart, curEnd, prevStart, prevEnd },
    users: { current: site.users, previous: site.usersPrev },
    topPages,
    sources: sources.map((x) => ({ source: x.key, users: x.value })),
    referrals: referrals.map((x) => ({ source: x.key, users: x.value, ai: !!classifyAiSource(x.key) })),
    countries: countries.map((x) => ({ country: x.key, views: x.value })),
    events: { metric: events.metric, rows: events.rows.map((x) => ({ event: x.key, count: x.value })) },
    ai,
    landingPages: (landingRaw || []).map((x) => ({ page: x.key, sessions: x.value })),
    journey: { users: site.users, sessions: site.sessions, engaged: site.engaged, keyEvents: keyEventsCur },
  };
}
