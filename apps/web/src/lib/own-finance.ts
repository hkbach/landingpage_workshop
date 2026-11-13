import { addDaysToKey, dayKeyOf, MAX_RANGE_DAYS, type FeeRates, type LedgerRow } from "@workshop/shared";
import { apiFetch } from "@/lib/api-server";

// The income of the shop of the session, from the API: every payment and refund of the last year with the fees taken from it, in the rows the Income page uses. (Only called when connected.)

type ApiRow = {
  id: string; bookingCode: string; kind: "PAYMENT" | "REVERSAL"; currency: string; occurredAt: string; amount: number; originalPrice: number;
  promotions: { code: string; amount: number }[]; maintenanceFee: number; serviceFee: number; profit: number;
};
type ApiIncome = { currency: string; timezone: string; rates: FeeRates; items: ApiRow[]; nextCursor: string | null };

export async function loadIncome(timezone: string): Promise<{ rows: LedgerRow[]; rates: FeeRates; currency: string } | null> {
  const to = dayKeyOf(new Date().toISOString(), timezone);
  const from = addDaysToKey(to, -(MAX_RANGE_DAYS - 1));
  const rows: LedgerRow[] = [];
  let rates: FeeRates | null = null;
  let currency = "";
  let cursor: string | null = null;
  do {
    const res = await apiFetch(`/finance/income?from=${from}&to=${to}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!res.ok) return null;
    const page = (await res.json()) as ApiIncome;
    rates = page.rates;
    currency = page.currency;
    for (const r of page.items) {
      rows.push({
        id: r.id, bookingCode: r.bookingCode, kind: r.kind === "PAYMENT" ? "PAYMENT" : "REFUND", currency: r.currency, price: { subtotal: r.originalPrice, discounts: r.promotions },
        occurredAt: r.occurredAt, amount: r.amount, maintenanceFee: r.maintenanceFee, serviceFee: r.serviceFee, profit: r.profit,
      });
    }
    cursor = page.nextCursor;
  } while (cursor && rows.length < 5000);
  return rates ? { rows, rates, currency } : null;
}
