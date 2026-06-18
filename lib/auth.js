export function appConfigured() { return Boolean(process.env.APP_PASSWORD); }
export function checkApp(request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  return request.headers.get("x-app-password") === expected;
}
