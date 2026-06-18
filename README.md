# Boko - Technical SEO Audit & Analytics

Two tabs:

## 1) On-page audit
Enter a URL; Boko crawls the site (up to ~20 pages) and reports:
- **Site-wide technical checks** with a health score: HTTP status, HTTPS, redirects, indexability
  (`noindex` / `x-robots-tag`), canonical, robots.txt, XML sitemap, HSTS, viewport, charset,
  compression, page weight, mixed content, broken internal links.
- **Per-page on-page SEO:** meta title and meta description flagged **missing / too long / too short**
  (Google lengths: title 30-60, description 70-160), **image alt coverage**, and **Open Graph** tags.
- **Top improvements** sorted by severity.

No external API needed for this tab - it's a live server-side crawl.

## 2) Analytics & Search (Google Analytics 4 + Search Console)
- **GA4 (current month vs last month):** users, most-viewed pages (with month-over-month delta),
  users by traffic source, referral users by source, views by country, and conversion events by name.
  You pick which GA4 property to report on.
- **Search Console:** top keywords this month (max 30) with clicks, impressions, CTR, position.

These use Google's APIs via a **service account** (no per-user login).

### Google setup (one time)
1. In Google Cloud, create a project and a **service account**; create a **JSON key**.
2. Enable: **Google Analytics Data API**, **Google Analytics Admin API**, **Search Console API**.
3. Add the service account email (e.g. `name@project.iam.gserviceaccount.com`):
   - in **GA4 → Admin → Property Access Management** as **Viewer**;
   - in **Search Console → Settings → Users and permissions** as a user (Full or Restricted).
4. Set env vars in Vercel:
   - `GOOGLE_CLIENT_EMAIL` = the service account email
   - `GOOGLE_PRIVATE_KEY` = the `private_key` from the JSON (newlines as `\n`, wrapped in quotes)
   - optional `APP_PASSWORD` to gate the dashboard

## Deploy
Push to GitHub -> import in Vercel (Next.js auto-detected) -> add env vars (only needed for the
Analytics tab) -> Deploy.

## Notes & limits
- The crawl audits the entered URL + a sample of internal pages - a fast snapshot, not a full crawl.
  On Vercel **Hobby**, the multi-page crawl and the GA report (several API calls) can be tight on the
  ~10s function limit; **Pro** is recommended.
- Search Console `siteUrl` must match the **verified property** exactly (URL-prefix with trailing
  slash, or `sc-domain:example.com` for a domain property).
- GA4 conversion metric auto-detects `keyEvents` / `conversions` / falls back to `eventCount`.

## Tech
Next.js 14 (App Router) - server-side crawler - Google Analytics Data/Admin API + Search Console API
(service-account JWT) - Poppins via next/font.
