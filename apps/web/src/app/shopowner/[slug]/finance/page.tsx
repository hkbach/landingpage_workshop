import { notFound } from "next/navigation";
import { FinanceView } from "@/components/finance/finance-view";
import { loadIncome } from "@/lib/own-finance";
import { loadOwnShop } from "@/lib/own-shop";

// Income of the shop: Profit = total income (booking payments minus refunds) - maintenance fee - service fee. The two rates of this shop
// are set by the platform administrator (/systemadmin/organizations/{id}).
export default async function FinancePage() {
  const shop = await loadOwnShop();
  const income = shop ? await loadIncome(shop.timezone) : null;
  if (!shop || !income) notFound();
  return <FinanceView rows={income.rows} rates={income.rates} currency={income.currency} timezone={shop.timezone} />;
}
