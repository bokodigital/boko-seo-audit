"use client";

import { PHASES, siteProfile, directoriesFor, buildRoadmap, buildContentIdeas, buildKeywordOpportunities } from "@/lib/reportBuilders";

const num = (n) => Number(n || 0).toLocaleString();

// Presentational roadmap — no inputs. Built entirely from the audit that just ran
// (on-page crawl + Ahrefs DR + Search Console + AI-readiness).
export function RoadmapView({ data, withPrint = false }) {
  if (!data || !data.audit) {
    return <div className="muted small">Run an audit on the <b>On-page audit</b> tab — your roadmap is generated automatically from its results.</div>;
  }
  const profile = siteProfile(data);
  const steps = buildRoadmap(data, profile);
  const ideas = buildContentIdeas(data, profile);
  const kws = buildKeywordOpportunities(data, profile);
  const dirs = directoriesFor(profile);
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

      {dirs.length > 0 && (<>
      <div className="section-h" style={{ marginTop: 20 }}>External links &amp; local directories to build</div>
      <p className="muted small" style={{ marginTop: 0 }}>Claim and complete these to grow referral traffic, local rankings and AI visibility. Use an identical business name, address, phone and URL on every one (consistent NAP), add photos and a steady stream of reviews, and link back to your site.</p>
      <table className="rpt-table">
        <thead><tr><th>Directory / channel</th><th>Type</th><th>Why it helps</th></tr></thead>
        <tbody>
          {dirs.map((d, i) => (
            <tr key={i}>
              <td>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer"><b>{d.name}</b></a> : <b>{d.name}</b>}</td>
              <td>{d.type}</td>
              <td className="muted small">{d.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </>)}

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
