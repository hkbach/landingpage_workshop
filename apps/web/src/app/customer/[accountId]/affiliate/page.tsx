import { CustomerAffiliatePage } from "@/components/customer/customer-affiliate-page";
import { loadListedShops } from "@/lib/own-customer";

// The Affiliate page: tab Program (the active workshops, each with Register Affiliate and then Copy Affiliate link) and tab Affiliate link (the links made, with their status).
export const dynamic = "force-dynamic";

export default async function CustomerAffiliateRoute({ params }: PageProps<"/customer/[accountId]/affiliate">) {
  const { accountId } = await params;
  return <CustomerAffiliatePage shops={await loadListedShops(accountId)} />;
}
