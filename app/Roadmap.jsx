"use client";

import { buildRoadmap, PHASES } from "./Report";

const num = (n) => Number(n || 0).toLocaleString();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// External links & local directories to build (AU-focused). Consistent NAP
// listings lift local rankings, send referral traffic, and give AI assistants
// authoritative sources that name the business.
const DIRECTORIES = [
  { name: "Google Business Profile", url: "https://business.google.com", type: "Local listing", why: "The biggest local-traffic and map-pack driver; also a top source AI assistants read." },
  { name: "Bing Places", url: "https://www.bingplaces.com", type: "Local listing", why: "Feeds Bing and Microsoft Copilot; claim it straight from your Google profile." },
  { name: "Apple Business Connect", url: "https://businessconnect.apple.com", type: "Local listing", why: "Powers Apple Maps and Siri results." },
  { name: "True Local", url: "https://www.truelocal.com.au", type: "AU directory", why: "Major Australian consumer directory and strong local citation." },
  { name: "Yellow Pages AU", url: "https://www.yellowpages.com.au", type: "AU directory", why: "High-authority AU citation with referral traffic." },
  { name: "Yelp Australia", url: "https://www.yelp.com.au", type: "AU reviews", why: "Reviews plus a citation that AI answer engines frequently cite." },
  { name: "Hotfrog Australia", url: "https://www.hotfrog.com.au", type: "AU directory", why: "Free business listing and backlink." },
  { name: "StartLocal", url: "https://www.startlocal.com.au", type: "AU directory", why: "Australia-only local business directory." },
  { name: "Word of Mouth (WOMO)", url: "https://www.womo.com.au", type: "AU reviews", why: "Trusted AU reviews directory for service businesses." },
  { name: "Clutch / DesignRush / GoodFirms / Sortlist", url: "https://clutch.co", type: "Agency / B2B", why: "Where buyers and LLMs compare agencies; review-driven authority and citations." },
  { name: "Industry & local associations", url: "", type: "Niche / trust", why: "Chamber of commerce, trade bodies and council business lists — high-trust, topical links." },
  { name: "SourceBottle / HARO", url: "https://www.sourcebottle.com", type: "Digital PR", why: "Answer journalist requests to earn editorial backlinks and brand mentions." },
];

// Keywords with real organic upside: already ranking page 1–2 (pos 4–20) with
// impressions — the realistic, competitive wins, ordered by opportunity size.
export function buildKeywordOpportunities(data) {
  const g = data.gsc;
  if (!g || !g.rows || !g.rows.length) return [];
  return g.rows
    .filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 5)
    .map((r) => ({
      query: r.query,
      position: Number(r.position),
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      upside: Math.max(0, Math.round(r.impressions * (0.08 - (r.ctr || 0)))),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 12);
}

// Specific content ideas generated from the site's real queries + gaps.
export function buildContentIdeas(data) {
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

// Presentational roadmap — no inputs. Built entirely from the audit that just ran
// (on-page crawl + Ahrefs DR + Search Console + AI-readiness).
export function RoadmapView({ data, withPrint = false }) {
  if (!data || !data.audit) {
    return <div className="muted small">Run an audit on the <b>On-page audit</b> tab — your roadmap is generated automatically from its results.</div>;
  }
  const steps = buildRoadmap(data);
  const ideas = buildContentIdeas(data);
  const kws = buildKeywordOpportunities(data);
  const gscConnected = data.gsc && data.gsc.rows && data.gsc.rows.length;

  return (
    <div className="report">
      <div className="rmsrc noprint">
        Built from this audit:
        <span className="srcpill on">On-page crawl{data.audit.pages ? ` · ${data.audit.pages.length} pages` : ""}</span>
        <span className={"srcpill" + (typeof data.dr === "number" ? " on" : "")}>Ahrefs DR{typeof data.dr === "number" ? ` ${data.dr}` : " —"}</span>
        <span className={"srcpill" + (gscConnected ? " on" : "")}>Search Console{gscConnected ? "" : " (add to show keyword data)"}</span>
        <span className={"srcpill" + (data.llm ? " on" : "")}>AI readiness{data.llm ? ` ${data.llm.score}/100` : ""}</span>
        {withPrint && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => window.print()}>⬇ Print / PDF</button>}
      </div>

      <div className="section-h">SEO action roadmap</div>
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

      <div className="section-h" style={{ marginTop: 20 }}>Keyword opportunities — best organic upside</div>
      {kws.length > 0 ? (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Queries where you already rank on page 1–2 (positions 4–20). These are the realistic competitive wins — you have proven visibility, so improving the page and links can move them up faster than chasing brand-new keywords.</p>
          <table className="rpt-table">
            <thead><tr><th>Keyword</th><th>Position</th><th>Impressions/mo</th><th>Clicks</th><th>Est. extra clicks if won</th></tr></thead>
            <tbody>
              {kws.map((k, i) => (
                <tr key={i}><td><b>{k.query}</b></td><td>{k.position.toFixed(1)}</td><td>{num(k.impressions)}</td><td>{num(k.clicks)}</td><td>+{num(k.upside)}/mo</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Full head-to-head competitor keyword gaps require a paid Ahrefs plan; this list uses your own Search Console data, which already reflects where you out- or under-rank rivals for shared terms.</p>
        </>
      ) : (
        <p className="muted small">Add the matching Search Console property so the roadmap can list the exact keywords with organic upside for this domain.</p>
      )}

      <div className="section-h" style={{ marginTop: 20 }}>External links &amp; local directories to build</div>
      <p className="muted small" style={{ marginTop: 0 }}>Claim and complete these to grow referral traffic, local rankings and AI visibility. Use an identical business name, address, phone and URL on every one (consistent NAP), add photos and a steady stream of reviews, and link back to your site.</p>
      <table className="rpt-table">
        <thead><tr><th>Directory / channel</th><th>Type</th><th>Why it helps</th></tr></thead>
        <tbody>
          {DIRECTORIES.map((d, i) => (
            <tr key={i}>
              <td>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer"><b>{d.name}</b></a> : <b>{d.name}</b>}</td>
              <td>{d.type}</td>
              <td className="muted small">{d.why}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
  );
}

// The Roadmap tab simply renders the roadmap generated by the last audit.
export default function Roadmap({ data }) {
  return <RoadmapView data={data} withPrint />;
}
