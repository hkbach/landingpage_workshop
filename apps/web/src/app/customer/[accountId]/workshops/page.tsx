import { CustomerWorkshops } from "@/components/customer/customer-workshops";
import { listedShops } from "@/lib/mock/customer-listing";
import { realApi } from "@/lib/api-server";
import { loadFavoriteIds, loadListedShops } from "@/lib/own-customer";

// The workshops of every shop the platform administrator chose to list (see listedShops). Read per request: the seats and the promotions depend on the time.
export const dynamic = "force-dynamic";

export default async function CustomerWorkshopsPage({ params }: PageProps<"/customer/[accountId]/workshops">) {
  if (realApi()) {
    const { accountId } = await params;
    const [shops, favorites] = await Promise.all([loadListedShops(accountId), loadFavoriteIds(accountId)]);
    return <CustomerWorkshops shops={shops} serverFavorites={favorites} />;
  }
  return <CustomerWorkshops shops={listedShops()} />;
}
