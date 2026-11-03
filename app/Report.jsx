"use client";

import { useState, useCallback, useEffect } from "react";
import { BUSINESS_TYPES, DIRECTORIES, PHASES, siteProfile, directoriesFor, parseList, buildKeywordOpportunities, buildContentIdeas, buildRoadmap, matchProperty, propertyMismatch } from "@/lib/reportBuilders";
import { clientFor, hostOf } from "@/lib/clients";

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

// Leave `prev` out when there is no previous-period figure (no delta is shown).
function Metric({ label, value, cur, prev, lowerBetter, suffix }) {
  const hasPrev = prev !== undefined && prev !== null;
  return (
    <div className="metric">
      <div className="m-label">{label}</div>
      <div className="m-value">{value}</div>
      {hasPrev && <Delta cur={cur} prev={prev} lowerBetter={lowerBetter} suffix={suffix} />}
      {hasPrev && <div className="m-prev">prev: {suffix === "%" ? pct(prev) : suffix === "pos" ? Number(prev || 0).toFixed(1) : num(prev)}</div>}
    </div>
  );
}

// Per-site report settings, remembered in this browser. Falls back to lib/clients.js.
const settingsKey = (host) => `boko-report:${host}`;
function loadSettings(host) {
  const cfg = clientFor(host) || {};
  const base = { type: "", listedOn: cfg.listedOn || [], exclude: (cfg.excludeKeywords || []).join(", ") };
  try { const raw = window.localStorage.getItem(settingsKey(host)); if (raw) return { ...base, ...JSON.parse(raw) }; } catch (e) {}
  return base;
}
function saveSettings(host, v) {
  try { window.localStorage.setItem(settingsKey(host), JSON.stringify(v)); } catch (e) {}
}

