import { notFound } from "next/navigation";
import { pickLocalized, type BookingPriceInfo, type Locale } from "@workshop/shared";
import { loadOwnShop, type OwnShop } from "@/lib/own-shop";
import { ownWorkshops, type OwnWorkshop } from "@/lib/own-catalog";
import { fetchAll } from "@/lib/shop-data";
import type { Booking, Customer, Session } from "@/lib/types";

// What the operations pages (Sessions, Bookings, Today, Customers) need, from the API, in the shapes those pages already use. Only called when connected to the API.

type ApiSession = Omit<Session, "imageUrl" | "autoClosed"> & { workshopTitle: Record<string, string>; imageUrl: string | null; autoClosed: boolean };

type ApiBooking = {
  id: string; code: string; status: Booking["status"]; paymentStatus: Booking["paymentStatus"]; source: Booking["source"]; quantity: number;
  unitPriceAmount: number; totalAmount: number; paidAmount: number; currency: string;
  guest: { name: string; email: string | null; phone: string; country: string }; specialRequest: string | null;
  session: { id: string; code: string; startsAt: string; endsAt: string; status: string }; workshop: { id: string; title: Record<string, string> };
  customerId: string; cancelReason: string | null; cancelledBy: "SHOP" | "GUEST" | null; checkedInAt: string | null; createdAt: string;
};

type ApiCustomer = { id: string; fullName: string; email: string; phone: string; country: string; bookingCount: number; lastBookingAt: string | null; createdAt: string };

export type OpsData = {
  shop: OwnShop; workshops: OwnWorkshop[]; sessions: Session[]; bookings: Booking[]; customers: Customer[];
  /** The original price of each booking and what its vouchers took off, by booking id. */
  prices: Record<string, BookingPriceInfo>;
};

export function toSession(s: ApiSession): Session {
  const { workshopTitle: _title, imageUrl, autoClosed, ...rest } = s;
  void _title;
  return { ...rest, ...(imageUrl ? { imageUrl } : {}), ...(autoClosed ? { autoClosed: true } : {}) };
}

export function toBooking(b: ApiBooking, shop: Pick<OwnShop, "timezone" | "defaultLocale">): Booking {
  return {
    id: b.id, bookingCode: b.code, sessionId: b.session.id, workshopId: b.workshop.id, customerId: b.customerId, source: b.source, quantity: b.quantity, status: b.status,
    paymentStatus: b.paymentStatus, guestName: b.guest.name, unitPriceAmount: b.unitPriceAmount, totalAmount: b.totalAmount, currency: b.currency,
    workshopTitle: pickLocalized(b.workshop.title, shop.defaultLocale as Locale, shop.defaultLocale as Locale), startsAt: b.session.startsAt, endsAt: b.session.endsAt, timezone: shop.timezone,
    ...(b.specialRequest ? { specialRequest: b.specialRequest } : {}), ...(b.cancelReason ? { cancelReason: b.cancelReason } : {}), ...(b.cancelledBy ? { cancelledBy: b.cancelledBy } : {}),
    createdAt: b.createdAt, discountAmount: Math.max(0, b.unitPriceAmount * b.quantity - b.totalAmount),
    // The list gives what was paid, not each entry: one entry stands for it (the screen then shows the right payment status).
    payments: b.paidAmount > 0 ? [{ id: `paid-${b.id}`, type: "PAYMENT", amount: b.paidAmount, method: "CASH", recordedAt: b.createdAt, recordedBy: "" }] : [],
    ...(b.checkedInAt ? { checkedInAt: b.checkedInAt } : {}),
  };
}

export function toCustomer(c: ApiCustomer): Customer {
  return { id: c.id, fullName: c.fullName, ...(c.email ? { email: c.email } : {}), ...(c.phone ? { phone: c.phone } : {}), preferredLocale: "en" };
}

/** What a booking cost before its vouchers: the unit price times the guests; the difference to the total is the discount (one line: the API keeps the sum). */
export function pricesOf(bookings: readonly Booking[]): Record<string, BookingPriceInfo> {
  return Object.fromEntries(bookings.map((b) => {
    const subtotal = b.unitPriceAmount * b.quantity;
    const off = Math.max(0, subtotal - b.totalAmount);
    return [b.id, { subtotal, discounts: off > 0 ? [{ code: "discount", amount: off }] : [] }];
  }));
}

/** The sessions, bookings, customers and workshops of the shop of the session (the whole lists, see lib/shop-data.ts). */
export async function loadOpsData(need: { sessions?: boolean; bookings?: boolean; customers?: boolean } = {}): Promise<OpsData> {
  // the shop and the lists at once (the lists do not need the shop to be asked for); a screen that does not show one of the lists leaves it out (`{ sessions: false }`) instead of reading up to 2000 rows for nothing
  const none = <T>(): Promise<T[]> => Promise.resolve([]);
  const [shop, workshops, sessions, bookings, customers] = await Promise.all([
    loadOwnShop(), ownWorkshops(), need.sessions === false ? none<ApiSession>() : fetchAll<ApiSession>("/sessions"), need.bookings === false ? none<ApiBooking>() : fetchAll<ApiBooking>("/bookings"),
    need.customers === false ? none<ApiCustomer>() : fetchAll<ApiCustomer>("/customers"),
  ]);
  if (!shop) notFound();
  const mapped = bookings.map((b) => toBooking(b, shop));
  return { shop, workshops, sessions: sessions.map(toSession), bookings: mapped, customers: customers.map(toCustomer), prices: pricesOf(mapped) };
}
