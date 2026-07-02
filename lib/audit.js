// Self-contained technical SEO crawler + checks.
import { findSitemapUrl, urlsFromSitemaps, discoverFromSitemap } from "@/lib/sitemap";
import { googleConfigured } from "@/lib/google";
import { listSitemaps } from "@/lib/gsc";

const UA = "Mozilla/5.0 (compatible; BokoSEOAudit/1.0; +https://boko.com.au)";

function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { return new URL(s).toString(); } catch (e) { return null; }
}

async function timedFetch(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: ctrl.signal, ...opts });
  } finally { clearTimeout(t); }
}

// Follow redirects manually (cap), returning the chain + final response + body.
async function fetchWithChain(startUrl) {
  const chain = [];
  let url = startUrl;
  let res = null;
  for (let i = 0; i < 6; i++) {
    res = await timedFetch(url);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url).toString();
      chain.push({ from: url, to: next, status: res.status });
      url = next;
      continue;
    }
    break;
  }
  let body = "";
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html") || ct.includes("text/") || ct.includes("xml")) {
    try { body = await res.text(); } catch (e) { body = ""; }
  }
  return { finalUrl: url, status: res.status, headers: res.headers, body, chain };
}

// --- tiny HTML helpers (regex-based, good enough for technical checks) ---
const stripTags = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const firstMatch = (re, h) => { const m = h.match(re); return m ? m[1].trim() : null; };
const countMatches = (re, h) => (h.match(re) || []).length;

function metaContent(html, nameOrProp) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return null;
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : "";
}

function ck(id, label, status, detail, recommendation, weight) {
  return { id, label, status, detail: detail || "", recommendation: recommendation || "", weight: weight || 2 };
}