// Horizontal bar chart (pure CSS, prints cleanly, no external lib).
export function Bars({ rows, max }) {
  if (!rows || !rows.length) return <div className="muted small">No data for this period.</div>;
  const top = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="bars">
      {rows.slice(0, 8).map((r, i) => (
        <div className="barrow" key={i}>
          <div className="barlabel" title={r.label}>{r.label}</div>
          <div className="bartrack"><div className="barfill" style={{ width: Math.max(2, Math.round((r.value / (max || top)) * 100)) + "%" }} /></div>
          <div className="barval">{num(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

// Start→end user-flow funnel: centered, tapering, with drop-off % between stages.
export function FlowFunnel({ stages }) {
  const vals = stages.map((s) => Number(s.value) || 0);
  const max = Math.max(...vals, 1);
  return (
    <div className="flow">
      {stages.map((s, i) => {
        const v = Number(s.value) || 0;
        const w = Math.max(12, Math.round((v / max) * 100));
        const prev = i > 0 ? (Number(stages[i - 1].value) || 0) : null;
        const rate = prev ? Math.round((v / (prev || 1)) * 100) : null;
        return (
          <div className="flowstage" key={s.label}>
            {i > 0 && <div className="flowdrop">↓ {rate}% continued</div>}
            <div className="flowbar" style={{ width: w + "%" }}>
              <span className="flowname">{s.label}</span><span className="flowval">{num(v)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Per-page flow: for each top page, entries (where journeys start) vs total views.
export function PageFlow({ entries, views }) {
  const eMap = Object.fromEntries((entries || []).map((e) => [e.page, e.sessions]));
  const merged = (views || []).slice(0, 8).map((v) => ({ page: v.page, views: v.views, entries: eMap[v.page] || 0 }));
  if (!merged.length) return <div className="muted small">No page data for this period.</div>;
  const max = Math.max(...merged.map((m) => m.views), 1);
  return (
    <div className="pageflow">
      <div className="pflegend"><span><i className="e" />Entries (journeys started here)</span><span><i className="v" />Views (total)</span></div>
      {merged.map((m, i) => (
        <div className="pfrow" key={i}>
          <div className="pfpage" title={m.page}>{m.page}</div>
          <div className="pfbars">
            <div className="pfbar"><span className="pftrack"><span className="pffill e" style={{ width: Math.max(2, Math.round((m.entries / max) * 100)) + "%" }} /></span><span className="pfv">{num(m.entries)}</span></div>
            <div className="pfbar"><span className="pftrack"><span className="pffill v" style={{ width: Math.max(2, Math.round((m.views / max) * 100)) + "%" }} /></span><span className="pfv">{num(m.views)}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Real brand logo (favicon) shown before each AI assistant name.
const AI_DOMAIN = {
  "ChatGPT": "chatgpt.com",
  "Gemini": "gemini.google.com",
  "Perplexity": "perplexity.ai",
  "Microsoft Copilot": "copilot.microsoft.com",
  "Claude": "claude.ai",
};
function AiBadge({ label }) {
  const d = AI_DOMAIN[label];
  if (d) return <img className="ailogo" src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} alt="" />;
  return <span className="aibadge" style={{ background: "#6b7280" }}>AI</span>;
}


export default function Report({ api, properties = [], sites = [], defaultUrl = "", start, end }) {
  const [propertyId, setPropertyId] = useState("");
  const [site, setSite] = useState("");
  const [url, setUrl] = useState(defaultUrl || (sites[0] ? sites[0].siteUrl.replace("sc-domain:", "https://") : ""));
  const [picked, setPicked] = useState({ property: false, site: false });
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // Keep GA4 + Search Console on the audited site until someone picks one by hand.
  // No match means "none" — never another client's data.
  const host = hostOf(url || site);
  useEffect(() => {
    if (!picked.property) { const m = matchProperty(properties, url || site); setPropertyId(m ? m.id : ""); }
    if (!picked.site && host) { const m = sites.find((x) => hostOf(x.siteUrl) === host); setSite(m ? m.siteUrl : ""); }
    /* eslint-disable-next-line */
  }, [properties, sites, url]);

  const [settings, setSettings] = useState({ type: "", listedOn: [], exclude: "" });
  useEffect(() => { if (host) setSettings(loadSettings(host)); }, [host]);
  const updateSettings = (patch) => setSettings((prev) => { const v = { ...prev, ...patch }; if (host) saveSettings(host, v); return v; });
  const toggleListed = (name) => updateSettings({ listedOn: settings.listedOn.includes(name) ? settings.listedOn.filter((n) => n !== name) : [...settings.listedOn, name] });

  const property = properties.find((x) => x.id === propertyId);
  const gaMismatch = propertyMismatch(property, url || site);
  const siteMismatch = !!(site && url.trim() && hostOf(site) !== hostOf(url));
  const mismatch = gaMismatch || siteMismatch;

  const generate = useCallback(async () => {
    if (!propertyId && !site && !url.trim()) { setErr("Choose a GA4 property, a Search Console site, and/or a URL."); return; }
    if (mismatch) { setErr("The selected GA4 property or Search Console site belongs to a different website. Fix the selection first."); return; }
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
  }, [api, propertyId, site, url, s, e, mismatch]);

  const g = data && data.gsc;
  const ga = data && data.ga;
  const au = data && data.audit;
  const llm = data && data.llm;
  const rdata = data && { ...data, overrides: { type: settings.type || undefined, listedOn: settings.listedOn, exclude: parseList(settings.exclude) } };
  const profile = rdata && siteProfile(rdata);
  const dirs = profile ? directoriesFor(profile) : [];
  const localLeft = dirs.some((d) => d.local);
  const effectiveType = settings.type || (clientFor(host) || {}).type || "";

  return (
    <>
      <div className="rpt-controls noprint">
        <div className="rpt-row">
          {properties.length > 0 && (
            <label>GA4 property
              <select className="inp" value={propertyId} onChange={(ev) => { setPicked((x) => ({ ...x, property: true })); setPropertyId(ev.target.value); }}>
                <option value="">— none —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
              </select>
            </label>
          )}
          {sites.length > 0 && (
            <label>Search Console site
              <select className="inp" value={site} onChange={(ev) => { setPicked((x) => ({ ...x, site: true })); setSite(ev.target.value); }}>
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
        {gaMismatch && <div className="err">⚠ GA4 property “{property.name}” tracks {property.websites.join(", ")}, not {host}. Pick the right property (or none).</div>}
        {siteMismatch && <div className="err">⚠ Search Console site {site} is not {host}. Pick the matching site (or none).</div>}
        {host && properties.length > 0 && !propertyId && !picked.property && <div className="muted small">No GA4 property found for {host}, so the report will leave out Google Analytics.</div>}
        {host && (
          <details className="rpt-settings">
            <summary><b>Client details for {host}</b> <span className="muted small">— business type, directories already listed, keywords to leave out of recommendations (saved in this browser)</span></summary>
            <div className="rpt-row">
              <label>Business type
                <select className="inp" value={settings.type} onChange={(ev) => updateSettings({ type: ev.target.value })}>
                  <option value="">Auto{effectiveType ? ` (${(BUSINESS_TYPES.find((b) => b.id === effectiveType) || {}).label})` : ""}</option>
                  {BUSINESS_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
              <label>Keywords to leave out of recommendations (comma-separated)
                <input className="inp" value={settings.exclude} placeholder="e.g. a brand or person the client no longer works with" onChange={(ev) => updateSettings({ exclude: ev.target.value })} />
              </label>
            </div>
            <div className="m-label" style={{ marginTop: 8 }}>Already listed on (left out of the report)</div>
            <div className="rpt-checkgrid">
              {DIRECTORIES.map((d) => (
                <label key={d.name} className="small"><input type="checkbox" checked={settings.listedOn.includes(d.name)} onChange={() => toggleListed(d.name)} /> {d.name}</label>
              ))}
            </div>
          </details>
        )}
        <div className="rpt-row">
          <label>From <input className="inp" type="date" value={s} onChange={(ev) => setS(ev.target.value)} /></label>
          <label>To <input className="inp" type="date" value={e} onChange={(ev) => setE(ev.target.value)} /></label>
          <button className="btn primary" onClick={generate} disabled={busy || mismatch}>{busy ? "Building report…" : "Generate report"}</button>
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
              <div className="muted small" style={{ marginBottom: 10 }}>Property: <b>{data.site}</b> · {data.range.start} → {data.range.end}</div>
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
              {g.rows && g.rows.length > 0 && (() => {
                const clicked = g.rows.filter((r) => r.clicks > 0);
                const show = clicked.length ? clicked : g.rows;
                const hidden = g.rows.length - show.length;
                return (
                  <>
                    <h3>Top queries{clicked.length ? " (queries with clicks)" : ""}</h3>
                    <table className="rpt-table">
                      <thead><tr><th>Keyword</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead>
                      <tbody>
                        {show.map((r, i) => (
                          <tr key={i}><td>{r.query}</td><td>{num(r.clicks)}</td><td>{num(r.impressions)}</td><td>{pct(r.ctr)}</td><td>{Number(r.position).toFixed(1)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {hidden > 0 && <div className="muted small">{hidden} zero-click impression queries omitted.</div>}
                  </>
                );
              })()}
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

          {ga && ga.ai && ga.ai.rows && ga.ai.rows.length > 0 && (
            <section className="rpt-sec">
              <h2>Visits from AI assistants</h2>
              <p className="muted small">Users referred from AI search tools (ChatGPT, Gemini, Perplexity, Copilot, Claude…), identified by GA4 referral source.</p>
              <div className="metrics"><div className="metric"><div className="m-label">AI-referred users</div><div className="m-value">{num(ga.ai.total)}</div></div></div>
              <table className="rpt-table" style={{ marginTop: 10 }}>
                <thead><tr><th>Assistant</th><th>Users</th></tr></thead>
                <tbody>{ga.ai.rows.map((r, i) => <tr key={i}><td><AiBadge label={r.source} />{r.source}</td><td>{num(r.users)}</td></tr>)}</tbody>
              </table>
            </section>
          )}

          {ga && (
            <section className="rpt-sec">
              <h2>User journey</h2>
              <p className="muted small">How visitors move through the site — the conversion funnel, where journeys begin, and the pages they reach. (A literal click-by-click path needs GA4 Path Exploration; this is the API-available equivalent.)</p>
              {ga.journey && (
                <>
                  <h3>User flow (start → end)</h3>
                  <div className="muted small" style={{ marginBottom: 6 }}>{num(ga.journey.users)} active users across the period.</div>
                  <FlowFunnel stages={[
                    { label: "Sessions", value: ga.journey.sessions || ga.journey.users },
                    { label: "Engaged sessions", value: ga.journey.engaged },
                    { label: "Key events (conversions)", value: ga.journey.keyEvents },
                  ]} />
                  <div className="muted small">Visitors arrive → engage → convert. Percentages show how many continue to each stage.</div>
                  <div className="rpt-grid" style={{ marginTop: 14 }}>
                    <div className="rpt-card"><h3>Funnel by stage</h3>
                      <Bars rows={[
                        { label: "Sessions", value: ga.journey.sessions || ga.journey.users || 0 },
                        { label: "Engaged sessions", value: ga.journey.engaged || 0 },
                        { label: "Key events (conversions)", value: ga.journey.keyEvents || 0 },
                      ]} />
                    </div>
                    <div className="rpt-card"><h3>Stage breakdown</h3>
                      <table className="rpt-table"><thead><tr><th>Stage</th><th>Count</th><th>% of sessions</th></tr></thead><tbody>
                        {(() => { const s = ga.journey.sessions || ga.journey.users || 0; return [["Sessions", s], ["Engaged sessions", ga.journey.engaged || 0], ["Key events (conversions)", ga.journey.keyEvents || 0]].map((row, i) => <tr key={i}><td>{row[0]}</td><td>{num(row[1])}</td><td>{s ? Math.round((row[1] / s) * 100) : 0}%</td></tr>); })()}
                      </tbody></table>
                    </div>
                  </div>
                </>
              )}
              <h3 style={{ marginTop: 16 }}>Flow by page — entries vs views</h3>
              <p className="muted small" style={{ marginTop: 0 }}>For each top page: how many visitors <b>start</b> their journey there (entries) vs how many <b>reach</b> it overall (views).</p>
              <PageFlow entries={ga.landingPages} views={ga.topPages} />
            </section>
          )}

          {au && (
            <section className="rpt-sec">
              <h2>Technical SEO health</h2>
              <div className="metrics">
                <Metric label="Health score" value={au.score + "/100"} />
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
                <Metric label="AI readiness" value={llm.score + "/100"} />
                <div className="metric"><div className="m-label">Grade</div><div className="m-value">{llm.grade}</div></div>
              </div>
              {llm.schemaTypes && llm.schemaTypes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="m-label">Schema types detected ({llm.schemaTypes.length})</div>
                  <div className="schemalist">{llm.schemaTypes.map((t, i) => <span className="schematag" key={i}>{t}</span>)}</div>
                </div>
              )}
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

          {(au || llm || g) && (() => {
            const steps = buildRoadmap(rdata, profile);
            return (
              <section className="rpt-sec">
                <h2>SEO improvement roadmap</h2>
                <p className="muted small">Prioritised, actionable steps generated from this report&rsquo;s findings.</p>
                {PHASES.map((phase) => {
                  const ps = steps.filter((s) => s.phase === phase);
                  if (!ps.length) return null;
                  return (
                    <div className="rmphase" key={phase}>
                      <h3>{phase}</h3>
                      {ps.map((s, i) => (
                        <div className="rmstep" key={i}>
                          <div className="rmhead"><b>{s.title}</b><span className="chips"><span className="chip">Impact: {s.impact}</span><span className="chip">Effort: {s.effort}</span></span></div>
                          <div className="rmaction">→ {s.action}</div>
                          {s.why && <div className="muted small">{s.why}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {g && buildKeywordOpportunities(rdata, profile).length > 0 && (
            <section className="rpt-sec">
              <h2>Keyword opportunities — best organic upside</h2>
              <p className="muted small">Queries already ranking on page 1–2 (positions 4–20) — the realistic competitive wins, ordered by upside.</p>
              <table className="rpt-table">
                <thead><tr><th>Keyword</th><th>Position</th><th>Impressions/mo</th><th>Clicks</th><th>Est. extra clicks if won</th></tr></thead>
                <tbody>
                  {buildKeywordOpportunities(rdata, profile).map((k, i) => (
                    <tr key={i}><td><b>{k.query}</b></td><td>{k.position.toFixed(1)}</td><td>{num(k.impressions)}</td><td>{num(k.clicks)}</td><td>+{num(k.upside)}/mo</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {dirs.length > 0 && (
          <section className="rpt-sec">
            <h2>{localLeft ? <>External links &amp; local directories to build</> : <>External links &amp; PR to build</>}</h2>
            <p className="muted small">{localLeft
              ? "Claim and complete these to grow referral traffic, local rankings and AI visibility. Use identical business name, address, phone and URL on every one (consistent NAP)."
              : "Earn these links and mentions to grow referral traffic, authority and AI visibility."}</p>
            <table className="rpt-table">
              <thead><tr><th>Directory / channel</th><th>Type</th><th>Why it helps</th></tr></thead>
              <tbody>
                {dirs.map((d, i) => (
                  <tr key={i}><td>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer"><b>{d.name}</b></a> : <b>{d.name}</b>}</td><td>{d.type}</td><td className="muted small">{d.why}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          )}

          {buildContentIdeas(rdata, profile).length > 0 && (
            <section className="rpt-sec">
              <h2>Content suggestions</h2>
              <p className="muted small">Specific content to create next, generated from your real queries and gaps.</p>
              <table className="rpt-table">
                <thead><tr><th>Content idea</th><th>Type</th><th>Target keyword</th></tr></thead>
                <tbody>
                  {buildContentIdeas(rdata, profile).map((c, i) => (
                    <tr key={i}><td><b>{c.title}</b>{c.why && <div className="muted small">{c.why}</div>}</td><td>{c.type}</td><td>{c.keyword || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="rpt-foot">Boko Digital · Strategize. Execute. Deliver. · {data.range.start} → {data.range.end}</div>
        </div>
      )}
    </>
  );
}
