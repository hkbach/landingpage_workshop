import { outboxEmail } from "@/lib/mock/outbox-store";

// Dev only: one queued email, shown as the guest would see it in the mailbox (there is no mailbox in the prototype). Not available in production.
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/outbox/[id]">) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const email = outboxEmail(id);
  if (!email) return new Response("Not found", { status: 404 });
  return new Response(email.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
