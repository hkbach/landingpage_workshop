// SERVER-ONLY: the fee rates a system administrator sets for each shop (REQUIREMENTS FR-PAY-02), until apps/api exists. The Income page of a shop reads
// the rates of that shop only; a shop without rates of its own uses the defaults. Lives on globalThis like the other mock stores.
// TODO(api): `organization_fee_settings` (organization_id, maintenance_bps, service_bps), SUPER_ADMIN only, audited.
import { checkFeeRates, DEFAULT_FEE_RATES, type FeeRates } from "@workshop/shared";

const g = globalThis as unknown as { __feeRates?: Map<string, FeeRates> };
const rates = () => (g.__feeRates ??= new Map<string, FeeRates>());

export const getFeeRates = (organizationId: string): FeeRates => ({ ...(rates().get(organizationId) ?? DEFAULT_FEE_RATES) });

/** Saves the rates of one shop; the result says why they were refused. */
export function setFeeRates(organizationId: string, next: FeeRates): ReturnType<typeof checkFeeRates> {
  const check = checkFeeRates(next);
  if (check === "OK") rates().set(organizationId, { maintenanceBps: next.maintenanceBps, serviceBps: next.serviceBps });
  return check;
}

/** Test helper: every shop back to the default rates. */
export function resetFeeRates(): void {
  g.__feeRates = new Map();
}
