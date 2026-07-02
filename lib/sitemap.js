// Sitemap discovery: find a site's sitemap (robots.txt -> /sitemap.xml),
// recurse into sitemap-index files, and return a de-duped list of page URLs.
const UA = "Mozilla/5.0 (compatible; BokoSEOAudit/1.0; +https://boko.com.au)";

async function getText(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; } finally { clearTimeout(t); }
}

function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

// Find the sitemap URL declared in robots.txt, else the conventional /sitemap.xml.
export async function findSitemapUrl(origin) {
  const robots = await getText(origin + "/robots.txt");
  if (robots) {
    const m = robots.match(/Sitemap:\s*(\S+)/i);
    if (m) return m[1].trim();
  }
  return origin + "/sitemap.xml";
}

// Given one or more sitemap URLs, collect page URLs (handling sitemap indexes).
export async function urlsFromSitemaps(sitemapUrls, limit = 60) {
  const out = [];
  const seen = new Set();
  const breakdown = [];
  const add = (u) => {
    const clean = String(u).split("#")[0];
    if (clean && !seen.has(clean)) { seen.add(clean); out.push(clean); return true; }
    return false;
  };
  const queue = [...sitemapUrls];
  const queued = new Set(sitemapUrls);
  let fetchedChildren = 0;
  const CHILD_CAP = 300; // expand up to 300 child sitemaps (posts, pages, products, product_cat, categories, custom post types, ...)
  while (queue.length && out.length < limit) {
    const sm = queue.shift();
    const xml = await getText(sm);
    if (!xml) continue;
    if (/<sitemapindex/i.test(xml)) {
      // sitemap index: queue every child sitemap (including nested indexes), de-duped
      for (const child of locs(xml)) {
        if (fetchedChildren >= CHILD_CAP) break;
        if (/\.xml/i.test(child) && !queued.has(child)) { queue.push(child); queued.add(child); fetchedChildren++; }
      }
    } else {
      let added = 0;
      for (const u of locs(xml)) { if (add(u)) added++; if (out.length >= limit) break; }
      if (added) breakdown.push({ sitemap: sm, count: added });
    }
  }
  return { urls: out, breakdown };
}

// Convenience: discover a site's own sitemap and return its page URLs + per-sitemap breakdown.
export async function discoverFromSitemap(origin, limit = 60) {
  const sitemapUrl = await findSitemapUrl(origin);
  const { urls, breakdown } = await urlsFromSitemaps([sitemapUrl], limit);
  return { sitemapUrl, found: urls.length > 0, urls, breakdown };
}
