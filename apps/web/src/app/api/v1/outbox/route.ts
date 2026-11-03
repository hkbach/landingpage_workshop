import { outboxEmails } from "@/lib/mock/outbox-store";

// The emails the mock backend has queued (dev only: the real outbox is a table read by the worker).
export async function GET() {
  return Response.json({ items: outboxEmails() }, { headers: { "cache-control": "no-store" } });
}
