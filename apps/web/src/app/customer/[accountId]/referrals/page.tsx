import { CustomerReferrals, type ReferralWorkshop } from "@/components/customer/customer-referrals";
import { listedShops } from "@/lib/mock/customer-listing";

// Referrals: the guest picks one of the workshops listed for guests and gets a link to share; the page shows the referral fee each link earned.
export const dynamic = "force-dynamic";

export default function CustomerReferralsPage() {
  const workshops: ReferralWorkshop[] = listedShops().flatMap((s) => s.workshops.map((w) => ({ id: w.id, title: w.title, shopName: s.shop.name, defaultLocale: s.shop.defaultLocale })));
  return <CustomerReferrals workshops={workshops} />;
}
