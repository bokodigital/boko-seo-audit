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
  const add = (u) => {
    const clean = String(u).split("#")[0];
    if (clean && !seen.has(clean)) { seen.add(clean); out.push(clean); }
  };
  const queue = [...sitemapUrls];
  let fetchedChildren = 0;
  while (queue.length && out.length < limit) {
    const sm = queue.shift();
    const xml = await getText(sm);
    if (!xml) continue;
    if (/<sitemapindex/i.test(xml)) {
      // index: queue child sitemaps (cap how many we expand)
      for (const child of locs(xml)) {
        if (fetchedChildren >= 50) break;
        if (/\.xml/i.test(child)) { queue.push(child); fetchedChildren++; }
      }
    } else {
      for (const u of locs(xml)) { add(u); if (out.length >= limit) break; }
    }
  }
  return out;
}

// Convenience: discover a site's own sitemap and return its page URLs.
export async function discoverFromSitemap(origin, limit = 60) {
  const sitemapUrl = await findSitemapUrl(origin);
  const urls = await urlsFromSitemaps([sitemapUrl], limit);
  return { sitemapUrl, found: urls.length > 0, urls };
}
