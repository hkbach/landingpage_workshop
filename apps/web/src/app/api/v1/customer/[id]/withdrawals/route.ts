import { z } from "zod";
import { checkAccountNumber, checkBankName, maskAccountNumber, normalizeAccountNumber, normalizeBankName } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import { accountOfGuest } from "@/lib/mock/booking-store";
import { WALLET_SOURCES, requestWithdrawal } from "@/lib/mock/wallet-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { customerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// A customer asks to withdraw money they earned from a program: an invoice that waits for a system admin. MOCK implementation inside Next until apps/api exists. The amount is
// checked against the balance on the server (the browser only says how much); the balance and the invoice are ONE transaction in the real backend. TODO(api): the account of the session.

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const emailOf = (request: Request): string | null => (customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null);
const text = z.string({ error: (issue) => (issue.input === undefined ? "required" : "invalid") });
const bodySchema = z.object({ source: z.enum(WALLET_SOURCES, { error: "invalid" }), amount: z.number({ error: "required" }).int("invalid").positive("invalid"), bankName: text, bankAccountNumber: text });

/**
 * POST { source, amount, bankName, bankAccountNumber } (minor units) -> 201 { id, code, amount, currency, status: "PENDING", requestedAt, bankName, accountNumberMasked }. 404 NOT_FOUND, 422 with `fields`:
 * amount (invalid | exceeds | belowMin | aboveMax), bankName and bankAccountNumber (required | invalid | tooLong). The bank details are where the admin pays (outside the system): they are never audited or logged.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/withdrawals">) {
  const { id } = await ctx.params;
  if (!accountOfGuest(id, emailOf(request))) return apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) }, headers);
  const bankFields: Record<string, string> = {};
  const nameIssue = checkBankName(parsed.data.bankName);
  const numberIssue = checkAccountNumber(parsed.data.bankAccountNumber);
  if (nameIssue) bankFields.bankName = nameIssue;
  if (numberIssue) bankFields.bankAccountNumber = numberIssue;
  if (Object.keys(bankFields).length > 0) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: bankFields }, headers);
  const bankName = normalizeBankName(parsed.data.bankName);
  const accountNumber = normalizeAccountNumber(parsed.data.bankAccountNumber);
  const res = requestWithdrawal(id, parsed.data.source, parsed.data.amount, { bankName, accountNumber });
  if (!res.ok) {
    if (res.code === "EXCEEDS_AVAILABLE") return apiError(422, "VALIDATION", "The amount is more than what is available.", { fields: { amount: "exceeds" } }, headers);
    if (res.code === "BELOW_MIN" || res.code === "ABOVE_MAX") return apiError(422, "VALIDATION", "The amount is outside the limits of one withdrawal.", { fields: { amount: res.code === "BELOW_MIN" ? "belowMin" : "aboveMax" } }, headers);
    return apiError(res.code === "NO_ACCOUNT" ? 404 : 422, res.code === "NO_ACCOUNT" ? "NOT_FOUND" : "VALIDATION", "Please check the highlighted fields.", res.code === "NO_ACCOUNT" ? {} : { fields: { amount: "invalid" } }, headers);
  }
  const { id: wid, code, amount, currency, status, requestedAt } = res.withdrawal;
  recordAudit({ ...customerActor(id), action: "withdrawal.request", entityType: "Withdrawal", entityId: wid, organizationId: DEMO_ORG, details: `${code} ${parsed.data.source} ${amount} ${currency}` });
  return Response.json({ id: wid, code, amount, currency, status, requestedAt, bankName, accountNumberMasked: maskAccountNumber(accountNumber) }, { status: 201, headers });
}
