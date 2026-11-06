// SERVER-ONLY: where the app (the login, the reset of a password, the areas of the shop owner and the admin) lives: app.{PLATFORM_DOMAIN}, with the port of the server in development.
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "localtest.me";

export function appOrigin(request: Request): string {
  const dev = PLATFORM_DOMAIN === "localtest.me" || PLATFORM_DOMAIN.startsWith("localhost");
  if (!dev) return `https://app.${PLATFORM_DOMAIN}`;
  const raw = (request.headers.get("host") ?? new URL(request.url).host).split(":")[1];
  return `http://app.${PLATFORM_DOMAIN}${raw && /^\d{1,5}$/.test(raw) ? `:${raw}` : ""}`; // only a port number goes into the link (the Host header comes from the client)
}
