// SERVER-ONLY: the fee rates a system administrator sets for each shop (REQUIREMENTS FR-PAY-02, FR-ADM-10), until apps/api exists. The Income page of a shop reads
// the rates of that shop only; a shop without rates of its own uses the defaults. Besides the maintenance and the service fee, each shop has a REFERRAL fee: the
// percentage, in basis points, of the ORIGINAL price of a booking that came from a referral link, which the platform pays to the person who shared the link.
// Lives on globalThis like the other mock stores.
// TODO(api): `organization_fee_settings` (organization_id, maintenance_bps, service_bps, referral_bps), SUPER_ADMIN only, audited.
import { checkFeeRates, DEFAULT_FEE_RATES, isValidFeeBps, type FeeRates } from "@workshop/shared";

/** The referral fee until an administrator sets it: 10% of the original price of the referred booking (a round value chosen to try the UI, like the other defaults). */
export const DEFAULT_REFERRAL_BPS = 1000;

const g = globalThis as unknown as { __feeRates?: Map<string, FeeRates>; __referralBps?: Map<string, number> };
const rates = () => (g.__feeRates ??= new Map<string, FeeRates>());
const referral = () => (g.__referralBps ??= new Map<string, number>());

export const getFeeRates = (organizationId: string): FeeRates => ({ ...(rates().get(organizationId) ?? DEFAULT_FEE_RATES) });
export const getReferralBps = (organizationId: string): number => referral().get(organizationId) ?? DEFAULT_REFERRAL_BPS;

/** Saves the rates of one shop; the result says why they were refused. */
export function setFeeRates(organizationId: string, next: FeeRates): ReturnType<typeof checkFeeRates> {
  const check = checkFeeRates(next);
  if (check === "OK") rates().set(organizationId, { maintenanceBps: next.maintenanceBps, serviceBps: next.serviceBps });
  return check;
}

export type AllRatesCheck = ReturnType<typeof checkFeeRates> | "REFERRAL_INVALID";

/** The three rates of a shop in one step (the Config Fee page). Nothing is saved when one of them is refused. */
export function setAllRates(organizationId: string, next: FeeRates & { referralBps: number }): AllRatesCheck {
  if (!isValidFeeBps(next.referralBps)) return "REFERRAL_INVALID";
  const check = checkFeeRates(next);
  if (check !== "OK") return check;
  setFeeRates(organizationId, next);
  referral().set(organizationId, next.referralBps);
  return "OK";
}

/** Bulk action: the same three rates for every shop of the list. All or none: a refused rate saves nothing. */
export function applyRatesToAll(organizationIds: readonly string[], next: FeeRates & { referralBps: number }): AllRatesCheck {
  const check = isValidFeeBps(next.referralBps) ? checkFeeRates(next) : "REFERRAL_INVALID";
  if (check !== "OK") return check;
  for (const id of organizationIds) setAllRates(id, next);
  return "OK";
}

/** Test helper: every shop back to the default rates. */
export function resetFeeRates(): void {
  g.__feeRates = new Map();
  g.__referralBps = new Map();
}
