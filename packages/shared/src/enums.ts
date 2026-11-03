export const LOCALES = ["en", "vi", "ko", "ja", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** The system admin area (/systemadmin) is only available in these languages. */
export const ADMIN_LOCALES = ["en", "vi"] as const satisfies readonly Locale[];

export const ORG_STATUSES = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "SUSPENDED"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const WORKSHOP_STATUSES = ["DRAFT", "ACTIVE"] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

/** COMPLETED: a session that took place and ended; the owner marks it from CLOSED once its time is over, then confirms the payments. */
export const SESSION_STATUSES = ["OPEN", "PAUSED", "RUNNING", "CLOSED", "COMPLETED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * A new booking is NOT_CONFIRMED until the guest opens the link in the email sent to them (then CONFIRMED). The shop owner checks a guest in
 * (CHECKED_IN, from either status) and can undo it (back to the status the booking had before). A booking can be cancelled.
 */
export const BOOKING_STATUSES = ["NOT_CONFIRMED", "CONFIRMED", "CHECKED_IN", "CANCELLED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** A booking is UNPAID until what was paid (net of refunds) covers its total, then PAID. Every booking starts UNPAID. */
export const PAYMENT_STATUSES = ["UNPAID", "PAID"] as const;
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