function analyzeHtml(html, finalUrl, headers, chain) {
  const checks = [];
  const isHttps = finalUrl.startsWith("https://");
  checks.push(ck("https", "HTTPS", isHttps ? "pass" : "fail",
    isHttps ? "Served over HTTPS." : "Page is not served over HTTPS.",
    "Serve the site over HTTPS with a valid certificate and redirect HTTP to HTTPS.", 3));

  // Redirects
  if (chain.length === 0) checks.push(ck("redirects", "Redirects", "pass", "No redirect before the final URL.", "", 1));
  else checks.push(ck("redirects", "Redirects", chain.length > 1 ? "warn" : "notice" === "notice" ? "pass" : "pass",
    `${chain.length} redirect hop(s): ${chain.map(c => c.status).join(" → ")}.`,
    chain.length > 1 ? "Reduce redirect chains to a single hop to save crawl budget and speed." : "", 1));

  // robots meta / x-robots
  const robotsMeta = (metaContent(html, "robots") || "").toLowerCase();
  const xRobots = (headers.get("x-robots-tag") || "").toLowerCase();
  const noindex = robotsMeta.includes("noindex") || xRobots.includes("noindex");
  checks.push(ck("indexable", "Indexable", noindex ? "fail" : "pass",
    noindex ? "Page is set to noindex (won't appear in search)." : "No noindex directive found.",
    noindex ? "Remove the noindex directive if this page should rank." : "", 3));

  // canonical
  const canonical = firstMatch(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i, html)
    || firstMatch(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i, html);
  checks.push(ck("canonical", "Canonical tag", canonical ? "pass" : "warn",
    canonical ? `Canonical: ${canonical}` : "No canonical tag found.",
    canonical ? "" : "Add a self-referencing canonical tag to prevent duplicate-content issues.", 2));

  // title
  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const tlen = title ? title.length : 0;
  checks.push(ck("title", "Title tag", !title ? "fail" : (tlen < 30 || tlen > 65) ? "warn" : "pass",
    title ? `"${title}" (${tlen} chars)` : "Missing <title>.",
    !title ? "Add a unique, descriptive <title>." : (tlen > 65 ? "Shorten the title to ~50-60 characters." : tlen < 30 ? "Lengthen the title to ~50-60 characters." : ""), 3));

  // meta description
  const desc = metaContent(html, "description");
  const dlen = desc ? desc.length : 0;
  checks.push(ck("description", "Meta description", desc == null ? "fail" : (dlen < 70 || dlen > 165) ? "warn" : "pass",
    desc == null ? "Missing meta description." : `${dlen} chars`,
    desc == null ? "Add a compelling meta description (~150-160 chars)." : (dlen > 165 ? "Trim the meta description to ~155 chars." : dlen < 70 ? "Expand the meta description to ~150 chars." : ""), 2));

  // H1
  const h1s = countMatches(/<h1[\s>]/gi, html);
  checks.push(ck("h1", "H1 heading", h1s === 1 ? "pass" : "warn",
    `${h1s} H1 tag(s) found.`,
    h1s === 0 ? "Add a single, descriptive H1." : h1s > 1 ? "Use exactly one H1 per page." : "", 2));

  // lang
  const lang = firstMatch(/<html[^>]*\slang=["']([^"']+)["']/i, html);
  checks.push(ck("lang", "Language attribute", lang ? "pass" : "warn",
    lang ? `lang="${lang}"` : "No lang attribute on <html>.",
    lang ? "" : "Add a lang attribute (e.g. <html lang=\"en\">) for accessibility & i18n.", 1));

  // viewport
  const viewport = metaContent(html, "viewport");
  checks.push(ck("viewport", "Mobile viewport", viewport ? "pass" : "fail",
    viewport ? "Viewport meta present." : "No viewport meta tag.",
    viewport ? "" : "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile.", 2));

  // charset
  const charset = /<meta[^>]+charset=/i.test(html);
  checks.push(ck("charset", "Charset", charset ? "pass" : "warn", charset ? "Charset declared." : "No charset meta.",
    charset ? "" : "Declare <meta charset=\"utf-8\"> early in <head>.", 1));

  // images missing alt
  const imgs = countMatches(/<img\b/gi, html);
  const imgsNoAlt = (html.match(/<img\b[^>]*>/gi) || []).filter(t => !/\balt=/i.test(t)).length;
  checks.push(ck("img-alt", "Image alt text", imgsNoAlt === 0 ? "pass" : imgsNoAlt > imgs / 2 ? "fail" : "warn",
    `${imgsNoAlt} of ${imgs} images missing alt.`,
    imgsNoAlt ? "Add descriptive alt text to images for accessibility & image SEO." : "", 1));

  // content length
  const words = stripTags(html).split(/\s+/).filter(Boolean).length;
  checks.push(ck("content", "Content length", words >= 300 ? "pass" : words >= 100 ? "warn" : "fail",
    `~${words} words of visible text.`,
    words < 300 ? "Thin content — aim for substantive, useful copy (300+ words where relevant)." : "", 1));

  // structured data
  const hasLd = /<script[^>]+application\/ld\+json/i.test(html);
  checks.push(ck("schema", "Structured data", hasLd ? "pass" : "notice",
    hasLd ? "JSON-LD structured data present." : "No JSON-LD structured data found.",
    hasLd ? "" : "Add JSON-LD schema (Organization, BreadcrumbList, Article/Product) for rich results.", 1));

  // open graph
  const ogTitle = metaContent(html, "og:title");
  const ogImage = metaContent(html, "og:image");
  checks.push(ck("opengraph", "Open Graph tags", (ogTitle && ogImage) ? "pass" : "warn",
    (ogTitle && ogImage) ? "og:title and og:image present." : "Missing og:title and/or og:image.",
    (ogTitle && ogImage) ? "" : "Add Open Graph tags (og:title, og:description, og:image) for better social sharing.", 1));

  // mixed content
  let mixed = 0;
  if (isHttps) mixed = (html.match(/(?:src|href)=["']http:\/\/[^"']+/gi) || []).length;
  checks.push(ck("mixed", "Mixed content", mixed === 0 ? "pass" : "warn",
    mixed === 0 ? "No insecure HTTP resources detected." : `${mixed} HTTP resource reference(s) on an HTTPS page.`,
    mixed ? "Load all resources over HTTPS to avoid mixed-content warnings." : "", 2));

  // compression
  const enc = (headers.get("content-encoding") || "").toLowerCase();
  checks.push(ck("compression", "Compression", /(gzip|br|deflate)/.test(enc) ? "pass" : "warn",
    enc ? `content-encoding: ${enc}` : "No compression header detected.",
    /(gzip|br|deflate)/.test(enc) ? "" : "Enable gzip or Brotli compression to reduce transfer size.", 1));

  // HSTS
  const hsts = headers.get("strict-transport-security");
  checks.push(ck("hsts", "HSTS header", hsts ? "pass" : "notice",
    hsts ? "Strict-Transport-Security present." : "No HSTS header.",
    hsts ? "" : "Add a Strict-Transport-Security header to enforce HTTPS.", 1));

  // page weight (html only)
  const kb = Math.round((html.length / 1024));
  checks.push(ck("weight", "HTML page weight", kb <= 150 ? "pass" : kb <= 400 ? "warn" : "fail",
    `~${kb} KB of HTML.`,
    kb > 150 ? "Large HTML payload — trim inline scripts/markup and lazy-load where possible." : "", 1));

  return { checks, links: extractInternalLinks(html, finalUrl) };
}

function extractInternalLinks(html, finalUrl) {
  const origin = new URL(finalUrl).origin;
  const hrefs = (html.match(/<a\b[^>]*href=["']([^"'#]+)["']/gi) || [])
    .map(t => (t.match(/href=["']([^"'#]+)["']/i) || [])[1])
    .filter(Boolean);
  const set = new Set();
  for (const h of hrefs) {
    try {
      const u = new URL(h, finalUrl);
      if (u.origin === origin && /^https?:/.test(u.protocol)) set.add(u.toString().split("#")[0]);
    } catch (e) {}
  }
  return [...set];
}

// Google-ish length thresholds
const T_MIN = 30, T_MAX = 60, D_MIN = 70, D_MAX = 160;
const MAX_PAGES = 20;

function titleFlag(t){ if(!t) return "missing"; if(t.length>T_MAX) return "long"; if(t.length<T_MIN) return "short"; return "ok"; }
function descFlag(d){ if(d==null||d==="") return "missing"; if(d.length>D_MAX) return "long"; if(d.length<D_MIN) return "short"; return "ok"; }

function metaRobotsNoindex(html){
  const m = (html || "").match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  return m ? /noindex/i.test(m[0]) : false;
}

// Ahrefs-style page severity: a page "has an error" if it's broken, deindexed,
// or missing a title/H1; lesser on-page problems are warnings.
function pageLevel(p){
  if (!p.status || p.status >= 400) return "error";
  if (p.status >= 300) return "warn";
  if (p.noindex) return "error";
  if (p.titleFlag === "missing") return "error";
  if (p.h1 === 0) return "error";
  if (p.titleFlag !== "ok" || p.descFlag !== "ok" || p.imgsNoAlt > 0 || !p.ogOk) return "warn";
  return "ok";
}

function analyzePageMeta(html, url, status = 200){
  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html) || "";
  const desc = metaContent(html, "description");
  const imgs = countMatches(/<img\b/gi, html);
  const imgsNoAlt = (html.match(/<img\b[^>]*>/gi) || []).filter(t => !/\balt=/i.test(t)).length;
  const ogTitle = metaContent(html, "og:title");
  const ogImage = metaContent(html, "og:image");
  const h1 = countMatches(/<h1[\s>]/gi, html);
  const noindex = metaRobotsNoindex(html);
  let path = url;
  try { const u = new URL(url); path = u.pathname + u.search; } catch(e){}
  const p = {
    url, path: path || "/", status,
    title, titleLen: title.length, titleFlag: titleFlag(title),
    desc: desc || "", descLen: desc ? desc.length : 0, descFlag: descFlag(desc),
    imgs, imgsNoAlt,
    ogOk: !!(ogTitle && ogImage),
    h1, noindex,
  };
  p.level = pageLevel(p);
  return p;
}

async function fetchPageHtml(url){
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("text/html")) return null;
    return await r.text();
  } catch(e){ return null; }
}

