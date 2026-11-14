// The Content-Security-Policy of the web app (NFR-SEC). Scripts run only with the nonce of the request (and what those scripts load: `strict-dynamic`), so an injected `<script>` or an
// inline handler never runs. Nothing can embed the app in a frame of another site, nothing can submit a form elsewhere, no plugin, no `<base>` change.
// Open on purpose: styles may be inline (the components set `style` attributes and the shop theme is a set of CSS variables) and images may come from any https address (a shop writes the
// address of its own pictures; an image can run no code), data: and blob: (the previews in the builder).
// Allowed third parties: Cloudflare Turnstile (the bot check) and the privacy-friendly YouTube player (a video section). Nothing else.

export interface CspOptions {
  nonce: string;
  /** `next dev` needs eval (fast refresh) and a websocket for the reload. Never on in production. */
  dev?: boolean;
  /** The origin of the API when it is not the origin of the web app (the API of a separate host); empty when it is served under the same origin. */
  apiOrigin?: string;
  /** The host that serves the images of the platform (the CDN of the media bucket), when it is not the app. */
  mediaOrigin?: string;
  /** Where the browser uploads an image to (the S3 address of the media bucket: `https://{account}.r2.cloudflarestorage.com`). Without it the upload is blocked by the policy. */
  uploadOrigin?: string;
  /** Production only: ask the browser to load every http link as https. */
  upgradeInsecure?: boolean;
}

const TURNSTILE = "https://challenges.cloudflare.com";
const YOUTUBE = "https://www.youtube-nocookie.com";

export function buildCsp({ nonce, dev = false, apiOrigin = "", mediaOrigin = "", uploadOrigin = "", upgradeInsecure = false }: CspOptions): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:", ...(mediaOrigin ? [mediaOrigin] : [])]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", TURNSTILE, ...(apiOrigin ? [apiOrigin] : []), ...(uploadOrigin ? [uploadOrigin] : []), ...(dev ? ["ws:", "wss:"] : [])]],
    ["frame-src", [TURNSTILE, YOUTUBE]],
    ["media-src", ["'self'", "https:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
    ...(upgradeInsecure ? ([["upgrade-insecure-requests", []]] as [string, string[]][]) : []),
  ];
  return directives.map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name)).join("; ");
}

/** A new nonce for one request: 128 random bits, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
