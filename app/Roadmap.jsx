"use client";

import { useState, useCallback } from "react";
import { buildRoadmap, PHASES } from "./Report";

const num = (n) => Number(n || 0).toLocaleString();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Specific content ideas generated from the site's real queries + gaps.
function buildContentIdeas(data) {
  const ideas = [];
  const g = data.gsc, au = data.audit;
  const seen = new Set();
  const push = (title, type, keyword, why) => {
    const k = title.toLowerCase();
    if (!seen.has(k)) { seen.add(k); ideas.push({ title, type, keyword, why }); }
  };
  if (g && g.rows && g.rows.length) {
    g.rows
      .filter((r) => /\b(how|what|why|where|who|when|can|is|are|does|do|best|guide)\b/i.test(r.query) || r.query.includes("?"))
      .slice(0, 4)
      .forEach((r) => push(`Guide / FAQ: “${cap(r.query)}”`, "How-to / FAQ", r.query, `Already ${num(r.impressions)} impressions (pos ${Number(r.position).toFixed(1)}) — a dedicated answer page can win the click and a featured snippet.`));
    g.rows
      .filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 4)
      .forEach((r) => push(`In-depth page targeting “${r.query}”`, "Pillar / service page", r.query, `Ranking pos ${Number(r.position).toFixed(1)} with ${num(r.impressions)} impressions — deeper, better-optimised content can push it onto page 1.`));
    const themes = [...new Set(g.rows.slice(0, 10).map((r) => r.query))].slice(0, 3);
    if (themes.length) push(`Pillar hub: ${themes.join(" / ")}`, "Pillar + cluster", themes[0], "Group your strongest demand into one authoritative hub with supporting articles to win the whole topic.");
  }
  if (au && au.pages) {
    au.pages.map((p) => p.path).filter((p) => /service|solution|product|work|marketing|develop|seo|ads|email|design/i.test(p)).slice(0, 2)
      .forEach((p) => push(`Case study / results piece for ${p}`, "Case study", p, "Proof-driven content on service pages lifts conversions and earns backlinks."));
  }
  push("“X vs Y” comparison in your niche", "Comparison", "", "Comparison content captures high-intent searchers and is frequently cited by AI assistants.");
  push("Annual checklist / template (lead magnet)", "Checklist / template", "", "Practical, linkable assets attract backlinks and email signups.");
  return ideas.slice(0, 12);
}

export default function Roadmap({ api, sites = [], defaultUrl = "", start, end }) {
  const [url, setUrl] = useState(defaultUrl || (sites[0] ? sites[0].siteUrl.replace("sc-domain:", "https://") : ""));
  const [site, setSite] = useState(sites[0] ? sites[0].siteUrl : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const generate = useCallback(async () => {
    if (!url.trim() && !site) { setErr("Enter a website URL (and optionally pick a Search Console site)."); return; }
    setBusy(true); setErr(""); setData(null);
    const out = {};
    const jobs = [];
    if (url.trim()) {
      jobs.push(api("/api/audit", { method: "POST", body: JSON.stringify({ url }) }).then((r) => r.json()).then((d) => { if (!d.error) out.audit = d; }).catch(() => {}));
      jobs.push(api("/api/llm", { method: "POST", body: JSON.stringify({ url }) }).then((r) => r.json()).then((d) => { if (!d.error) out.llm = d; }).catch(() => {}));
    }
    if (site) jobs.push(api("/api/gsc", { method: "POST", body: JSON.stringify({ siteUrl: site, start, end }) }).then((r) => r.json()).then((d) => { if (!d.error) out.gsc = d; }).catch(() => {}));
    await Promise.all(jobs);
    if (!out.audit && !out.gsc && !out.llm) setErr("No data returned. Enter a valid URL and/or connect Google.");
    setData(out); setBusy(false);
  }, [api, url, site, start, end]);

  const steps = data ? buildRoadmap(data) : [];
  const ideas = data ? buildContentIdeas(data) : [];

  return (
    <>
      <div className="rpt-controls noprint">
        <div className="rpt-row">
          <label>Website URL (audit + AI readiness)
            <input className="inp" value={url} placeholder="https://example.com" onChange={(e) => setUrl(e.target.value)} />
          </label>
          {sites.length > 0 && (
            <label>Search Console site
              <select className="inp" value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">— none —</option>
                {sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="rpt-row">
          <button className="btn primary" onClick={generate} disabled={busy}>{busy ? "Building roadmap…" : "Generate roadmap"}</button>
          {data && <button className="btn" onClick={() => window.print()}>⬇ Download / Print</button>}
        </div>
        {err && <div className="err">⚠ {err}</div>}
        <div className="muted small">Combines technical, on-page, Search Console and AI-readiness findings into a prioritised action plan, then suggests content to create.</div>
      </div>

      {busy && <div className="loading"><div>Building your roadmap</div><div style={{ marginTop: 10 }}><span className="dot" /><span className="dot" /><span className="dot" /></div></div>}

      {data && (
        <div className="report">
          <div className="section-h">SEO action roadmap</div>
          {steps.length === 0 && <div className="muted small">No actions generated — enter a site URL and/or connect Search Console.</div>}
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

          <div className="section-h" style={{ marginTop: 20 }}>Content suggestions</div>
          <p className="muted small" style={{ marginTop: 0 }}>Specific content to create next, generated from your real queries and gaps.</p>
          <table className="rpt-table">
            <thead><tr><th>Content idea</th><th>Type</th><th>Target keyword</th></tr></thead>
            <tbody>
              {ideas.map((c, i) => (
                <tr key={i}><td><b>{c.title}</b>{c.why && <div className="muted small">{c.why}</div>}</td><td>{c.type}</td><td>{c.keyword || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
