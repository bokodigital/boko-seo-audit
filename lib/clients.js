// Per-client facts the crawler can't detect on its own, keyed by host (no "www.").
// This repo is public: only put facts here that are already public (brand name,
// business type, directories the business is visibly listed on). Anything
// sensitive (e.g. keywords a client has dropped) goes in the report's
// "Keywords to leave out of recommendations" field instead, which is saved per site in the browser.
//
//   brand    — name used in roadmap copy
//   type     — "ecommerce" | "local" | "agency" (otherwise auto-detected)
//   listedOn — DIRECTORIES names the business already has; they're left out of the report
export const CLIENTS = {
  "venomemilio.com.au": {
    brand: "Venom Emilio",
    type: "ecommerce",
    listedOn: [
      "Google Business Profile", "Bing Places", "Apple Business Connect", "True Local", "Yellow Pages AU",
      "Yelp Australia", "Hotfrog Australia", "StartLocal", "Word of Mouth (WOMO)",
    ],
  },
  "boko.com.au": { brand: "Boko", type: "agency" },
};

export function hostOf(u) {
  if (!u) return "";
  let s = String(u).trim().replace(/^sc-domain:/, "https://");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { return new URL(s).host.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; }
}

export function clientFor(u) {
  return CLIENTS[hostOf(u)] || null;
}
