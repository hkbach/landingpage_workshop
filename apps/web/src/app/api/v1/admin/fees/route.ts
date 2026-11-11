import { DEFAULT_FEE_RATES } from "@workshop/shared";
import { DEFAULT_INVITE_BONUS_BPS, DEFAULT_REFERRAL_BPS, getFeeRates, getInviteBonusBps, getReferralBps } from "@/lib/mock/fee-rates-store";
import { liveShops } from "@/lib/mock/shop-admin-store";

// The fee rates of every shop (maintenance, service and referral, in basis points: 1% = 100). SUPER_ADMIN only; TODO(api): check the role.

/** GET -> { defaults, items: [{ shopId, shopName, maintenanceBps, serviceBps, referralBps (affiliate fee), inviteBonusBps (referral bonus) }] }. */
export async function GET() {
  return Response.json({
    defaults: { ...DEFAULT_FEE_RATES, referralBps: DEFAULT_REFERRAL_BPS, inviteBonusBps: DEFAULT_INVITE_BONUS_BPS },
    items: liveShops().map((s) => ({ shopId: s.id, shopName: s.name, ...getFeeRates(s.id), referralBps: getReferralBps(s.id), inviteBonusBps: getInviteBonusBps(s.id) })),
  }, { headers: { "cache-control": "no-store" } });
}