async function crawlPages(finalUrl, seedHtml, discoveredUrls){
  const pages = [ analyzePageMeta(seedHtml, finalUrl) ];
  const seen = new Set([finalUrl.split("#")[0]]);
  const source = (discoveredUrls && discoveredUrls.length)
    ? discoveredUrls
    : extractInternalLinks(seedHtml, finalUrl);
  const links = source.filter(u => !seen.has(u)).slice(0, MAX_PAGES - 1);
  const conc = 5;
  for (let i = 0; i < links.length; i += conc) {
    const batch = links.slice(i, i + conc);
    const htmls = await Promise.all(batch.map(u => fetchPageHtml(u)));
    htmls.forEach((h, j) => { if (h) pages.push(analyzePageMeta(h, batch[j])); });
  }
  const summary = {
    pages: pages.length,
    titleMissing: pages.filter(p => p.titleFlag === "missing").length,
    titleLong: pages.filter(p => p.titleFlag === "long").length,
    titleShort: pages.filter(p => p.titleFlag === "short").length,
    descMissing: pages.filter(p => p.descFlag === "missing").length,
    descLong: pages.filter(p => p.descFlag === "long").length,
    descShort: pages.filter(p => p.descFlag === "short").length,
    altIssues: pages.filter(p => p.imgsNoAlt > 0).length,
    ogMissing: pages.filter(p => !p.ogOk).length,
  };
  return { pages, summary };
}

