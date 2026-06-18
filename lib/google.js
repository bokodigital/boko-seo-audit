// Google service-account auth: sign a JWT (RS256) and exchange for an access token.
import crypto from "crypto";

let cache = { token: null, exp: 0 };

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}
function privateKey() {
  return (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

export async function getAccessToken() {
  if (cache.token && Date.now() < cache.exp - 60000) return cache.token;
  if (!googleConfigured()) throw new Error("Google service account not configured (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY).");
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const now = Math.floor(Date.now() / 1000);
  const scope = "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly";
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = enc({ alg: "RS256", typ: "JWT" }) + "." +
    enc({ iss: email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey()).toString("base64url");
  const jwt = signingInput + "." + sig;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const d = await res.json();
  if (!res.ok || !d.access_token) throw new Error("Google auth failed: " + (d.error_description || d.error || res.status));
  cache = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cache.token;
}
