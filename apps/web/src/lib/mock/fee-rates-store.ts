// SERVER-ONLY: the platform fee rates a system administrator sets (REQUIREMENTS FR-PAY-02), until apps/api exists. Every shop's Income page
// reads them. Lives on globalThis like the other mock stores. TODO(api): `platform_settings`, SUPER_ADMIN only, audited.
import { checkFeeRates, DEFAULT_FEE_RATES, type FeeRates } from "@workshop/shared";

const g = globalThis as unknown as { __feeRates?: FeeRates };

export const getFeeRates = (): FeeRates => ({ ...(g.__feeRates ?? DEFAULT_FEE_RATES) });

/** Saves the rates; the result says why they were refused. */
export function setFeeRates(rates: FeeRates): ReturnType<typeof checkFeeRates> {
  const check = checkFeeRates(rates);
  if (check === "OK") g.__feeRates = { maintenanceBps: rates.maintenanceBps, serviceBps: rates.serviceBps };
  return check;
}

/** Test helper: back to the default rates. */
export function resetFeeRates(): void {
  g.__feeRates = undefined;
}
