import { outboxEmails } from "@/lib/mock/outbox-store";

// The emails the mock backend has queued (dev only: the real outbox is a table read by the worker). The list holds the subject of each email; the
// whole email (its html) is at /api/v1/outbox/{id}.
export async function GET() {
  const items = outboxEmails().map(({ html: _html, text: _text, ...rest }) => {
    void _html; void _text;
    return rest;
  });
  return Response.json({ items }, { headers: { "cache-control": "no-store" } });
}
