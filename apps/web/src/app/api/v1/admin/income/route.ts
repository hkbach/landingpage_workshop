import { apiError } from "@/lib/api-error";
import { adminIncome, checkIncomeRange } from "@/lib/mock/admin-income";

// The income of the platform: the fees charged on the bookings of the shops, less the referral fees (profit = fees - referral fees). SUPER_ADMIN only; TODO(api): check the role.

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional, both days included) -> { from, to, shops, totals }. 422 for a day that is not one or From after To. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  const check = checkIncomeRange(from || undefined, to || undefined);
  if (check !== "OK") return apiError(422, "VALIDATION", "Please check the dates.", { fields: { [check === "ORDER" ? "to" : "from"]: check === "ORDER" ? "order" : "invalid" } });
  return Response.json(adminIncome(from || undefined, to || undefined), { headers: { "cache-control": "no-store" } });
}
