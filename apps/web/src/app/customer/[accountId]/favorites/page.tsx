import { CustomerWorkshops } from "@/components/customer/customer-workshops";
import { listedShops } from "@/lib/mock/customer-listing";
import { realApi } from "@/lib/api-server";
import { loadFavoriteIds, loadListedShops } from "@/lib/own-customer";

// The Workshops page with only the workshops the guest added to their favorites (kept by the server when connected, in the browser otherwise).
export const dynamic = "force-dynamic";

export default async function CustomerFavoritesPage({ params }: PageProps<"/customer/[accountId]/favorites">) {
  if (realApi()) {
    const { accountId } = await params;
    const [shops, favorites] = await Promise.all([loadListedShops(accountId), loadFavoriteIds(accountId)]);
    return <CustomerWorkshops shops={shops} mode="favorites" serverFavorites={favorites} />;
  }
  return <CustomerWorkshops shops={listedShops()} mode="favorites" />;
}
