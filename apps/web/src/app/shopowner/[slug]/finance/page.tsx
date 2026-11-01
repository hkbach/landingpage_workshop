import { entriesFromPayments } from "@workshop/shared";
import { FinanceView } from "@/components/finance/finance-view";
import { liveBookings } from "@/lib/mock/booking-store";
import { currentShop, mockFinanceEntries } from "@/lib/mock/data";

// Income and expenses of the shop. Booking payments are income (refunds an expense) and follow the bookings; the rest is entered here.
export default function FinancePage() {
  return <FinanceView derived={entriesFromPayments(liveBookings())} seed={mockFinanceEntries} currency={currentShop.currency} timezone={currentShop.timezone} />;
}
