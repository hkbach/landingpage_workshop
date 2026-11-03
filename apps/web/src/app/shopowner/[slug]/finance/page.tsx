import { ledgerFromPayments } from "@workshop/shared";
import { FinanceView } from "@/components/finance/finance-view";
import { liveBookings } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { getFeeRates } from "@/lib/mock/fee-rates-store";

// Income of the shop: Profit = total income (booking payments minus refunds) - maintenance fee - service fee. The two rates are set by the
// platform administrator (/systemadmin/settings).
export default function FinancePage() {
  const rates = getFeeRates();
  return <FinanceView rows={ledgerFromPayments(liveBookings(), rates)} rates={rates} currency={currentShop.currency} timezone={currentShop.timezone} />;
}
