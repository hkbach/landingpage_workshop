import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { ADMIN_EMAIL, recordAdminAction } from "@/lib/mock/admin-audit-store";
import { listAccounts } from "@/lib/mock/accounts-store";
import { updateContactMessage } from "@/lib/mock/contact-store";
import { sendAdminEmail } from "@/lib/mock/outbox-store";

// An administrator sends an email of the platform: to one address, or an announcement to every shop owner or every customer with an active account. { audience: "ONE" | "SHOP_OWNERS" | "CUSTOMERS",
// to?, subject, body, messageId? }: `messageId` is the message of the support inbox this email answers (it is then marked DONE). The subject and the body are plain text. At most 500 recipients.
// 201 { total, sent, failed, ids }; 422 `fields`. MOCK implementation inside Next until apps/api exists (the real one queues an outbox event for the worker). The body is never written to the audit log.
const MAX_RECIPIENTS = 500;
const bodySchema = z.object({
  audience: z.enum(["ONE", "SHOP_OWNERS", "CUSTOMERS"], { error: "invalid" }),
  to: z.string().trim().max(254, "tooLong").optional(),
  subject: z.string({ error: "required" }).trim().min(1, "required").max(200, "tooLong"),
  body: z.string({ error: "required" }).trim().min(1, "required").max(10_000, "tooLong"),
  messageId: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const v = parsed.data;
  let recipients: string[];
  if (v.audience === "ONE") {
    if (!v.to || !z.email().safeParse(v.to).success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { to: v.to ? "invalid" : "required" } });
    recipients = [v.to.toLowerCase()];
  } else {
    const type = v.audience === "SHOP_OWNERS" ? "SHOP_OWNER" : "CUSTOMER";
    recipients = [...new Set(listAccounts().filter((a) => a.type === type && a.status === "ACTIVE").map((a) => a.email))].slice(0, MAX_RECIPIENTS);
    if (recipients.length === 0) return apiError(422, "VALIDATION", "There is nobody to send it to.", { fields: { audience: "empty" } });
  }
  const results = recipients.map((to) => sendAdminEmail({ to, subject: v.subject, body: v.body, sentBy: ADMIN_EMAIL }));
  const failed = results.filter((r) => r.delivery.status === "FAILED").length;
  if (v.messageId && updateContactMessage(v.messageId, { status: "DONE" })) recordAdminAction({ action: "message.set_status", entityType: "ContactMessage", entityId: v.messageId, details: "status: DONE (answered by email)" });
  recordAdminAction({ action: "email.send", entityType: "Email", entityId: results[0]!.email.id, ...(v.audience === "ONE" ? { targetEmail: recipients[0] } : {}), details: `${v.audience}: ${recipients.length} recipient(s), ${failed} failed; subject: ${v.subject}`.slice(0, 200) });
  return Response.json({ total: recipients.length, sent: recipients.length - failed, failed, ids: results.map((r) => r.email.id) }, { status: 201, headers: { "cache-control": "no-store" } });
}
