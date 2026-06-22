// AI / LLM readiness audit — how discoverable and parseable a page is for
// AI search engines (ChatGPT, Gemini, Google AI). Computed from the site itself.
const UA = "Mozilla/5.0 (compatible; BokoSEOAudit/1.0; +https://boko.com.au)";

function normalize(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { return new URL(s).toString(); } catch (e) { return null; }
}

async function getRes(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal }); }
  catch (e) { return null; } finally { clearTimeout(t); }
}

const stripTags = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function metaContent(html, nameOrProp) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]*>`, "i"));
  if (!tag) return null;
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : "";
}

function chk(id, label, status, detail, recommendation, weight) {
  return { id, label, status, detail: detail || "", recommendation: recommendation || "", weight: weight || 2 };
}

export async function llmReadiness(input) {
  const url = normalize(input);
  if (!url) throw new Error("Please enter a valid website URL.");
  const origin = new URL(url).origin;

  const res = await getRes(url);
  if (!res || !res.ok) throw new Error(`Could not fetch ${url} (HTTP ${res ? res.status : "no response"}).`);
  const html = await res.text();

  const checks = [];

  // 1) Structured data (JSON-LD) — AI engines lean on schema to understand entities.
  const ldBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = [];
  for (const b of ldBlocks) {
    const tm = [...b.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((x) => x[1]);
    types.push(...tm);
  }
  const uniqTypes = [...new Set(types)];
  checks.push(chk("jsonld", "JSON-LD structured data",
    ldBlocks.length ? "pass" : "fail",
    ldBlocks.length ? `${ldBlocks.length} block(s); types: ${uniqTypes.join(", ") || "unspecified"}.` : "No JSON-LD structured data found.",
    "Add JSON-LD schema (Organization, WebSite, Article/Product, BreadcrumbList) so AI engines can parse your entities.", 3));

  // 2) FAQ / QAPage / HowTo — directly answerable content AI loves to cite.
  const answerable = /"@type"\s*:\s*"(FAQPage|QAPage|HowTo|Question)"/i.test(html);
  checks.push(chk("faq", "Answerable schema (FAQ/QA/HowTo)",
    answerable ? "pass" : "warn",
    answerable ? "FAQ/QA/HowTo schema present." : "No FAQ/QA/HowTo schema found.",
    "Add FAQPage or HowTo schema to question-style content — these are frequently surfaced and cited by AI assistants.", 2));

  // 3) llms.txt — emerging standard for guiding LLM crawlers.
  const llmsRes = await getRes(origin + "/llms.txt", 7000);
  const hasLlms = !!(llmsRes && llmsRes.ok);
  checks.push(chk("llmstxt", "llms.txt file",
    hasLlms ? "pass" : "warn",
    hasLlms ? "Found at /llms.txt." : "No /llms.txt found.",
    "Publish an llms.txt at the domain root summarising your key pages and content for LLM crawlers.", 1));

  // 4) Title
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  checks.push(chk("title", "Title tag", title.trim() ? "pass" : "fail",
    title.trim() ? `Title: "${title.trim().slice(0, 80)}"` : "Missing title.",
    "Add a clear, descriptive <title> — AI summaries often reuse it.", 2));

  // 5) Meta description
  const desc = metaContent(html, "description");
  checks.push(chk("desc", "Meta description", desc ? "pass" : "warn",
    desc ? `${desc.length} chars.` : "Missing meta description.",
    "Add a concise meta description (150–160 chars) summarising the page for AI snippets.", 2));

  // 6) Open Graph completeness — used by AI link previews/attribution.
  const ogOk = !!(metaContent(html, "og:title") && metaContent(html, "og:description") && metaContent(html, "og:image"));
  checks.push(chk("og", "Open Graph tags", ogOk ? "pass" : "warn",
    ogOk ? "og:title, og:description and og:image present." : "Incomplete Open Graph tags.",
    "Complete og:title, og:description, og:image and og:url for clean AI/social attribution.", 1));

  // 7) Heading structure (H1)
  const h1 = (html.match(/<h1\b/gi) || []).length;
  checks.push(chk("h1", "H1 heading", h1 === 1 ? "pass" : (h1 === 0 ? "fail" : "warn"),
    h1 === 0 ? "No H1 found." : `${h1} H1 heading(s).`,
    h1 === 1 ? "" : "Use exactly one clear H1 stating the page topic — it anchors AI topic extraction.", 2));

  // 8) Answerable content volume
  const words = stripTags(html).split(/\s+/).filter(Boolean).length;
  checks.push(chk("content", "Content depth", words >= 300 ? "pass" : "warn",
    `${words} words of visible text.`,
    words >= 300 ? "" : "Add substantive, well-structured text — thin pages are rarely cited by AI answers.", 2));

  // 9) Canonical
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  checks.push(chk("canonical", "Canonical URL", canonical ? "pass" : "warn",
    canonical ? "Canonical tag present." : "No canonical tag.",
    canonical ? "" : "Add a self-referencing canonical so AI crawlers attribute content to one URL.", 1));

  // 10) Crawlable (not noindex)
  const noindex = /noindex/i.test(metaContent(html, "robots") || "") || /noindex/i.test(res.headers.get("x-robots-tag") || "");
  checks.push(chk("indexable", "Indexable", noindex ? "fail" : "pass",
    noindex ? "Page is noindex." : "No noindex directive.",
    noindex ? "Remove noindex if you want AI/search engines to use this page." : "", 2));

  const sval = { pass: 1, warn: 0.5, fail: 0 };
  let wsum = 0, ssum = 0;
  for (const c of checks) { wsum += c.weight; ssum += c.weight * (sval[c.status] ?? 0); }
  const score = wsum ? Math.round((ssum / wsum) * 100) : 0;

  const recommendations = checks
    .filter((c) => c.status !== "pass" && c.recommendation)
    .sort((a, b) => b.weight - a.weight)
    .map((c) => ({ label: c.label, severity: c.status === "fail" ? "high" : "medium", recommendation: c.recommendation }));

  return {
    url, fetchedAt: new Date().toISOString(),
    score,
    grade: score >= 80 ? "Strong" : score >= 50 ? "Developing" : "Weak",
    schemaTypes: uniqTypes,
    counts: {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    },
    checks, recommendations,
  };
}
