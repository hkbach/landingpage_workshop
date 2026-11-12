/** The cookies of a request as a map (the first value of a name wins). Values are URI-decoded; a malformed one is skipped. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // a broken value is not a session
    }
  }
  return out;
}

export interface CookieOptions { maxAgeSeconds?: number; secure: boolean }

/**
 * The Set-Cookie value of the session cookie: HttpOnly (scripts cannot read it), SameSite=Lax (not sent by other sites' requests, a second line behind the Origin check), path /,
 * Secure over https. Max-Age 0 removes it.
 */
export function sessionCookie(name: string, value: string, { maxAgeSeconds, secure }: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
