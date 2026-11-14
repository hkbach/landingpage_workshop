// The rows of the lists of the platform administrator, as the admin screens use them (lib/admin-adapters.ts turns the rows of the API into these).
import type { OrgStatus, WorkshopStatus } from "@workshop/shared";
import type { WalletSource, WithdrawalStatus } from "@/lib/customer-api";
import type { ContactMessage } from "@/lib/contact-types";
import type { AuditEntry, Booking, Session } from "@/lib/types";
import type { Account } from "@/lib/account-types";

export interface AdminWorkshop {
  id: string; title: string; shopId: string; shopName: string; shopSlug: string; editable: boolean; status: WorkshopStatus; categories: string[];
  priceAmount: number; currency: string; durationMinutes: number; defaultCapacity: number; maxPerBooking: number; createdAt: string;
  address?: string; addressNote?: string; description: string; rating?: { average: number; count: number };
  sessions: number; bookings: number;
}

export interface AdminShop {
  id: string; name: string; slug: string; status: OrgStatus; statusReason?: string; ownerName: string; ownerEmail: string; country: string; currency: string; timezone: string;
  contactEmail: string; contactPhone: string; whatsapp: string; mapsUrl: string; address: string; defaultLocale: string; enabledLocales: string[]; /** The own domain of the shop ("" when it has none). */ customDomain: string; createdAt: string; showOnCustomerPage: boolean; workshops: number; sessions: number; bookings: number;
}

export interface AdminSession extends Session { shopId: string; shopName: string; shopSlug: string; /** The time zone of the shop: the times are shown in it. */ timezone: string; editable: boolean; workshopTitle: string; closes: number; noteTexts: string[] }

export interface AdminBooking {
  id: string; bookingCode: string; status: Booking["status"]; paymentStatus: Booking["paymentStatus"]; source: Booking["source"];
  shopId: string; shopName: string; workshopId: string; workshopTitle: string; sessionId: string; sessionCode: string; startsAt: string; timezone: string;
  customerId: string; guestName: string; customerEmail: string; customerPhone: string; accountId: string;
  quantity: number; unitPriceAmount: number; discountAmount: number; totalAmount: number; currency: string; specialRequest: string; cancelReason: string; createdAt: string; checkedInAt: string;
  payments: Booking["payments"];
}

export interface AdminCustomer { email: string; name: string; customerId: string; accountId: string; bookings: number; shops: string[]; lastBookedAt: string; firstBookedAt: string }

export interface AdminLandingPage { shopId: string; shopName: string; slug: string; status: OrgStatus; ownerEmail: string; workshops: number; editable: boolean; customDomain: string }

export interface AdminUser extends Account { bookings: number; shopName: string }

export interface AdminAffiliate {
  id: string; code: string; accountId: string; accountEmail: string; accountName: string; workshopId: string; workshopTitle: string; shopId: string; shopName: string; shopSlug: string;
  createdAt: string; clicks: number; bookings: number; referralFee: number; currency: string;
  /** An administrator switched the link off, and why. */
  disabled: boolean; disabledReason: string;
}

export interface AdminReferralFriend {
  inviteId: string; inviteeId: string; email: string; name: string; registeredAt: string;
  status: "REGISTERED" | "EARNED"; bookingCode: string; bonus: number; paidAt: string;
}

export interface AdminReferralLink {
  inviterId: string; inviterEmail: string; inviterName: string;
  /** An administrator switched the code off, and why. */
  disabled: boolean; disabledReason: string;
  /** The one invite code of the customer. */
  code: string; currency: string;
  /** How many friends registered through it, how many of them earned the bonus (a paid booking), and the bonus earned in all. */
  registered: number; earned: number; bonusTotal: number;
  friends: AdminReferralFriend[];
}

export interface AdminWithdrawal {
  id: string; code: string; accountId: string; accountEmail: string; accountName: string; source: WalletSource; amount: number; currency: string;
  status: WithdrawalStatus; requestedAt: string; processedAt: string; reason: string;
  /** Where to pay it (outside the system): the whole account number, because the admin who pays needs it. */
  bankName: string; accountNumber: string; accountHolder: string;
  /** What the customer has earned from the program and still can withdraw (to decide with). */
  available: number;
}

export interface AdminAuditRow extends AuditEntry { organizationName: string; organizationSlug: string }

export interface AuditFilters { email?: string; org?: string; action?: string; entity?: string; role?: string; from?: string; to?: string }

export type AdminMessage = ContactMessage;

export interface AdminEmail {
  id: string; type: string; to: string; subject: string; createdAt: string; status: "SENT" | "FAILED"; attempts: number; error: string;
  /** Whether an administrator wrote it (its text can be read); the emails of the system carry secret links and are never shown. */
  written: boolean;
}

export interface AdminVoucher {
  id: string; code: string; title: string; shopId: string; shopName: string; discountType: "PERCENT" | "FIXED_AMOUNT"; discountValue: number; currency: string;
  startDate: string; endDate: string; appliesTo: "ALL" | "SELECTED"; workshops: number; stacking: string;
  /** RUNNING / SCHEDULED / PAUSED / EXPIRED, as the shop owner sees it. */
  status: "ACTIVE" | "SCHEDULED" | "PAUSED" | "EXPIRED";
  /** How many bookings used it and how much it took off in all. */
  bookings: number; discountTotal: number;
  /** The reason when an administrator paused it, and when. */
  heldReason: string; heldAt: string;
}

export interface AdminMedia {
  /** For an upload the id of the file; for an image shown from a link a made-up id (`link-...`). */
  id: string;
  /** UPLOAD: a file kept by the platform (it can be removed). LINK: an image a record points to by an address (it can be looked at; the real storage, R2, replaces both). */
  source: "UPLOAD" | "LINK";
  kind: "promotion" | "session" | "workshop";
  url: string; shopId: string; shopName: string;
  /** What shows it: the code of the voucher, the code of the session, the name of the workshop. */
  usedBy: string;
  mime: string; size: number; uploadedAt: string;
}

export interface AdminRating {
  id: string; bookingCode: string; workshopId: string; workshopTitle: string; shopId: string; shopName: string; customerName: string; customerEmail: string;
  stars: number; comment: string; createdAt: string;
  /** VISIBLE counts in the rating of the workshop and is shown to the shop; REMOVED (by an administrator, with a reason) does neither. */
  status: "VISIBLE" | "REMOVED"; removedReason: string; removedAt: string;
}
