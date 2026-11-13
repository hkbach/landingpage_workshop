import type { Env } from "../config/env";

/** The origin of the landing page of a shop (`{slug}.{PLATFORM_DOMAIN}` with the scheme and the port of the web app): the links of the emails to guests and the affiliate links point there. */
export function shopOrigin(env: Pick<Env, "APP_URL" | "PLATFORM_DOMAIN">, slug: string): string {
  const app = new URL(env.APP_URL);
  return `${app.protocol}//${slug}.${env.PLATFORM_DOMAIN}${app.port ? `:${app.port}` : ""}`;
}

/** The origin of the public site of the platform itself (`{PLATFORM_DOMAIN}`, D21): the invite link of a customer points there. */
export function platformOrigin(env: Pick<Env, "APP_URL" | "PLATFORM_DOMAIN">): string {
  const app = new URL(env.APP_URL);
  return `${app.protocol}//${env.PLATFORM_DOMAIN}${app.port ? `:${app.port}` : ""}`;
}
