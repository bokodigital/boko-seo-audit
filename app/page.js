"use client";

import { useEffect, useState, useCallback } from "react";
import Report from "./Report";

function Logo() {
  return (
    <svg viewBox="5750 -2679.9 12500 4447.2" role="img" aria-label="boko">
      <path fill="#111213" d="M7218.1-1163.5h-880.7v-1237.2c0-203.6-103-279.3-230-279.3H5750v1516.3l293.1,0.1H5750V302c0,809.2,657.3,1465.3,1468.1,1465.3s1468.1-656,1468.1-1465.3S8029-1163.5,7218.1-1163.5z M7218.2,1181.3c-486.5,0-880.8-393.6-880.8-879.3v-879.3h880.8c486.5,0,880.8,393.6,880.8,879.3C8099.1,787.5,7704.7,1181.3,7218.2,1181.3z" />
      <path fill="#111213" d="M11286.9,302c0-485.6-394.3-879.3-880.8-879.3c-486.5,0-880.9,393.6-880.9,879.3s394.3,879.3,880.9,879.3C10892.6,1181.1,11286.9,787.5,11286.9,302z M11874.2,302c0,809.3-657.3,1465.3-1468.1,1465.3S8938,1111.2,8938,302c0-809.3,657.3-1465.3,1468.1-1465.3C11216.9-1163.5,11874.2-507.3,11874.2,302z" />
      <path fill="#BFFC00" d="M13174.5,1181.1c-14.8,0-29.6-0.7-44.1-2.1l1927.5-1923.7l-415.3-414.4L12715.2,764.6c-1.4-14.5-2.1-29.2-2.1-44v-1884.1h-587.3V720.6c0,578.1,469.4,1046.7,1048.6,1046.7H15062v-586.2H13174.5L13174.5,1181.1z" />
      <path fill="#111213" d="M17662.7,302c0-485.6-394.3-879.3-880.8-879.3s-880.9,393.6-880.9,879.3s394.5,879.3,880.9,879.3C17268.4,1181.3,17662.7,787.5,17662.7,302z M18250,302c0,809.3-657.3,1465.3-1468.1,1465.3c-810.9,0-1468.1-656.1-1468.1-1465.3c0-809.3,657.3-1465.3,1468.1-1465.3C17592.7-1163.5,18250-507.3,18250,302z" />
    </svg>
  );
}
function Topbar() {
  return (<div className="topbar"><div className="logo"><Logo /></div><span className="navlabel">SEO Audit & Analytics</span></div>);
}

const PILL = { pass: "p-pass", warn: "p-warn", notice: "p-notice", fail: "p-fail" };
const PILL_LABEL = { pass: "Pass", warn: "Warn", notice: "Note", fail: "Fail" };
const num = (n) => Number(n || 0).toLocaleString();
const pct = (n) => (n * 100).toFixed(1) + "%";
const signedNum = (n) => (n >= 0 ? "+" : "") + num(n);
function monthDefaults() {
  const n = new Date(), p = (x) => String(x).padStart(2, "0");
  return { start: `${n.getFullYear()}-${p(n.getMonth() + 1)}-01`, end: `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}` };
}
function summarize(pages) {
  return {
    titleMissing: pages.filter((p) => p.titleFlag === "missing").length,
    descMissing: pages.filter((p) => p.descFlag === "missing").length,
    titleLong: pages.filter((p) => p.titleFlag === "long").length,
    titleShort: pages.filter((p) => p.titleFlag === "short").length,
    descLong: pages.filter((p) => p.descFlag === "long").length,
    descShort: pages.filter((p) => p.descFlag === "short").length,
    altIssues: pages.filter((p) => p.imgsNoAlt > 0).length,
    ogMissing: pages.filter((p) => !p.ogOk).length,
  };
}

function KVList({ rows }) {
  if (!rows || !rows.length) return <div className="muted small" style={{ padding: "8px 0" }}>No data for this period.</div>;
  return rows.map((r, i) => (
    <div className="kv" key={i}><span className="k">{r.k}</span><span className="v">{r.v}</span></div>
  ));
}

