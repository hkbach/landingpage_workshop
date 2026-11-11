// SERVER-ONLY: who sent a request, for the rate limits of the public forms and the login. The client can write any X-Forwarded-For it likes, so the FIRST entry
// is never trusted: the reverse proxy in front of the app (Caddy) APPENDS the address it saw, so the LAST entry is the one the proxy vouches for. Without a proxy
// (local dev) every request is the same client. TODO(api): read the address from the proxy configuration (trusted hops), not from a header guess.
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return (last || request.headers.get("x-real-ip")?.trim() || "local").slice(0, 64);
}
