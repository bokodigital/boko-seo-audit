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

const PHASES = ["Quick wins (this week)", "This month", "Next 90 days"];

const plist = (arr, n = 6) => arr.slice(0, n).join(", ") + (arr.length > n ? ` +${arr.length - n} more` : "");

// Synthesise a DEEP, data-specific SEO roadmap — naming the actual pages,
// queries and checks found in this audit rather than generic advice.
function buildRoadmap(data) {
  const steps = [];
  const au = data.audit, llm = data.llm, g = data.gsc;
  const add = (phase, title, action, why, impact, effort) => steps.push({ phase, title, action, why, impact, effort });

  // ---- Search Console: query-level opportunities (the highest-ROI, most specific) ----
  if (g && g.rows && g.rows.length) {
    const rows = g.rows;
    // Striking distance: ranking positions 4–20 = page 1–2 boundary, biggest upside
    g.rows.filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 5)
      .forEach((r) => add(PHASES[1],
        `Move “${r.query}” onto page 1`,
        `Currently position ${r.position.toFixed(1)} with ${num(r.impressions)} impressions/mo. Put this exact phrase in the target page's H1, <title> and first 100 words, add an on-page FAQ answering it, and add 2–3 internal links to that page using “${r.query}” as anchor text.`,
        `Page-2 rankings earn almost no clicks; reaching positions 1–3 typically lifts CTR from ~0–1% to 5–15%.`, "High", "Medium"));
    // High impressions, zero clicks = snippet/title problem (fast win)
    rows.filter((r) => r.impressions >= 40 && r.clicks === 0)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 3)
      .forEach((r) => add(PHASES[0],
        `Win clicks for “${r.query}”`,
        `You appear ${num(r.impressions)} times (avg pos ${r.position.toFixed(1)}) but get 0 clicks. Rewrite that page's <title> to lead with the searcher's goal + the phrase, and write a benefit-led 150–160 char meta description with a clear hook/CTA.`,
        `High visibility with no clicks is purely a title/snippet issue — the fastest traffic gain available.`, "High", "Low"));
  }

  // ---- Per-page fixes, naming the actual pages ----
  if (au && au.pages && au.pages.length) {
    const noTitle = au.pages.filter((p) => p.titleFlag === "missing").map((p) => p.path);
    const noDesc = au.pages.filter((p) => p.descFlag === "missing").map((p) => p.path);
    const lenIssues = au.pages.filter((p) => ["long", "short"].includes(p.titleFlag) || ["long", "short"].includes(p.descFlag)).map((p) => p.path);
    const altIssues = au.pages.filter((p) => p.imgsNoAlt > 0);
    const ogIssues = au.pages.filter((p) => !p.ogOk).map((p) => p.path);
    if (noTitle.length) add(PHASES[0], `Add <title> tags to ${noTitle.length} page(s)`, `Missing on: ${plist(noTitle)}. Write a unique 50–60 char title for each, leading with its primary keyword.`, "Pages without a title can't rank for their topic.", "High", "Low");
    if (noDesc.length) add(PHASES[0], `Add meta descriptions to ${noDesc.length} page(s)`, `Missing on: ${plist(noDesc)}. Add a unique 150–160 char description per page, summarising it with the keyword and a reason to click.`, "Descriptions drive click-through from the SERP.", "Medium", "Low");
    if (lenIssues.length) add(PHASES[1], `Fix title/description lengths on ${lenIssues.length} page(s)`, `e.g. ${plist(lenIssues, 5)}. Bring titles to 50–60 and descriptions to 150–160 chars so Google doesn't truncate or rewrite them.`, "Out-of-range tags get cut off or replaced, hurting CTR.", "Medium", "Low");
    if (altIssues.length) add(PHASES[1], `Add image alt text on ${altIssues.length} page(s)`, `e.g. ${plist(altIssues.map((p) => `${p.path} (${p.imgsNoAlt} img)`), 5)}. Describe each image with its keyword where natural.`, "Helps accessibility and Google Images traffic.", "Low", "Low");
    if (ogIssues.length) add(PHASES[1], `Complete Open Graph tags on ${ogIssues.length} page(s)`, `e.g. ${plist(ogIssues, 5)}. Add og:title / og:description / og:image / og:url so shares and AI link previews render correctly.`, "Controls how links look when shared and cited.", "Low", "Low");
  }

  // ---- Site-wide technical checks (specific failing items, not the meta ones above) ----
  if (au && au.categories) {
    au.categories.forEach((cat) => (cat.checks || []).forEach((c) => {
      if ((c.status === "fail" || c.status === "warn") && c.recommendation && !["title", "description", "img-alt", "opengraph"].includes(c.id)) {
        add(c.status === "fail" ? PHASES[0] : PHASES[1], c.label, c.recommendation, c.detail || "", c.status === "fail" ? "High" : "Medium", "Low");
      }
    }));
  }

  // ---- AI / LLM: concrete implementation steps tied to the failing checks ----
  if (llm && llm.checks) {
    const byId = Object.fromEntries(llm.checks.map((c) => [c.id, c]));
    const sampleQ = (g && g.rows && g.rows[0] && g.rows[0].query) || "your top question keyword";
    if (byId.jsonld && byId.jsonld.status !== "pass") add(PHASES[2], "Implement JSON-LD structured data", `Add sitewide Organization + WebSite (with SearchAction) + BreadcrumbList schema in <head>, plus Service schema on each service page and Article schema on blog posts. This is how ChatGPT, Gemini and Google AI identify what the business does and attribute answers to it.`, "AI engines rely on schema to extract entities and cite sources.", "High", "Medium");
    if (byId.faq && byId.faq.status !== "pass") add(PHASES[2], "Add FAQ schema mirroring real searches", `Add FAQPage JSON-LD with 4–6 Q&As to your top service pages, using actual Search Console questions as the questions (e.g. “${sampleQ}”). FAQ answers are frequently lifted verbatim into AI answers and Google rich results.`, "Directly answerable, structured content is what AI assistants quote.", "Medium", "Medium");
    if (byId.llmstxt && byId.llmstxt.status !== "pass") add(PHASES[2], "Publish an llms.txt file", `Create /llms.txt at the domain root — a short markdown list of your key pages (services, about, contact, top articles) each with a one-line summary, so LLM crawlers can map your offering. Keep it current as pages change.`, "Emerging standard for guiding AI crawlers to your best content.", "Medium", "Low");
  }

  // ---- Content strategy tied to the site's actual demand ----
  if (g && g.rows && g.rows.length) {
    const themes = [...new Set(g.rows.slice(0, 15).map((r) => r.query))].slice(0, 5);
    add(PHASES[2], "Build a topic cluster around your real demand",
      `Your impressions cluster around: ${themes.join("; ")}. Create one in-depth pillar page on that theme plus 3–4 supporting articles, all internally linked, to consolidate topical authority and capture the long tail — not one-off posts.`,
      "Topic clusters compound: they lift the whole group of related queries, not a single page.", "High", "High");
  }

  if (!steps.length) add(PHASES[1], "Run a full audit + connect Search Console", "Enter the site URL to crawl all pages, and connect Google so the roadmap can target your real pages and queries.", "The roadmap is generated from live audit + Search Console data.", "—", "—");
  return steps;
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
                <tbody>{ga.ai.rows.map((r, i) => <tr key={i}><td>{r.source}</td><td>{num(r.users)}</td></tr>)}</tbody>
              </table>
            </section>
          )}

          {ga && (
            <section className="rpt-sec">
              <h2>User journey</h2>
              <p className="muted small">Where visits begin and which pages they reach. (A full click-by-click path needs GA4 Path Exploration; this shows entry points and the most-viewed pages.)</p>
              <div className="rpt-grid">
                <div className="rpt-card"><h3>Top entry pages</h3>
                  <table className="rpt-table"><thead><tr><th>Landing page</th><th>Sessions</th></tr></thead><tbody>
                    {(ga.landingPages && ga.landingPages.length) ? ga.landingPages.map((p, i) => <tr key={i}><td>{p.page}</td><td>{num(p.sessions)}</td></tr>) : <tr><td className="muted">No landing-page data.</td></tr>}
                  </tbody></table>
                </div>
                <div className="rpt-card"><h3>Most-viewed pages</h3>
                  <table className="rpt-table"><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>
                    {ga.topPages.map((p, i) => <tr key={i}><td>{p.page}</td><td>{num(p.views)}</td></tr>)}
                  </tbody></table>
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

          {(au || llm || g) && (() => {
            const steps = buildRoadmap(data);
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

          <div className="rpt-foot">Boko Digital · Strategize. Execute. Deliver. · {data.range.start} → {data.range.end}</div>
        </div>
      )}
    </>
  );
}
