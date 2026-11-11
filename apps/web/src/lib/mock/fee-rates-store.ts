// SERVER-ONLY: the fee rates a system administrator sets for each shop (REQUIREMENTS FR-PAY-02, FR-ADM-10), until apps/api exists. The Income page of a shop reads
// the rates of that shop only; a shop without rates of its own uses the defaults. Besides the maintenance and the service fee, each shop has a REFERRAL fee: the
// percentage, in basis points, of the ORIGINAL price of a booking that came from a referral link, which the platform pays to the person who shared the link.
// A fourth rate, the REFERRAL BONUS (`inviteBonusBps`), is what a customer earns for a friend they invited (invite-store.ts): a percentage of the original price of the first paid
// booking of the friend. Keep the two apart: the referral (affiliate) fee above belongs to the link of a workshop, the referral bonus to the invitation of a friend.
// Lives on globalThis like the other mock stores.
// TODO(api): `organization_fee_settings` (organization_id, maintenance_bps, service_bps, referral_bps, invite_bonus_bps), SUPER_ADMIN only, audited.
import { checkFeeRates, DEFAULT_FEE_RATES, isValidFeeBps, type FeeRates } from "@workshop/shared";

/** The referral fee until an administrator sets it: 10% of the original price of the referred booking (a round value chosen to try the UI, like the other defaults). */
export const DEFAULT_REFERRAL_BPS = 1000;

/** The referral bonus until an administrator sets it: 10% of the original price of the first paid booking of the invited friend (a round value to try the UI). */
export const DEFAULT_INVITE_BONUS_BPS = 1000;

const g = globalThis as unknown as { __feeRates?: Map<string, FeeRates>; __referralBps?: Map<string, number>; __inviteBonusBps?: Map<string, number> };
const invite = () => (g.__inviteBonusBps ??= new Map<string, number>());
const rates = () => (g.__feeRates ??= new Map<string, FeeRates>());
const referral = () => (g.__referralBps ??= new Map<string, number>());

export const getFeeRates = (organizationId: string): FeeRates => ({ ...(rates().get(organizationId) ?? DEFAULT_FEE_RATES) });
export const getInviteBonusBps = (organizationId: string): number => invite().get(organizationId) ?? DEFAULT_INVITE_BONUS_BPS;
export const getReferralBps = (organizationId: string): number => referral().get(organizationId) ?? DEFAULT_REFERRAL_BPS;

/** Saves the rates of one shop; the result says why they were refused. */
export function setFeeRates(organizationId: string, next: FeeRates): ReturnType<typeof checkFeeRates> {
  const check = checkFeeRates(next);
  if (check === "OK") rates().set(organizationId, { maintenanceBps: next.maintenanceBps, serviceBps: next.serviceBps });
  return check;
}

export type AllRatesCheck = ReturnType<typeof checkFeeRates> | "REFERRAL_INVALID" | "BONUS_INVALID";

/** The rates of a shop. `inviteBonusBps` left out keeps the one the shop has. */
export type AllRates = FeeRates & { referralBps: number; inviteBonusBps?: number };

/** The rates of a shop in one step (the Config Fee page). Nothing is saved when one of them is refused. */
export function setAllRates(organizationId: string, next: AllRates): AllRatesCheck {
  if (!isValidFeeBps(next.referralBps)) return "REFERRAL_INVALID";
  if (next.inviteBonusBps !== undefined && !isValidFeeBps(next.inviteBonusBps)) return "BONUS_INVALID";
  const check = checkFeeRates(next);
  if (check !== "OK") return check;
  setFeeRates(organizationId, next);
  referral().set(organizationId, next.referralBps);
  if (next.inviteBonusBps !== undefined) invite().set(organizationId, next.inviteBonusBps);
  return "OK";
}

/** Bulk action: the same rates for every shop of the list. All or none: a refused rate saves nothing. */
export function applyRatesToAll(organizationIds: readonly string[], next: AllRates): AllRatesCheck {
  const check = !isValidFeeBps(next.referralBps) ? "REFERRAL_INVALID" : next.inviteBonusBps !== undefined && !isValidFeeBps(next.inviteBonusBps) ? "BONUS_INVALID" : checkFeeRates(next);
  if (check !== "OK") return check;
  for (const id of organizationIds) setAllRates(id, next);
  return "OK";
}

/** Test helper: every shop back to the default rates. */
export function resetFeeRates(): void {
  g.__feeRates = new Map();
  g.__referralBps = new Map();
  g.__inviteBonusBps = new Map();
}
