import { maskAccountNumber } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import { accountOfGuest } from "@/lib/mock/booking-store";
import { getPlatformSettings } from "@/lib/mock/app-settings-store";
import { WALLET_SOURCES, walletOf, withdrawalsOf, type WalletSource } from "@/lib/mock/wallet-store";

// What a customer earned from a program, what is waiting to be paid, what was withdrawn, and the invoices (the History). MOCK implementation inside Next until apps/api exists.
// Identified like the rest of /customer/{id}: the email of the account in `x-guest-email`. TODO(api): the account of the session.

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const emailOf = (request: Request): string | null => (customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null);

/**
 * GET ?source=AFFILIATE|REFERRAL -> { source, currency, earned, pending, withdrawn, available, limits: { min, max } (one withdrawal, 0 = none), items }: `items` are the invoices, newest first
 * { id, code, amount, currency, status: PENDING | PAID | REJECTED, requestedAt, processedAt?, reason? }. 404 NOT_FOUND, 422 for another source.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/wallet">) {
  const { id } = await ctx.params;
  if (!accountOfGuest(id, emailOf(request))) return apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
  const source = new URL(request.url).searchParams.get("source") ?? "";
  if (!(WALLET_SOURCES as readonly string[]).includes(source)) return apiError(422, "VALIDATION", "The source must be AFFILIATE or REFERRAL.", { fields: { source: "invalid" } }, headers);
  const s = source as WalletSource;
  const items = withdrawalsOf(id, s).map(({ id: wid, code, amount, currency, status, requestedAt, processedAt, reason, bankName, accountNumber }) => ({ id: wid, code, amount, currency, status, requestedAt, bankName, accountNumberMasked: accountNumber ? maskAccountNumber(accountNumber) : "", ...(processedAt ? { processedAt } : {}), ...(reason ? { reason } : {}) }));
  const { withdrawalMin, withdrawalMax } = getPlatformSettings();
  return Response.json({ ...walletOf(id, s), limits: { min: withdrawalMin, max: withdrawalMax }, items }, { headers });
}
