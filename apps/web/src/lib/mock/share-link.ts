// SERVER-ONLY: the links a customer shares: the landing page of a shop with a query (`?ref=CODE&book=WORKSHOP` for a workshop, `?invite=CODE` to invite a friend to register).
// The port of the dev server is kept (only a port number from the Host header goes into the link).
import { shopOrigin } from "./shop-domain-store";

export function shareLink(slug: string, request: Request, query: Record<string, string>): string {
  const base = shopOrigin(slug);
  const port = (request.headers.get("host") ?? "").split(":")[1];
  const origin = port && /^\d{1,5}$/.test(port) && base.startsWith("http:") ? `${base}:${port}` : base;
  return `${origin}/?${Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}
