import { ledgerFromPayments } from "@workshop/shared";
import { FinanceView } from "@/components/finance/finance-view";
import { liveBookings } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { paymentSources } from "@/lib/mock/ledger-source";
import { getFeeRates } from "@/lib/mock/fee-rates-store";

// Income of the shop: Profit = total income (booking payments minus refunds) - maintenance fee - service fee. The two rates of this shop
// are set by the platform administrator (/systemadmin/organizations/{id}).
export default function FinancePage() {
  const rates = getFeeRates(currentShop.id);
  return <FinanceView rows={ledgerFromPayments(paymentSources(liveBookings()), rates)} rates={rates} currency={currentShop.currency} timezone={currentShop.timezone} />;
}
