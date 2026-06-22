"use client";

import { useState, useCallback } from "react";

const num = (n) => Number(n || 0).toLocaleString();
const pct = (n) => (Number(n || 0) * 100).toFixed(1) + "%";
const signed = (n) => (n >= 0 ? "+" : "") + num(Math.abs(n) === n ? n : n);

function Delta({ cur, prev, lowerBetter, suffix }) {
  const c = Number(cur || 0), p = Number(prev || 0);
  const d = c - p;
  if (!p && !c) return null;
  const good = lowerBetter ? d < 0 : d > 0;
  const flat = d === 0;
  const cls = flat ? "flat" : good ? "up" : "down";
  const arrow = flat ? "→" : d > 0 ? "▲" : "▼";
  const val = suffix === "%" ? (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "%" : (d >= 0 ? "+" : "") + num(d);
  return <span className={"delta " + cls}>{arrow} {val}</span>;
}

function Metric({ label, value, cur, prev, lowerBetter, suffix }) {
  return (
    <div className="metric">
      <div className="m-label">{label}</div>
      <div className="m-value">{value}</div>
      <Delta cur={cur} prev={prev} lowerBetter={lowerBetter} suffix={suffix} />
      <div className="m-prev">prev: {suffix === "%" ? pct(prev) : suffix === "pos" ? Number(prev || 0).toFixed(1) : num(prev)}</div>
    </div>
  );
}

export default function Report({ api, properties = [], sites = [], defaultUrl = "", start, end }) {
  const [propertyId, setPropertyId] = useState(properties[0] ? properties[0].id : "");
  const [site, setSite] = useState(sites[0] ? sites[0].siteUrl : "");
  const [url, setUrl] = useState(defaultUrl || (sites[0] ? sites[0].siteUrl.replace("sc-domain:", "https://") : ""));
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const generate = useCallback(async () => {
    if (!propertyId && !site && !url.trim()) { setErr("Choose a GA4 property, a Search Console site, and/or a URL."); return; }
    setBusy(true); setErr(""); setData(null);
    const out = { generatedAt: new Date().toISOString(), range: { start: s, end: e }, site, url };
    const jobs = [];
    if (propertyId) jobs.push(api("/api/ga/report", { method: "POST", body: JSON.stringify({ propertyId, start: s, end: e }) }).then((r) => r.json()).then((d) => { if (!d.error) out.ga = d; }).catch(() => {}));
    if (site) jobs.push(api("/api/gsc", { method: "POST", body: JSON.stringify({ siteUrl: site, start: s, end: e }) }).then((r) => r.json()).then((d) => { if (!d.error) out.gsc = d; }).catch(() => {}));
    if (url.trim()) {
      jobs.push(api("/api/audit", { method: "POST", body: JSON.stringify({ url }) }).then((r) => r.json()).then((d) => { if (!d.error) out.audit = d; }).catch(() => {}));
      jobs.push(api("/api/llm", { method: "POST", body: JSON.stringify({ url }) }).then((r) => r.json()).then((d) => { if (!d.error) out.llm = d; }).catch(() => {}));
      jobs.push(api(`/api/ahrefs?target=${encodeURIComponent(url)}`).then((r) => r.json()).then((d) => { if (d && typeof d.domainRating === "number") out.dr = d.domainRating; }).catch(() => {}));
    }
    await Promise.all(jobs);
    if (!out.ga && !out.gsc && !out.audit && !out.llm) setErr("No data returned. Connect Google (for GA4/Search Console) and/or enter a site URL for the audit.");
    setData(out); setBusy(false);
  }, [api, propertyId, site, url, s, e]);

  const g = data && data.gsc;
  const ga = data && data.ga;
  const au = data && data.audit;
  const llm = data && data.llm;

  return (
    <>
      <div className="rpt-controls noprint">
        <div className="rpt-row">
          {properties.length > 0 && (
            <label>GA4 property
              <select className="inp" value={propertyId} onChange={(ev) => setPropertyId(ev.target.value)}>
                <option value="">— none —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
              </select>
            </label>
          )}
          {sites.length > 0 && (
            <label>Search Console site
              <select className="inp" value={site} onChange={(ev) => setSite(ev.target.value)}>
                <option value="">— none —</option>
                {sites.map((x) => <option key={x.siteUrl} value={x.siteUrl}>{x.siteUrl}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="rpt-row">
          <label>Website URL (audit + AI readiness)
            <input className="inp" value={url} placeholder="https://example.com" onChange={(ev) => setUrl(ev.target.value)} />
          </label>
        </div>
        <div className="rpt-row">
          <label>From <input className="inp" type="date" value={s} onChange={(ev) => setS(ev.target.value)} /></label>
          <label>To <input className="inp" type="date" value={e} onChange={(ev) => setE(ev.target.value)} /></label>
          <button className="btn primary" onClick={generate} disabled={busy}>{busy ? "Building report…" : "Generate report"}</button>
          {data && <button className="btn" onClick={() => window.print()}>⬇ Download / Print PDF</button>}
        </div>
        {err && <div className="err">⚠ {err}</div>}
        <div className="muted small">Comparison is against the equal-length period immediately before your selected range.</div>
      </div>

      {busy && <div className="loading"><div>Compiling your report</div><div style={{ marginTop: 10 }}><span className="dot" /><span className="dot" /><span className="dot" /></div></div>}

      {data && (
        <div className="report">
          <div className="rpt-cover">
            <div className="rpt-brand"><span className="rpt-logo">b</span><span>Boko Digital</span></div>
            <h1>Monthly SEO Report</h1>
            <div className="rpt-sub">{site || url || "Website"}</div>
            <div className="rpt-dates">{data.range.start} → {data.range.end}</div>
            <div className="muted small">Generated {new Date(data.generatedAt).toLocaleDateString()}</div>
          </div>

          {g && (
            <section className="rpt-sec">
              <h2>Search performance (Google Search Console)</h2>
              <div className="metrics">
                <Metric label="Total clicks" value={num(g.summary.clicks)} cur={g.summary.clicks} prev={g.prevSummary.clicks} />
                <Metric label="Total impressions" value={num(g.summary.impressions)} cur={g.summary.impressions} prev={g.prevSummary.impressions} />
                <Metric label="Average CTR" value={pct(g.summary.ctr)} cur={g.summary.ctr} prev={g.prevSummary.ctr} suffix="%" />
                <Metric label="Average position" value={Number(g.summary.position).toFixed(1)} cur={g.summary.position} prev={g.prevSummary.position} lowerBetter suffix="pos" />
              </div>
              <p className="rpt-note">
                Over {data.range.start} to {data.range.end}, the site recorded <b>{num(g.summary.clicks)}</b> clicks and <b>{num(g.summary.impressions)}</b> impressions
                at an average CTR of <b>{pct(g.summary.ctr)}</b> and average position <b>{Number(g.summary.position).toFixed(1)}</b>,
                compared with {num(g.prevSummary.clicks)} clicks and {num(g.prevSummary.impressions)} impressions in the prior period.
              </p>
              {g.rows && g.rows.length > 0 && (
                <>
                  <h3>Top queries</h3>
                  <table className="rpt-table">
                    <thead><tr><th>Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead>
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={i}><td>{r.query}</td><td>{num(r.clicks)}</td><td>{num(r.impressions)}</td><td>{pct(r.ctr)}</td><td>{Number(r.position).toFixed(1)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          )}

          {ga && (
            <section className="rpt-sec">
              <h2>Audience & engagement (Google Analytics 4)</h2>
              <div className="metrics">
                <Metric label="Active users" value={num(ga.users.current)} cur={ga.users.current} prev={ga.users.previous} />
              </div>
              <div className="rpt-grid">
                <div className="rpt-card"><h3>Most viewed pages</h3>
                  <table className="rpt-table"><thead><tr><th>Page</th><th>Views</th><th>Δ</th></tr></thead><tbody>
                    {ga.topPages.map((p, i) => <tr key={i}><td>{p.page}</td><td>{num(p.views)}</td><td>{signed(p.views - p.prevViews)}</td></tr>)}
                  </tbody></table>
                </div>
                <div className="rpt-card"><h3>Users by traffic source</h3>
                  <table className="rpt-table"><tbody>{ga.sources.map((x, i) => <tr key={i}><td>{x.source || "(unknown)"}</td><td>{num(x.users)}</td></tr>)}</tbody></table>
                </div>
                <div className="rpt-card"><h3>Referral users by source</h3>
                  <table className="rpt-table"><tbody>{ga.referrals.length ? ga.referrals.map((x, i) => <tr key={i}><td>{x.source}</td><td>{num(x.users)}</td></tr>) : <tr><td className="muted">No referral traffic.</td></tr>}</tbody></table>
                </div>
                <div className="rpt-card"><h3>Views by country</h3>
                  <table className="rpt-table"><tbody>{ga.countries.map((x, i) => <tr key={i}><td>{x.country}</td><td>{num(x.views)}</td></tr>)}</tbody></table>
                </div>
                <div className="rpt-card"><h3>Conversion events ({ga.events.metric})</h3>
                  <table className="rpt-table"><tbody>{ga.events.rows.length ? ga.events.rows.map((x, i) => <tr key={i}><td>{x.event}</td><td>{num(x.count)}</td></tr>) : <tr><td className="muted">No events.</td></tr>}</tbody></table>
                </div>
              </div>
            </section>
          )}

          {au && (
            <section className="rpt-sec">
              <h2>Technical SEO health</h2>
              <div className="metrics">
                <Metric label="Health score" value={au.score + "/100"} cur={au.score} prev={au.score} />
                <div className="metric"><div className="m-label">Pages crawled</div><div className="m-value">{au.pages ? au.pages.length : 0}</div></div>
                <div className="metric"><div className="m-label">Failed / warnings</div><div className="m-value">{au.counts.fail} / {au.counts.warn}</div></div>
                {typeof data.dr === "number" && <div className="metric"><div className="m-label">Ahrefs Domain Rating</div><div className="m-value">{data.dr}</div></div>}
              </div>
              {au.improvements && au.improvements.length > 0 && (
                <>
                  <h3>Priority fixes</h3>
                  {au.improvements.slice(0, 8).map((im, i) => (
                    <div className="rpt-issue" key={i}><span className={"sev " + im.severity}>{im.severity}</span><div><b>{im.label}</b>{im.recommendation && <div className="r">→ {im.recommendation}</div>}</div></div>
                  ))}
                </>
              )}
            </section>
          )}

          {llm && (
            <section className="rpt-sec">
              <h2>AI / LLM visibility readiness</h2>
              <p className="muted small">How well the site is structured for AI search engines (ChatGPT, Gemini, Google AI). Computed from the page itself.</p>
              <div className="metrics">
                <Metric label="AI readiness" value={llm.score + "/100"} cur={llm.score} prev={llm.score} />
                <div className="metric"><div className="m-label">Grade</div><div className="m-value">{llm.grade}</div></div>
                <div className="metric"><div className="m-label">Schema types</div><div className="m-value" style={{ fontSize: 14 }}>{llm.schemaTypes && llm.schemaTypes.length ? llm.schemaTypes.join(", ") : "none"}</div></div>
              </div>
              <h3>Checks</h3>
              <div className="rpt-checks">
                {llm.checks.map((c) => (
                  <div className="rpt-chk" key={c.id}><span className={"pill " + (c.status === "pass" ? "p-pass" : c.status === "warn" ? "p-warn" : "p-fail")}>{c.status}</span><div><b>{c.label}</b> <span className="muted">— {c.detail}</span></div></div>
                ))}
              </div>
              {llm.recommendations && llm.recommendations.length > 0 && (
                <>
                  <h3>Recommendations</h3>
                  {llm.recommendations.map((r, i) => <div className="rpt-issue" key={i}><span className={"sev " + r.severity}>{r.severity}</span><div><b>{r.label}</b><div className="r">→ {r.recommendation}</div></div></div>)}
                </>
              )}
            </section>
          )}

          <div className="rpt-foot">Boko Digital · Strategize. Execute. Deliver. · {data.range.start} → {data.range.end}</div>
        </div>
      )}
    </>
  );
}
