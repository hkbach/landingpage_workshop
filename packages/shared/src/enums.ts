export const LOCALES = ["en", "vi", "ko", "ja", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** The system admin area (/systemadmin) is only available in these languages. */
export const ADMIN_LOCALES = ["en", "vi"] as const satisfies readonly Locale[];

export const ORG_STATUSES = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "SUSPENDED"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const WORKSHOP_STATUSES = ["DRAFT", "ACTIVE"] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

export const SESSION_STATUSES = ["OPEN", "PAUSED", "RUNNING", "CLOSED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const BOOKING_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
  "LATE_RELEASED",
  "NO_SHOW",
  "CANCELLED",
  /** The session ended and the guest had not checked in (set by the system, never by hand). */
  "SESSION_EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BOOKING_SOURCES = ["ONLINE", "WALK_IN", "PHONE", "OTHER"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "E_WALLET", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SECTION_TYPES = [
  "hero",
  "about",
  "workshops",
  "promotions",
  "gallery",
  "team",
  "testimonials",
  "faq",
  "location",
  "contact",
  "video",
  "footer",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
