// Ahrefs free public Domain Rating endpoint.
// Works with an Ahrefs API key and does not consume API units.
const BASE = "https://api.ahrefs.com/v3/public/domain-rating";

export function ahrefsConfigured() {
  return Boolean(process.env.AHREFS_API_KEY);
}

export async function domainRating(target) {
  if (!ahrefsConfigured()) return { configured: false };
  const url = `${BASE}?target=${encodeURIComponent(target)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.AHREFS_API_KEY}`, Accept: "application/json" },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d && d.error) || `Ahrefs error ${r.status}`);
  const dr = d && d.domain_rating && d.domain_rating.domain_rating;
  return { configured: true, domainRating: typeof dr === "number" ? dr : null };
}