export default function Page() {
  const [authed, setAuthed] = useState(null);
  const [pw, setPw] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [view, setView] = useState("audit");

  // audit
  const [url, setUrl] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastOrigin, setLastOrigin] = useState("");
  const [dr, setDr] = useState(null);
  const [crawl, setCrawl] = useState(null);

  // analytics
  const [gaState, setGaState] = useState({ loaded: false, configured: false, properties: [], error: "" });
  const [propertyId, setPropertyId] = useState("");
  const [ga, setGa] = useState(null);
  const [gaLoading, setGaLoading] = useState(false);
  const [gaError, setGaError] = useState("");
  const [gscState, setGscState] = useState({ loaded: false, configured: false, sites: [], error: "" });
  const [site, setSite] = useState("");
  const [gsc, setGsc] = useState(null);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscError, setGscError] = useState("");
  const [start, setStart] = useState(() => monthDefaults().start);
  const [end, setEnd] = useState(() => monthDefaults().end);

  const api = useCallback((path, opts = {}) => fetch(path, {
    ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}), ...(pw ? { "x-app-password": pw } : {}) },
  }), [pw]);

  const checkAuth = useCallback(async () => { const r = await api("/api/audit"); setAuthed(r.status !== 401); }, [api]);
  useEffect(() => { checkAuth(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (pw) checkAuth(); /* eslint-disable-next-line */ }, [pw]);

  const run = async () => {
    if (!url.trim()) return;
    setLoading(true); setError(""); setReport(null); setDr(null); setCrawl(null);
    try {
      const r = await api("/api/audit", { method: "POST", body: JSON.stringify({ url }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Audit failed");
      setReport(d);
      let origin = url;
      try { origin = new URL(d.finalUrl).origin; setLastOrigin(origin); if (!site) setSite(origin + "/"); } catch (e) {}
      // Fetch Ahrefs Domain Rating (free metric); never blocks the audit.
      api(`/api/ahrefs?target=${encodeURIComponent(origin)}`)
        .then((res) => res.json())
        .then((x) => { if (x && x.configured !== false && typeof x.domainRating === "number") setDr(x.domainRating); })
        .catch(() => {});
    } catch (e) { setError(e.message || String(e)); } finally { setLoading(false); }
  };

  const crawlAll = async () => {
    if (!report) return;
    setCrawl({ running: true, total: 0, done: 0, pages: [], error: "" });
    try {
      const dr = await api("/api/audit/discover", { method: "POST", body: JSON.stringify({ url: report.finalUrl }) });
      const dd = await dr.json();
      if (!dr.ok) throw new Error(dd.error || "Discovery failed");
      const urls = dd.urls || [];
      if (!urls.length) { setCrawl({ running: false, total: 0, done: 0, pages: [], error: "No sitemap URLs found to crawl." }); return; }
      const BATCH = 12;
      let acc = [];
      setCrawl({ running: true, total: urls.length, done: 0, pages: [], error: "" });
      for (let i = 0; i < urls.length; i += BATCH) {
        const batch = urls.slice(i, i + BATCH);
        const pr = await api("/api/audit/pages", { method: "POST", body: JSON.stringify({ urls: batch }) });
        const pd = await pr.json();
        if (pr.ok && pd.pages) acc = acc.concat(pd.pages);
        const done = Math.min(i + BATCH, urls.length);
        setCrawl({ running: done < urls.length, total: urls.length, done, pages: acc, error: "" });
      }
    } catch (e) { setCrawl({ running: false, total: 0, done: 0, pages: [], error: e.message || String(e) }); }
  };

  const loadProperties = useCallback(async () => {
    const r = await api("/api/ga/properties");
    const d = await r.json();
    if (!r.ok) { setGaState({ loaded: true, configured: true, properties: [], error: d.error || "Failed" }); return; }
    setGaState({ loaded: true, configured: d.configured, properties: d.properties || [], error: d.error || "" });
    if (d.properties && d.properties[0]) setPropertyId(d.properties[0].id);
  }, [api]);

  const loadSites = useCallback(async () => {
    const r = await api("/api/gsc");
    const d = await r.json();
    if (!r.ok) { setGscState({ loaded: true, configured: true, sites: [], error: d.error || "Failed" }); return; }
    setGscState({ loaded: true, configured: d.configured, sites: d.sites || [], error: d.error || "" });
    if (d.sites && d.sites.length) {
      setSite((prev) => {
        if (prev) return prev;
        let host = "";
        try { host = new URL(lastOrigin).host; } catch (e) {}
        const match = host && d.sites.find((s) => s.siteUrl.includes(host));
        return (match || d.sites[0]).siteUrl;
      });
    }
  }, [api, lastOrigin]);

  useEffect(() => {
    if (view !== "analytics") return;
    if (!gaState.loaded) loadProperties();
    if (!gscState.loaded) loadSites();
    /* eslint-disable-next-line */
  }, [view]);

  const loadGa = async () => {
    if (!propertyId) return;
    setGaLoading(true); setGaError(""); setGa(null);
    try {
      const r = await api("/api/ga/report", { method: "POST", body: JSON.stringify({ propertyId, start, end }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setGa(d);
    } catch (e) { setGaError(e.message || String(e)); } finally { setGaLoading(false); }
  };

  const loadGsc = async () => {
    if (!site.trim()) return;
    setGscLoading(true); setGscError(""); setGsc(null);
    try {
      const r = await api("/api/gsc", { method: "POST", body: JSON.stringify({ siteUrl: site, start, end }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setGsc(d);
    } catch (e) { setGscError(e.message || String(e)); } finally { setGscLoading(false); }
  };

  const flag = (label, f, len) => {
    const map = {
      ok: ["p-pass", label + " ok (" + len + ")"], missing: ["p-fail", label + " missing"],
      long: ["p-warn", label + " too long (" + len + ")"], short: ["p-warn", label + " too short (" + len + ")"],
    };
    const v = map[f] || map.ok;
    return <span className={"pill " + v[0]}>{v[1]}</span>;
  };

  if (authed === false) {
    return (<>
      <Topbar />
      <div className="gate">
        <span className="badge">SEO Audit</span><h2>Enter password</h2><p>This tool is password protected.</p>
        <input className="inp" type="password" value={pwInput} placeholder="Password" onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setPw(pwInput); }} />
        <div style={{ height: 10 }} /><button className="btn primary" style={{ width: "100%" }} onClick={() => setPw(pwInput)}>Unlock</button>
      </div>
    </>);
  }

  const ringStyle = report ? { background: `conic-gradient(var(--lime) ${report.score * 3.6}deg, var(--line) 0deg)` } : {};
  const crawledPages = crawl && crawl.pages && crawl.pages.length ? crawl.pages : null;
  const pageList = crawledPages || (report ? report.pages : []) || [];
  const pageSummary = crawledPages ? summarize(crawledPages) : (report ? report.pageSummary : null);
  const usersDelta = ga ? ga.users.current - ga.users.previous : 0;
  const usersPctTxt = ga && ga.users.previous ? ((usersDelta / ga.users.previous) * 100).toFixed(0) + "%" : "—";

  return (<>
    <Topbar />
    <div className="wrap">
      <div className="panel">
        <span className="badge">SEO Audit & Analytics</span>
        <h1 className="title">Technical SEO Audit & Analytics</h1>
        <div className="tabs noprint" style={{ marginTop: 14 }}>
          <button className={"tab" + (view === "audit" ? " active" : "")} onClick={() => setView("audit")}>On-page audit</button>
          <button className={"tab" + (view === "analytics" ? " active" : "")} onClick={() => setView("analytics")}>Analytics & Search</button>
          <button className={"tab" + (view === "report" ? " active" : "")} onClick={() => { setView("report"); if (!gaState.loaded) loadProperties(); if (!gscState.loaded) loadSites(); }}>Monthly Report</button>
        </div>

        {view === "audit" && (<>
          <p className="muted" style={{ marginTop: 14 }}>Enter a URL. Boko crawls the site and reports technical SEO health, per-page meta/alt/OG, and what to fix first.</p>
          <div className="searchrow">
            <input className="inp" value={url} placeholder="https://example.com" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
            <button className="btn primary" onClick={run} disabled={loading}>{loading ? "Auditing..." : "Run audit"}</button>
          </div>
          {error && <div className="err">⚠ {error}</div>}
          {loading && <div className="loading"><div>Crawling pages and running checks</div><div style={{ marginTop: 10 }}><span className="dot" /><span className="dot" /><span className="dot" /></div></div>}
          {report && (<>
            <div className="scorecard">
              <div className="ring" style={ringStyle}><div className="inner"><span className="num">{report.score}</span><span className="lbl">Health</span></div></div>
              <div className="score-meta">
                <h2>{report.score >= 80 ? "Healthy" : report.score >= 50 ? "Needs work" : "Critical issues"}</h2>
                <div className="url">{report.finalUrl}</div>
                <div className="tallies">
                  <span className="tally fail">{report.counts.fail} failed</span>
                  <span className="tally warn">{report.counts.warn} warnings</span>
                  <span className="tally pass">{report.counts.pass} passed</span>
                  {dr !== null && <span className="tally pass">Ahrefs DR {dr}</span>}
                </div>
              </div>
            </div>

            {report.improvements.length > 0 && (<>
              <div className="section-h">Top improvements ({report.improvements.length})</div>
              {report.improvements.map((im, i) => (
                <div className="imp" key={i}><span className={"sev " + im.severity}>{im.severity}</span>
                  <div><b>{im.label}</b>{im.detail && <div className="d">{im.detail}</div>}{im.recommendation && <div className="r">→ {im.recommendation}</div>}</div></div>
              ))}
            </>)}

            {pageList && pageList.length > 0 && (<>
              <div className="section-h">Per-page on-page SEO ({pageList.length} pages{crawledPages ? " — full site" : " crawled"})</div>
              {report.discovery && !crawledPages && (
                <div className="muted small" style={{ marginBottom: 10 }}>
                  {report.discovery.source === "sitemap"
                    ? `Pages discovered from the XML sitemap${report.discovery.viaGsc ? " (via Search Console)" : ""}${report.discovery.total ? ` — ${report.discovery.total} URLs found, auditing up to ${report.pages.length}` : ""}.`
                    : "No sitemap found — pages discovered by following on-page links."}
                </div>
              )}
              <div className="crawlall">
                <button className="btn" onClick={crawlAll} disabled={crawl && crawl.running}>
                  {crawl && crawl.running ? `Crawling… ${crawl.done}/${crawl.total}` : crawledPages ? "↻ Re-crawl all pages" : "Crawl all pages"}
                </button>
                {crawl && crawl.running && crawl.total > 0 && (
                  <div className="progress"><div className="bar" style={{ width: `${Math.round((crawl.done / crawl.total) * 100)}%` }} /></div>
                )}
                {crawl && !crawl.running && crawledPages && <span className="muted small">Audited all {crawl.total} sitemap pages.</span>}
                {crawl && crawl.error && <span className="err">⚠ {crawl.error}</span>}
              </div>
              <div className="tallies" style={{ marginBottom: 12 }}>
                <span className="tally fail">{pageSummary.titleMissing} missing title</span>
                <span className="tally fail">{pageSummary.descMissing} missing description</span>
                <span className="tally warn">{pageSummary.titleLong + pageSummary.titleShort} title length</span>
                <span className="tally warn">{pageSummary.descLong + pageSummary.descShort} description length</span>
                <span className="tally warn">{pageSummary.altIssues} missing alt</span>
                <span className="tally warn">{pageSummary.ogMissing} missing OG</span>
              </div>
              {pageList.map((pg, i) => (
                <div className="pagecard" key={i}>
                  <div className="pagepath">{pg.path}</div>
                  <div className="pageflags">
                    {flag("Title", pg.titleFlag, pg.titleLen)}
                    {flag("Desc", pg.descFlag, pg.descLen)}
                    <span className={"pill " + (pg.imgsNoAlt ? "p-warn" : "p-pass")}>Alt {pg.imgs - pg.imgsNoAlt}/{pg.imgs}</span>
                    <span className={"pill " + (pg.ogOk ? "p-pass" : "p-warn")}>OG {pg.ogOk ? "ok" : "missing"}</span>
                  </div>
                </div>
              ))}
            </>)}

            <div className="section-h">Site-wide technical checks</div>
            {report.categories.map((cat) => (
              <div className="cat" key={cat.name}><h3>{cat.name}</h3>
                {cat.checks.map((c) => (
                  <div className="chk" key={c.id}><span className={"pill " + PILL[c.status]}>{PILL_LABEL[c.status]}</span>
                    <div><div className="lbl">{c.label}</div>{c.detail && <div className="det">{c.detail}</div>}{c.status !== "pass" && c.recommendation && <div className="rec">→ {c.recommendation}</div>}</div></div>
                ))}
              </div>
            ))}
          </>)}
        </>)}

        {view === "analytics" && (<>
          <div className="daterow">
            <label>From <input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>To <input className="inp" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <span className="muted small">Both reports compare against the equal-length period just before this range.</span>
          </div>
          {/* GA4 */}
          <div className="section-h" style={{ marginTop: 8 }}>Google Analytics 4 — selected range vs previous period</div>
          {!gaState.loaded && <div className="muted small">Loading properties…</div>}
          {gaState.loaded && !gaState.configured && (
            <div className="err">Google isn't configured yet. Add the GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY env vars (see README) and grant the service account access to your GA4 property.</div>
          )}
          {gaState.loaded && gaState.configured && gaState.error && <div className="err">⚠ {gaState.error}</div>}
          {gaState.loaded && gaState.configured && !gaState.error && (
            <div className="searchrow">
              <select className="inp" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {gaState.properties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.account}) · {p.id}</option>)}
              </select>
              <button className="btn primary" onClick={loadGa} disabled={gaLoading || !propertyId}>{gaLoading ? "Loading..." : "Load report"}</button>
            </div>
          )}
          {gaError && <div className="err">⚠ {gaError}</div>}
          {ga && (<>
            <div className="scorecard" style={{ marginTop: 14 }}>
              <div><div className="ring" style={{ background: "var(--lime)" }}><div className="inner"><span className="num">{num(ga.users.current)}</span><span className="lbl">Users</span></div></div></div>
              <div className="score-meta">
                <h2>{num(ga.users.current)} users this period</h2>
                <div className="url">Previous period: {num(ga.users.previous)} · change {usersDelta >= 0 ? "+" : ""}{num(usersDelta)} ({usersPctTxt})</div>
                <div className="muted small" style={{ marginTop: 6 }}>{ga.range.curStart} → {ga.range.curEnd}</div>
              </div>
            </div>
            <div className="grid2cards">
              <div className="cat"><h3>Most viewed pages (vs previous period)</h3>
                <KVList rows={ga.topPages.map((p) => ({ k: p.page, v: `${num(p.views)} (${p.views - p.prevViews >= 0 ? "+" : ""}${num(p.views - p.prevViews)})` }))} /></div>
              <div className="cat"><h3>Users by traffic source</h3>
                <KVList rows={ga.sources.map((s) => ({ k: s.source || "(unknown)", v: num(s.users) }))} /></div>
              <div className="cat"><h3>Referral users by source</h3>
                <KVList rows={ga.referrals.map((s) => ({ k: s.source, v: num(s.users) }))} /></div>
              <div className="cat"><h3>Views by country</h3>
                <KVList rows={ga.countries.map((c) => ({ k: c.country, v: num(c.views) }))} /></div>
              <div className="cat"><h3>Conversion events ({ga.events.metric})</h3>
                <KVList rows={ga.events.rows.map((e) => ({ k: e.event, v: num(e.count) }))} /></div>
            </div>
          </>)}

          {/* GSC */}
          <div className="section-h">Search Console — selected range vs previous period</div>
          {gscState.loaded && !gscState.configured && (
            <div className="err">Google isn't configured yet. Add the GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY env vars (see README) and add the service account as a user on your Search Console property.</div>
          )}
          {gscState.loaded && gscState.configured && gscState.error && <div className="err">⚠ {gscState.error}</div>}
          <div className="searchrow">
            {gscState.sites.length > 0 ? (
              <select className="inp" value={site} onChange={(e) => setSite(e.target.value)}>
                {!site && <option value="">Select a verified site…</option>}
                {gscState.sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
              </select>
            ) : (
              <input className="inp" value={site} placeholder="https://example.com/ or sc-domain:example.com" onChange={(e) => setSite(e.target.value)} />
            )}
            <button className="btn primary" onClick={loadGsc} disabled={gscLoading || !site}>{gscLoading ? "Loading..." : "Load report"}</button>
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {gscState.sites.length > 0
              ? `${gscState.sites.length} verified ${gscState.sites.length === 1 ? "site" : "sites"} found on this account — pick one above.`
              : "No verified sites loaded yet. Enter the exact property as verified in Search Console (URL-prefix with trailing slash, or sc-domain: for domain properties)."}
          </div>
          {gscError && <div className="err">⚠ {gscError}</div>}
          {gsc && gsc.summary && (<>
            <div className="metrics" style={{ marginTop: 12 }}>
              <div className="metric"><div className="m-label">Total clicks</div><div className="m-value">{num(gsc.summary.clicks)}</div><div className="m-prev">prev {num(gsc.prevSummary.clicks)} · {signedNum(gsc.summary.clicks - gsc.prevSummary.clicks)}</div></div>
              <div className="metric"><div className="m-label">Total impressions</div><div className="m-value">{num(gsc.summary.impressions)}</div><div className="m-prev">prev {num(gsc.prevSummary.impressions)} · {signedNum(gsc.summary.impressions - gsc.prevSummary.impressions)}</div></div>
              <div className="metric"><div className="m-label">Average CTR</div><div className="m-value">{pct(gsc.summary.ctr)}</div><div className="m-prev">prev {pct(gsc.prevSummary.ctr)}</div></div>
              <div className="metric"><div className="m-label">Average position</div><div className="m-value">{Number(gsc.summary.position).toFixed(1)}</div><div className="m-prev">prev {Number(gsc.prevSummary.position).toFixed(1)}</div></div>
            </div>
            <div className="cat" style={{ marginTop: 12 }}><h3>Top keywords (max 30)</h3>
              <div className="kv" style={{ fontWeight: 800, color: "var(--ink)" }}><span className="k">Query</span><span className="v">Clicks · Impr · CTR · Pos</span></div>
              {gsc.rows.map((r, i) => (
                <div className="kv" key={i}><span className="k">{r.query}</span><span className="v">{num(r.clicks)} · {num(r.impressions)} · {pct(r.ctr)} · {r.position.toFixed(1)}</span></div>
              ))}
              {!gsc.rows.length && <div className="muted small" style={{ padding: "8px 0" }}>No keyword data for this period.</div>}
            </div>
          </>)}
        </>)}

        {view === "report" && (
          <Report api={api} properties={gaState.properties} sites={gscState.sites} defaultUrl={lastOrigin || url} start={start} end={end} />
        )}

        <div className="foot noprint">Boko Digital · Strategize. Execute. Deliver.</div>
      </div>
    </div>
  </>);
}
