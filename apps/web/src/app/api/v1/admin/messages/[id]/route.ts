import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { deleteContactMessage, MESSAGE_STATUSES, updateContactMessage } from "@/lib/mock/contact-store";

// The support inbox (the messages sent with the Contact form): an administrator sets the status and writes an internal note, or deletes a message (personal data). SUPER_ADMIN only;
// MOCK implementation inside Next until apps/api exists. The text of a message and of a note never goes to the audit log.
const bodySchema = z.object({ status: z.enum(MESSAGE_STATUSES, { error: "invalid" }).optional(), note: z.string({ error: "invalid" }).max(2000, "tooLong").optional() }).refine((v) => v.status !== undefined || v.note !== undefined, { path: ["status"], message: "required" });

/** PATCH { status?, note? } -> 200 the message. 422 `fields`, 404. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/admin/messages/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const m = updateContactMessage(id, parsed.data);
  if (!m) return apiError(404, "NOT_FOUND", "Message not found.");
  recordAdminAction({ action: parsed.data.status ? "message.set_status" : "message.set_note", entityType: "ContactMessage", entityId: id, targetEmail: m.email, details: parsed.data.status ? `status: ${parsed.data.status}` : undefined });
  return Response.json(m);
}

/** DELETE -> 204. 404. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/v1/admin/messages/[id]">) {
  const { id } = await ctx.params;
  if (!deleteContactMessage(id)) return apiError(404, "NOT_FOUND", "Message not found.");
  recordAdminAction({ action: "message.delete", entityType: "ContactMessage", entityId: id });
  return new Response(null, { status: 204 });
}
