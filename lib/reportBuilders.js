// Pure builders for the Monthly Report and Roadmap (no React, so they can be
// tested with plain Node). Everything client-facing is tailored to the audited
// site via siteProfile(): its brand, business type, the directories it already
// has and the keywords to leave out.
import { clientFor, hostOf } from "./clients.js";

const num = (n) => Number(n || 0).toLocaleString();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plist = (arr, n = 6) => arr.slice(0, n).join(", ") + (arr.length > n ? ` +${arr.length - n} more` : "");

export const PHASES = ["Quick wins (this week)", "This month", "Next 90 days"];

export const BUSINESS_TYPES = [
  { id: "ecommerce", label: "Online store" },
  { id: "local", label: "Local / service business" },
  { id: "agency", label: "Agency / B2B" },
];

// External links & local directories to build (AU-focused). `only` limits a row
// to the business types it suits.
export const DIRECTORIES = [
  { name: "Google Business Profile", url: "https://business.google.com", type: "Local listing", local: true, why: "The biggest local-traffic and map-pack driver; also a top source AI assistants read." },
  { name: "Bing Places", url: "https://www.bingplaces.com", type: "Local listing", local: true, why: "Feeds Bing and Microsoft Copilot; claim it straight from your Google profile." },
  { name: "Apple Business Connect", url: "https://businessconnect.apple.com", type: "Local listing", local: true, why: "Powers Apple Maps and Siri results." },
  { name: "True Local", url: "https://www.truelocal.com.au", type: "AU directory", local: true, why: "Major Australian consumer directory and strong local citation." },
  { name: "Yellow Pages AU", url: "https://www.yellowpages.com.au", type: "AU directory", local: true, why: "High-authority AU citation with referral traffic." },
  { name: "Yelp Australia", url: "https://www.yelp.com.au", type: "AU reviews", local: true, why: "Reviews plus a citation that AI answer engines frequently cite." },
  { name: "Hotfrog Australia", url: "https://www.hotfrog.com.au", type: "AU directory", local: true, why: "Free business listing and backlink." },
  { name: "StartLocal", url: "https://www.startlocal.com.au", type: "AU directory", local: true, why: "Australia-only local business directory." },
  { name: "Word of Mouth (WOMO)", url: "https://www.womo.com.au", type: "AU reviews", local: true, only: ["local", "agency"], why: "Trusted AU reviews directory for service businesses." },
  { name: "Clutch / DesignRush / GoodFirms / Sortlist", url: "https://clutch.co", type: "Agency / B2B", only: ["agency"], why: "Where buyers and LLMs compare agencies; review-driven authority and citations." },
  { name: "Industry & local associations", url: "", type: "Niche / trust", why: "Chamber of commerce, trade bodies and council business lists — high-trust, topical links." },
  { name: "SourceBottle / HARO", url: "https://www.sourcebottle.com", type: "Digital PR", why: "Answer journalist requests to earn editorial backlinks and brand mentions." },
];

const decode = (s) => String(s || "").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—");

// Brand from the homepage <title> suffix ("Women's Clothing Shop | Venom Emilio").
function brandFromTitle(llm) {
  const t = llm && (llm.checks || []).find((c) => c.id === "title");
  const m = t && decode(t.detail).match(/Title: "(.*)"/);
  if (!m) return "";
  const parts = m[1].split(/\s[|–—-]\s/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function detectType(data) {
  const au = data.audit, ga = data.ga, llm = data.llm;
  // Product/collection detail pages, not a lone /shop/ page (e.g. a gift-voucher shop on a service site).
  if (au && (au.pages || []).filter((p) => /^\/(products?|collections)\/[^/]+/i.test(p.path || "")).length >= 2) return "ecommerce";
  if (ga && ga.events && (ga.events.rows || []).some((e) => /^(purchase|add_to_cart|begin_checkout)$/.test(e.event))) return "ecommerce";
  if (llm && (llm.schemaTypes || []).some((t) => /^(Product|Offer|ItemList)$/.test(t))) return "ecommerce";
  return "local";
}

export function parseList(s) {
  return String(s || "").split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

// overrides (from the report controls): { type, listedOn: [names], exclude: [phrases] }
export function siteProfile(data) {
  const d = data || {};
  const src = d.url || d.site || (d.audit && d.audit.finalUrl) || "";
  const host = hostOf(src);
  const cfg = clientFor(src) || {};
  const ov = d.overrides || {};
  const hostLabel = host.split(".")[0] || "";
  const brand = cfg.brand || brandFromTitle(d.llm) || cap(hostLabel) || "your business";
  const type = ov.type || cfg.type || detectType(d);
  const listedOn = new Set(ov.listedOn || cfg.listedOn || []);
  const exclude = (ov.exclude || cfg.excludeKeywords || []).map((x) => x.toLowerCase());
  const brandWords = [...new Set([hostLabel, ...brand.toLowerCase().split(/\s+/)].filter((w) => w.length >= 4))];
  const isBranded = (q) => {
    const s = String(q || "").toLowerCase();
    const compact = s.replace(/[^a-z0-9]/g, "");
    return (hostLabel.length >= 4 && compact.includes(hostLabel)) || brandWords.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s));
  };
  const isExcluded = (q) => exclude.some((x) => String(q || "").toLowerCase().includes(x));
  return { host, brand, type, listedOn, exclude, isBranded, isExcluded };
}

export function directoriesFor(profile) {
  return DIRECTORIES.filter((d) => (!d.only || d.only.includes(profile.type)) && !profile.listedOn.has(d.name));
}

// Search Console rows minus queries the client has asked us to leave out.
function gscRows(data, p) {
  const g = data.gsc;
  return g && g.rows ? g.rows.filter((r) => !p.isExcluded(r.query)) : [];
}
const striking = (rows) => rows.filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 5).sort((a, b) => b.impressions - a.impressions);

