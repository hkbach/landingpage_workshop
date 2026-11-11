import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { processWithdrawal } from "@/lib/mock/wallet-store";

// A system admin processes a withdrawal invoice of a customer: PAID (the money was sent) or REJECTED (with a reason; the amount goes back to the balance of the customer). MOCK
// implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only, the payout itself, an email to the customer, audit log in the same transaction.

const bodySchema = z.object({ action: z.enum(["pay", "reject"], { error: "required" }), reason: z.string().max(500).optional() });

/** POST { action: "pay" | "reject", reason? } -> 200 the invoice. 404 unknown invoice, 409 NOT_PENDING (an invoice is processed once), 422 a reason is needed to reject. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/withdrawals/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const res = processWithdrawal(id, parsed.data.action === "pay" ? "PAID" : "REJECTED", parsed.data.reason ?? "");
  if (res.ok) {
    recordAdminAction({ action: parsed.data.action === "pay" ? "withdrawal.pay" : "withdrawal.reject", entityType: "withdrawal", entityId: res.withdrawal.code });
    return Response.json(res.withdrawal);
  }
  if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Invoice not found.");
  if (res.code === "REASON_REQUIRED") return apiError(422, "VALIDATION", "A reason is required to reject an invoice.", { fields: { reason: "required" } });
  return apiError(409, "NOT_PENDING", "This invoice was already processed.");
}
