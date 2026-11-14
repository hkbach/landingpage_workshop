// The income of the platform per shop, as the admin screens show it.

export interface ShopIncome {
  shopId: string; shopName: string; currency: string;
  /** The payments received on the bookings of the shop, less the refunds. */
  income: number;
  /** The original price of the bookings (before vouchers): what every fee is a percentage of. */
  basePrice: number;
  maintenanceFee: number; serviceFee: number;
  /** maintenanceFee + serviceFee: the INCOME OF THE ADMIN (what the platform charged the shop). */
  fees: number;
  /** What the platform pays for the bookings that came through affiliate links (the affiliate fee). */
  referralFee: number;
  /** What the platform pays customers for the friends they invited whose first booking was paid (the referral bonus). */
  inviteBonus: number;
  /** fees - referralFee - inviteBonus. */
  profit: number;
  bookings: number;
}

export interface Income {
  from: string | null; to: string | null;
  shops: ShopIncome[];
  /** The totals, one per currency (amounts of different currencies are never added together). */
  totals: { currency: string; income: number; basePrice: number; fees: number; referralFee: number; inviteBonus: number; profit: number }[];
}

export type IncomeCheck = "OK" | "INVALID" | "ORDER";

/** One payment recorded by the shop, with what the platform charged on it. A negative amount is a REVERSAL of a payment that was recorded by mistake (the shop undid it with Unpaid): it gives its fees back. */
export interface IncomeLine {
  id: string; bookingCode: string; occurredAt: string; kind: "PAYMENT" | "REVERSAL"; currency: string;
  /** What the guest paid (signed), and the original price it is a part of: every fee is a percentage of this. */
  amount: number; basePrice: number;
  maintenanceFee: number; serviceFee: number;
  /** The affiliate fee owed for this payment (0 when the booking did not come through a link). */
  referralFee: number; referred: boolean;
  /** maintenanceFee + serviceFee - referralFee. */
  profit: number;
}

/** The statement of one month (the month of the shop): what the system closes at the end of the month, and what the shop owes the platform (maintenance + service fees). */
export interface MonthStatement {
  month: string; payments: number; income: number; basePrice: number; maintenanceFee: number; serviceFee: number;
  /** maintenanceFee + serviceFee: the amount of the invoice the platform sends the shop for the month (sending the invoices is built later). */
  fees: number; referralFee: number; inviteBonus: number; profit: number;
}

export interface ShopIncomeDetail { shopId: string; shopName: string; currency: string; timezone: string; lines: IncomeLine[]; months: MonthStatement[] }
