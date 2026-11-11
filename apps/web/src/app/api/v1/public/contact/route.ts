import { z } from "zod";
import { clientKey } from "@/lib/client-ip";
import { readBodyText } from "@/lib/read-body";
import { apiError } from "@/lib/api-error";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { guestActor } from "@/lib/mock/audit-actors";
import { addContactMessage, CONTACT_TOPICS, contactRetryAfter, recordContactHit } from "@/lib/mock/contact-store";

// POST /api/v1/public/contact: the Contact form of the public site (no account, no auth). MOCK implementation inside Next until apps/api exists; the contract is the real one.
// Body { name, email, topic, message, website? }: `website` is a trap for robots (a real person never fills it): a message with it is answered 201 and thrown away.
// 201 { id }; 422 with `fields` ("required" | "invalid" | "tooShort" | "tooLong"); 429 RATE_LIMITED (5 an hour for one client) with Retry-After; 413 when the body is far too large.
// The message is never written to the audit log (only that somebody sent one, and the topic). TODO(api): the Turnstile check, an email to the platform team.

const MAX_BODY_CHARS = 10_000;
const text = (max: number) => z.string({ error: "required" }).trim().min(1, "required").max(max, "tooLong");
const bodySchema = z.object({
  name: text(120),
  email: z.string({ error: "required" }).trim().min(1, "required").max(254, "tooLong").pipe(z.email("invalid")),
  topic: z.enum(CONTACT_TOPICS, { error: "invalid" }),
  message: z.string({ error: "required" }).trim().min(1, "required").min(10, "tooShort").max(2000, "tooLong"),
  website: z.string().optional(),
});


export async function POST(request: Request) {
  const client = clientKey(request);
  const wait = contactRetryAfter(client);
  if (wait > 0) return apiError(429, "RATE_LIMITED", "Too many messages. Please try again later.", { retryAfterSeconds: wait }, { "Retry-After": String(wait) });

  const raw = await readBodyText(request, MAX_BODY_CHARS * 4); // read at most this many bytes (a character is up to 4 bytes)
  if (raw === null || raw.length > MAX_BODY_CHARS) return apiError(413, "PAYLOAD_TOO_LARGE", "The message is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const { website, ...input } = parsed.data;
  if (website) return Response.json({ id: "ct-ignored" }, { status: 201 }); // a robot: it is told it worked and nothing is kept
  const saved = addContactMessage({ ...input, email: input.email.toLowerCase() });
  recordContactHit(client);
  recordAudit({ ...guestActor(saved.email, saved.name), action: "contact.submit", entityType: "ContactMessage", entityId: saved.id, details: `topic: ${saved.topic}` });
  return Response.json({ id: saved.id }, { status: 201, headers: { "cache-control": "no-store" } });
}