// Keywords with real organic upside: already ranking page 1–2 (pos 4–20).
export function buildKeywordOpportunities(data, profile) {
  const p = profile || siteProfile(data);
  return striking(gscRows(data, p))
    .map((r) => ({ query: r.query, position: Number(r.position), impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, upside: Math.max(0, Math.round(r.impressions * (0.08 - (r.ctr || 0)))) }))
    .slice(0, 12);
}

// Specific content ideas generated from the site's real non-brand queries + gaps.
export function buildContentIdeas(data, profile) {
  const p = profile || siteProfile(data);
  const ideas = [];
  const seen = new Set();
  const push = (title, type, keyword, why) => { const k = title.toLowerCase(); if (!seen.has(k)) { seen.add(k); ideas.push({ title, type, keyword, why }); } };
  const shop = p.type === "ecommerce";
  const rows = gscRows(data, p).filter((r) => !p.isBranded(r.query));
  if (rows.length) {
    rows.filter((r) => /\b(how|what|why|where|who|when|can|is|are|does|do|best|guide)\b/i.test(r.query) || r.query.includes("?")).slice(0, 4)
      .forEach((r) => push(`Guide / FAQ: “${cap(r.query)}”`, "How-to / FAQ", r.query, `Already ${num(r.impressions)} impressions (pos ${Number(r.position).toFixed(1)}) — a dedicated answer page can win the click and a featured snippet.`));
    striking(rows).slice(0, 4)
      .forEach((r) => push(shop ? `Collection page or style guide targeting “${r.query}”` : `In-depth page targeting “${r.query}”`, shop ? "Collection / buying guide" : "Pillar / service page", r.query, `Ranking pos ${Number(r.position).toFixed(1)} with ${num(r.impressions)} impressions — deeper, better-optimised content can push it onto page 1.`));
    const themes = [...new Set(rows.slice(0, 10).map((r) => r.query))].slice(0, 3);
    if (themes.length) push(`Pillar hub: ${themes.join(" / ")}`, "Pillar + cluster", themes[0], "Group your strongest non-brand demand into one authoritative hub with supporting articles to win the whole topic.");
  }
  if (!shop && data.audit && data.audit.pages) {
    data.audit.pages.map((x) => x.path).filter((x) => /service|solution|work|marketing|develop|seo|ads|email|design/i.test(x)).slice(0, 2)
      .forEach((x) => push(`Case study / results piece for ${x}`, "Case study", x, "Proof-driven content on service pages lifts conversions and earns backlinks."));
  }
  if (shop) {
    push("Fit, fabric or “X vs Y” style comparison guide", "Comparison", "", "Comparison content captures high-intent shoppers and is frequently cited by AI assistants.");
    push("Seasonal gift / occasion guide", "Gift guide", "", "Timely, linkable guides attract backlinks, social shares and email signups.");
  } else {
    push("“X vs Y” comparison in your niche", "Comparison", "", "Comparison content captures high-intent searchers and is frequently cited by AI assistants.");
    push("Annual checklist / template (lead magnet)", "Checklist / template", "", "Practical, linkable assets attract backlinks and email signups.");
  }
  return ideas.slice(0, 12);
}