async function checkBrokenLinks(links, max = 12) {
  const sample = links.slice(0, max);
  const broken = [];
  await Promise.all(sample.map(async (u) => {
    try {
      let r = await timedFetch(u, { method: "HEAD" }, 8000);
      if (r.status === 405 || r.status === 501) r = await timedFetch(u, { method: "GET" }, 8000);
      if (r.status >= 400) broken.push({ url: u, status: r.status });
    } catch (e) { broken.push({ url: u, status: "unreachable" }); }
  }));
  return { sampled: sample.length, total: links.length, broken };
}

async function checkRobotsAndSitemap(finalUrl) {
  const origin = new URL(finalUrl).origin;
  const out = [];
  let sitemapFromRobots = null;
  try {
    const r = await timedFetch(origin + "/robots.txt", {}, 8000);
    if (r.status === 200) {
      const txt = await r.text();
      const sm = txt.match(/Sitemap:\s*(\S+)/i);
      if (sm) sitemapFromRobots = sm[1];
      out.push(ck("robots", "robots.txt", "pass", sm ? "Present, declares a Sitemap." : "Present (no Sitemap directive).",
        sm ? "" : "Add a Sitemap: directive to robots.txt.", 1));
    } else {
      out.push(ck("robots", "robots.txt", "warn", `Not found (HTTP ${r.status}).`, "Add a robots.txt to guide crawlers.", 1));
    }
  } catch (e) { out.push(ck("robots", "robots.txt", "warn", "Could not fetch robots.txt.", "Ensure robots.txt is reachable.", 1)); }

  const smUrl = sitemapFromRobots || (origin + "/sitemap.xml");
  try {
    const r = await timedFetch(smUrl, {}, 8000);
    if (r.status === 200) {
      const txt = await r.text();
      const count = (txt.match(/<loc>/gi) || []).length;
      out.push(ck("sitemap", "XML sitemap", "pass", `Found at ${smUrl} (~${count} URLs).`, "", 2));
    } else {
      out.push(ck("sitemap", "XML sitemap", "warn", `Not found (HTTP ${r.status}).`, "Publish an XML sitemap and submit it in Search Console.", 2));
    }
  } catch (e) { out.push(ck("sitemap", "XML sitemap", "warn", "Could not fetch a sitemap.", "Publish an XML sitemap.", 2)); }
  return out;
}

const CATEGORY = {
  "Crawlability & Indexability": ["https", "redirects", "indexable", "canonical", "robots", "sitemap", "hsts"],
  "On-page": ["title", "description", "h1", "lang", "viewport", "charset"],
  "Content & Markup": ["content", "img-alt", "schema", "opengraph"],
  "Performance & Links": ["compression", "weight", "mixed", "broken-links"],
};

// Discover pages to audit: prefer the XML sitemap (direct fetch), and also
// pull sitemaps the owner submitted to Search Console when GSC is connected.
async function discoverPages(origin, cap = 60) {
  let urls = [];
  let sitemapUrl = null;
  let viaGsc = false;

  // 1) GSC-submitted sitemaps (optional; only if the service account is configured)
  if (googleConfigured()) {
    for (const prop of [origin + "/", "sc-domain:" + new URL(origin).host]) {
      try {
        const paths = await listSitemaps(prop);
        if (paths && paths.length) {
          const gscUrls = await urlsFromSitemaps(paths, cap);
          if (gscUrls.length) { urls = gscUrls; sitemapUrl = paths[0]; viaGsc = true; break; }
        }
      } catch (e) { /* property not in this account / no access — ignore */ }
    }
  }

  // 2) Direct sitemap fetch (always; the universal fallback / primary)
  if (!urls.length) {
    try {
      const sm = await discoverFromSitemap(origin, cap);
      sitemapUrl = sm.sitemapUrl;
      urls = sm.urls;
    } catch (e) { /* ignore */ }
  }

  return {
    source: urls.length ? "sitemap" : "links",
    viaGsc,
    sitemapUrl,
    total: urls.length,
    urls,
  };
}

export async function runAudit(input) {
  const url = normalizeUrl(input);
  if (!url) throw new Error("Please enter a valid website URL.");

  const main = await fetchWithChain(url);
  if (!main.body) {
    throw new Error(`Could not read HTML from ${main.finalUrl} (HTTP ${main.status}, content-type may not be HTML).`);
  }
  const statusCheck = ck("status", "HTTP status", main.status === 200 ? "pass" : "fail",
    `Final status: ${main.status}`, main.status === 200 ? "" : "Return HTTP 200 for the canonical page.", 3);

  const { checks, links } = analyzeHtml(main.body, main.finalUrl, main.headers, main.chain);
  const rs = await checkRobotsAndSitemap(main.finalUrl);
  const linkRes = await checkBrokenLinks(links);
  const brokenCheck = ck("broken-links", "Broken internal links",
    linkRes.broken.length === 0 ? "pass" : "fail",
    `${linkRes.broken.length} broken of ${linkRes.sampled} sampled (of ${linkRes.total} internal links).`,
    linkRes.broken.length ? "Fix or remove links returning 4xx/5xx." : "", 2);

  const all = [statusCheck, ...checks, ...rs, brokenCheck];
  const byId = Object.fromEntries(all.map(c => [c.id, c]));

  // score
  const sval = { pass: 1, warn: 0.5, notice: 0.85, fail: 0 };
  let wsum = 0, ssum = 0;
  for (const c of all) { wsum += c.weight; ssum += c.weight * (sval[c.status] ?? 0); }
  const score = wsum ? Math.round((ssum / wsum) * 100) : 0;

  const categories = Object.entries(CATEGORY).map(([name, ids]) => ({
    name,
    checks: ids.map(id => byId[id]).filter(Boolean),
  }));
  // put status (uncategorized) into first category
  categories[0].checks.unshift(statusCheck);

  const improvements = all
    .filter(c => c.status === "fail" || c.status === "warn")
    .sort((a, b) => (b.weight - a.weight))
    .map(c => ({ label: c.label, severity: c.status === "fail" ? "high" : "medium", detail: c.detail, recommendation: c.recommendation }));

  const discovery = await discoverPages(new URL(main.finalUrl).origin);
  const pageScan = await crawlPages(main.finalUrl, main.body, discovery.urls);

  return {
    url, finalUrl: main.finalUrl, fetchedAt: new Date().toISOString(),
    status: main.status, score,
    discovery: { source: discovery.source, viaGsc: discovery.viaGsc, sitemapUrl: discovery.sitemapUrl, total: discovery.total },
    counts: {
      fail: all.filter(c => c.status === "fail").length,
      warn: all.filter(c => c.status === "warn").length,
      pass: all.filter(c => c.status === "pass").length,
    },
    redirects: main.chain,
    brokenLinks: linkRes.broken,
    categories, improvements,
    pages: pageScan.pages, pageSummary: pageScan.summary,
  };
}

// ---- Crawl-all-pages support (client-driven, batched to stay within limits) ----

// Return the full list of page URLs for a site (sitemap-based, large cap).
export async function discoverAllUrls(input) {
  const url = normalizeUrl(input);
  if (!url) throw new Error("Please enter a valid website URL.");
  const main = await fetchWithChain(url);
  const origin = new URL(main.finalUrl).origin;
  const d = await discoverPages(origin, 5000);
  const homepage = main.finalUrl.split("#")[0];
  const urls = [homepage, ...(d.urls || []).filter((u) => u !== homepage)];
  return { origin, finalUrl: main.finalUrl, source: d.source, viaGsc: d.viaGsc, total: urls.length, urls };
}

// Fetch a page, returning its final HTTP status and (if 200 HTML) the body.
async function fetchPageInfo(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    const ct = r.headers.get("content-type") || "";
    const html = (r.ok && ct.includes("text/html")) ? await r.text() : "";
    return { status: r.status, html };
  } catch (e) { return { status: 0, html: "" }; }
}

// Audit one batch of page URLs (per-page status + meta/alt/OG analysis).
// Broken (4xx/5xx) and unreachable URLs are recorded as error pages so the
// site-wide score reflects the whole site, not just healthy pages.
export async function auditUrls(urls) {
  const list = Array.isArray(urls) ? urls.slice(0, 50) : [];
  const out = [];
  const conc = 6;
  for (let i = 0; i < list.length; i += conc) {
    const batch = list.slice(i, i + conc);
    const infos = await Promise.all(batch.map((u) => fetchPageInfo(u)));
    infos.forEach((info, j) => {
      const u = batch[j];
      if (info.html) { out.push(analyzePageMeta(info.html, u, info.status)); return; }
      if (info.status >= 400 || info.status === 0) {
        let path = u; try { const x = new URL(u); path = x.pathname + x.search; } catch (e) {}
        out.push({
          url: u, path: path || "/", status: info.status,
          title: "", titleLen: 0, titleFlag: "missing",
          desc: "", descLen: 0, descFlag: "missing",
          imgs: 0, imgsNoAlt: 0, ogOk: false, h1: 0, noindex: false,
          level: "error", errorReason: info.status === 0 ? "Unreachable / timed out" : `HTTP ${info.status}`,
        });
      }
      // 200 non-HTML (e.g. PDF/image in sitemap) and 3xx are skipped from scoring.
    });
  }
  return out;
}