export function buildRoadmap(data, profile) {
  const p = profile || siteProfile(data);
  const steps = [];
  const au = data.audit, llm = data.llm, g = data.gsc, ga = data.ga, dr = data.dr;
  const add = (phase, title, action, why, impact, effort) => steps.push({ phase, title, action, why, impact, effort });
  const shop = p.type === "ecommerce", agency = p.type === "agency";
  const moneyPages = shop ? "core collection pages" : "core service pages";
  const rows = gscRows(data, p);
  const nonBrand = rows.filter((r) => !p.isBranded(r.query));

  // ---- Search Console: query-level opportunities (the highest-ROI, most specific) ----
  if (rows.length) {
    // Striking distance: ranking positions 4–20 = page 1–2 boundary, biggest upside.
    // Non-brand only: a branded query on page 1 (e.g. "<brand> reviews") isn't fixed by on-page copy.
    striking(nonBrand).slice(0, 5)
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
    const noTitle = au.pages.filter((x) => x.titleFlag === "missing").map((x) => x.path);
    const noDesc = au.pages.filter((x) => x.descFlag === "missing").map((x) => x.path);
    const lenIssues = au.pages.filter((x) => ["long", "short"].includes(x.titleFlag) || ["long", "short"].includes(x.descFlag)).map((x) => x.path);
    const altIssues = au.pages.filter((x) => x.imgsNoAlt > 0);
    const ogIssues = au.pages.filter((x) => !x.ogOk).map((x) => x.path);
    if (noTitle.length) add(PHASES[0], `Add <title> tags to ${noTitle.length} page(s)`, `Missing on: ${plist(noTitle)}. Write a unique 30–60 char title for each, leading with its primary keyword.`, "Pages without a title can't rank for their topic.", "High", "Low");
    if (noDesc.length) add(PHASES[0], `Add meta descriptions to ${noDesc.length} page(s)`, `Missing on: ${plist(noDesc)}. Add a unique 150–160 char description per page, summarising it with the keyword and a reason to click.`, "Descriptions drive click-through from the SERP.", "Medium", "Low");
    if (lenIssues.length) add(PHASES[1], `Fix title/description lengths on ${lenIssues.length} page(s)`, `e.g. ${plist(lenIssues, 5)}. Bring titles to 30–60 and descriptions to 120–158 chars so Google doesn't truncate or rewrite them.`, "Out-of-range tags get cut off or replaced, hurting CTR.", "Medium", "Low");
    if (altIssues.length) add(PHASES[1], `Add image alt text on ${altIssues.length} page(s)`, `e.g. ${plist(altIssues.map((x) => `${x.path} (${x.imgsNoAlt} img)`), 5)}. Describe each image with its keyword where natural.`, "Helps accessibility and Google Images traffic.", "Low", "Low");
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

  // ---- AI / LLM: concrete implementation steps tied to the failing checks (homepage) ----
  if (llm && llm.checks) {
    const byId = Object.fromEntries(llm.checks.map((c) => [c.id, c]));
    const sampleQ = (nonBrand[0] && nonBrand[0].query) || "your top question keyword";
    if (byId.jsonld && byId.jsonld.status !== "pass") add(PHASES[2], "Implement JSON-LD structured data",
      shop
        ? `The homepage has no JSON-LD. Add sitewide Organization (logo, sameAs social profiles) + WebSite (with SearchAction) schema, BreadcrumbList on collection and product pages, and check every product page carries Product schema with price, availability and reviews. This is how Google Shopping, ChatGPT and Gemini identify the brand and its products.`
        : `The homepage has no JSON-LD. Add sitewide Organization + WebSite (with SearchAction) + BreadcrumbList schema in <head>, plus Service schema on each service page and Article schema on blog posts. This is how ChatGPT, Gemini and Google AI identify what the business does and attribute answers to it.`,
      "AI engines rely on schema to extract entities and cite sources.", "High", "Medium");
    if (byId.faq && byId.faq.status !== "pass") add(PHASES[2], "Add FAQ schema mirroring real searches", `Add FAQPage JSON-LD with 4–6 Q&As to your top ${shop ? "collection" : "service"} pages, using actual Search Console questions as the questions (e.g. “${sampleQ}”). FAQ answers are frequently lifted verbatim into AI answers and Google rich results.`, "Directly answerable, structured content is what AI assistants quote.", "Medium", "Medium");
    if (byId.llmstxt && byId.llmstxt.status !== "pass") add(PHASES[2], "Publish an llms.txt file", `Create /llms.txt at the domain root — a short markdown list of your key pages (${shop ? "main collections, size guide, shipping & returns, about" : "services, about, contact, top articles"}) each with a one-line summary, so LLM crawlers can map your offering. Keep it current as pages change.`, "Emerging standard for guiding AI crawlers to your best content.", "Medium", "Low");
  }

  // ---- Content strategy tied to the site's actual (non-brand) demand ----
  if (nonBrand.length) {
    const themes = [...new Set(nonBrand.slice(0, 15).map((r) => r.query))].slice(0, 5);
    add(PHASES[2], "Build a topic cluster around your real demand",
      `Your non-brand impressions cluster around: ${themes.join("; ")}. Create one in-depth pillar page on that theme plus 3–4 supporting articles, all internally linked, to consolidate topical authority and capture the long tail — not one-off posts.`,
      "Topic clusters compound: they lift the whole group of related queries, not a single page.", "High", "High");
  }

  // ---- AI / LLM VISIBILITY GROWTH (always on — earning citations, not just on-page schema) ----
  add(PHASES[2], "Earn citations on sources LLMs trust",
    agency
      ? `AI answers are synthesised mostly from third-party sources, so off-site presence is the biggest driver of AI visibility: get listed and reviewed on Clutch, G2, DesignRush and Google Business Profile; pursue mentions in “best digital agency” roundups and listicles; and answer relevant questions on Reddit, Quora and LinkedIn. The more authoritative places name ${p.brand}, the more ChatGPT/Gemini/Perplexity surface it.`
      : shop
        ? `AI answers are synthesised mostly from third-party sources, so off-site presence is the biggest driver of AI visibility: earn customer reviews on independent review sites, features in editorial “best of” roundups and gift guides for your category, press and creator coverage, and genuine mentions on Reddit and Quora. The more authoritative places name ${p.brand}, the more ChatGPT/Gemini/Perplexity surface it.`
        : `AI answers are synthesised mostly from third-party sources, so off-site presence is the biggest driver of AI visibility: keep a steady flow of Google reviews, pursue mentions in local “best of” roundups and local press, and answer relevant questions on Reddit and Quora. The more authoritative places name ${p.brand}, the more ChatGPT/Gemini/Perplexity surface it.`,
    "LLMs cite and paraphrase reputable third-party pages far more than a brand's own site.", "High", "Medium");
  add(PHASES[1], "Write answer-first, quotable content",
    "Lead each key page/section with a direct 2–3 sentence answer, then expand. Phrase H2s as the exact questions people ask, and add definitions, short lists and stats. This is the precise format ChatGPT, Gemini and Google AI lift into their answers.",
    "Concise, structured answers are what AI assistants quote verbatim.", "Medium", "Medium");
  add(PHASES[2], "Lock brand-entity consistency",
    `Use an identical business name, address and phone everywhere, and add sameAs links (${agency ? "LinkedIn, Instagram, Facebook, Clutch" : "Instagram, Facebook, TikTok, LinkedIn"}) to your Organization JSON-LD so AI engines confidently recognise ${p.brand} as one entity and attribute mentions to it.`,
    "Entity clarity is how AI engines connect scattered mentions to your brand.", "Medium", "Low");
  add(PHASES[1], "Track AI referrals every month",
    "Use the “Visits from AI assistants” section above as your AI-visibility KPI — growing ChatGPT / Gemini / Perplexity / Copilot referrals month over month confirms these efforts are working.",
    "What gets measured gets grown.", "Low", "Low");

  // ---- ORGANIC TRAFFIC GROWTH (Google Analytics + Search Console) ----
  add(PHASES[2], dr != null ? `Grow Domain Rating (currently ${dr}) with quality backlinks` : "Build authority with backlinks / digital PR",
    `${dr != null ? `Your Ahrefs Domain Rating is ${dr} — ` : ""}Publish one genuinely link-worthy asset (${shop ? "a trend report, size/fit study or strong style guide" : "a data study, benchmark or strong opinion piece"}) and pitch it to ${shop ? "fashion and lifestyle publications" : "industry publications"} and journalists; guest-post on relevant blogs; and pursue partner/supplier links. Prioritise a few high-authority referring domains over volume — even 5–10 good ones can lift DR and rankings sitewide. Backlinks are the strongest off-page ranking factor and feed Search Console impressions → GA4 organic users.`,
    "More authoritative referring domains = higher rankings across the whole site.", "High", "High");
  const localDirs = directoriesFor(p).filter((d) => d.local).map((d) => d.name);
  if (localDirs.length) add(PHASES[1], "List on high-value directories & local citations",
    `Build consistent name/address/phone (NAP) listings on the directories you're not on yet: ${localDirs.join(", ")}; plus your industry/association directories.${agency ? " As an agency, also claim Clutch, DesignRush, GoodFirms and Sortlist." : ""} Keep every listing identical — same NAP, categories and URL.`,
    "Citations are a top local-ranking signal, a durable backlink source, and authoritative places AI assistants read to name and verify the business.", "Medium", "Low");
  add(PHASES[1], "Internal-link your money pages",
    `Add contextual links from your highest-traffic pages and blog posts to your ${moneyPages} using descriptive keyword anchor text. It passes authority to the pages you want ranking and is one of the fastest on-site levers.`,
    "Internal links concentrate ranking power where it converts.", "Medium", "Low");
  add(PHASES[1], "Improve page speed / Core Web Vitals",
    "Compress and lazy-load images, defer non-critical scripts and trim heavy markup. Faster pages rank better in Google and cut bounce, growing engaged sessions in GA4.",
    "Speed is both a ranking factor and a direct lever on engagement.", "Medium", "Medium");
  if (rows.some((r) => /near me|near/i.test(r.query))) {
    const q = (rows.find((r) => /near me/i.test(r.query)) || rows.find((r) => /near/i.test(r.query)) || {}).query;
    add(PHASES[1], "Win the local pack & Google Business Profile",
      `You already show for local searches (e.g. “${q}”). Fully optimise your Google Business Profile — correct categories & services, photos, weekly posts and a steady stream of reviews — to capture map-pack and “near me” traffic that sits above organic results.`,
      "Local pack results rank above organic and convert highly.", "Medium", "Low");
  }
  add(PHASES[2], "Refresh & expand your top pages quarterly",
    "Update your best-performing pages every quarter — fresh stats, expanded sections, current-year references — to defend rankings against content decay and pick up more long-tail queries.",
    "Refreshing existing winners is higher-ROI than always starting new pages.", "Medium", "Low");
  // Only when GA4 shows no key events yet (or wasn't connected).
  const hasKeyEvents = ga && ((ga.journey && ga.journey.keyEvents > 0) || (ga.events && ga.events.metric !== "eventCount" && (ga.events.rows || []).some((e) => e.count > 0)));
  if (!hasKeyEvents) add(PHASES[1], "Set up Key Events in GA4",
    shop
      ? "Mark purchase, begin_checkout and add_to_cart as Key Events so traffic growth maps to revenue — then optimise toward the pages and channels that actually convert, growing qualified traffic rather than vanity sessions."
      : "Mark form submissions, quote requests and calls as Key Events so traffic growth maps to leads — then optimise toward the pages and channels that actually convert, growing qualified traffic rather than vanity sessions.",
    "Tying growth to conversions keeps it linked to revenue.", "Medium", "Low");
  add(PHASES[2], "Capture featured snippets (position 0)",
    "For question-style queries you rank for, add a concise 40–55 word answer directly under an H2 that matches the question. This wins the snippet box above the #1 result and lifts click-through.",
    "Position 0 grabs clicks even when you're not ranked #1.", "Medium", "Low");

  if (!steps.length) add(PHASES[1], "Run a full audit + connect Search Console", "Enter the site URL to crawl all pages, and connect Google so the roadmap can target your real pages and queries.", "The roadmap is generated from live audit + Search Console data.", "—", "—");
  return steps;
}

// GA4 property that belongs to the audited site: its web stream URL first, then its name.
export function matchProperty(properties, siteOrUrl) {
  const host = hostOf(siteOrUrl);
  if (!host || !properties || !properties.length) return null;
  const byStream = properties.find((x) => (x.websites || []).some((w) => hostOf(w) === host));
  if (byStream) return byStream;
  const label = host.split(".")[0];
  const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return properties.find((x) => squash(x.name).includes(label) || squash(x.name).includes(squash(host))) || null;
}

// True only when we know the property's website and it's a different site.
export function propertyMismatch(property, siteOrUrl) {
  const host = hostOf(siteOrUrl);
  if (!property || !host || !(property.websites || []).length) return false;
  return !property.websites.some((w) => hostOf(w) === host);
}
