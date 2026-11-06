import type {
  BookingSource, BookingStatus, Gender, Localized, Locale, OrgStatus, PaymentMethod,
  PaymentStatus, ReportRecord, SectionType, SessionNote, SessionStatus, Socials, WorkshopCategory, WorkshopStatus
} from "@workshop/shared";

// UI-side view models. Money is minor units (number here; bigint is serialized by the API). Times are ISO UTC strings.
export interface Shop {
  id: string; name: string; slug: string; status: OrgStatus; statusReason?: string;
  country: string; timezone: string; currency: string;
  defaultLocale: Locale; enabledLocales: Locale[];
  contactEmail: string; contactPhone: string; whatsapp?: string; address: string; mapsUrl: string;
  plan: "FREE" | "PRO"; ownerName: string; ownerEmail: string; createdAt: string;
  /**
   * Set by the platform administrator: the workshops of this shop are listed on the Workshops page of the guest area (/customer/{id}/workshops). Only an ACTIVE
   * shop that was chosen appears there. TODO(site admin): the setting that changes it; for now it is data of the mock.
   */
  showOnCustomerPage?: boolean;
}

export interface Workshop {
  id: string; title: Localized; shortDescription: Localized; description: Localized;
  includes: Record<Locale, string[]> | Partial<Record<Locale, string[]>>; notes: Localized;
  durationMinutes: number; priceAmount: number; currency: string;
  defaultCapacity: number; maxPerBooking: number; coverUrl: string; galleryUrls: string[];
  status: WorkshopStatus; sortOrder: number;
  /** The field the workshop belongs to, chosen by the shop owner (for statistics). */
  category?: WorkshopCategory;
  /** Where the workshop takes place, as the shop owner wrote it. Missing or empty: it is held at the address of the shop. Guests see the address that applies (see workshopAddress). */
  address?: string;
  /** A note that goes with the address (the floor, the entrance, where to park...), written by the shop owner. Shown to guests with the address, whichever address applies. */
  addressNote?: string;
  /** What guests rated it: the average, from 1 to 5 stars, and how many ratings it comes from. Missing while nobody rated it. TODO(api): worked out from the ratings. */
  rating?: { average: number; count: number };
  /** ISO UTC instant the workshop was created. */
  createdAt: string;
}

export interface Session {
  id: string;
  /** Code the owner uses to manage the session ("SES-0001"), made by the system and never changed. */
  code: string; workshopId: string; startsAt: string; endsAt: string;
  capacity: number; reservedCount: number; status: SessionStatus;
  /** Set when the system closed the session because its time was over (an owner's Close does not set it). */
  autoClosed?: boolean;
  /** What happened to the session, one note each time (closed, re-scheduled, re-opened) and never removed: the history shown on its card. */
  notes?: SessionNote[];
  /** Minutes before the session starts at which online booking closes (set per session when it is created). */
  bookingCutoffMinutes: number;
  /** One picture for the session (https URL or a platform media path); guests see it when they choose a time. */
  imageUrl?: string;
  /** The session this one was cloned from (shown as a note on the session). */
  clonedFrom?: { code: string; workshopId: string };
}

export interface Customer {
  id: string; fullName: string; email?: string; phone?: string; preferredLocale: Locale;
  /**
   * Set only for a guest who registered an account: the country they live in and their birth date ("YYYY-MM-DD"), both given at registration. A guest who
   * only booked has no account, so the shop knows neither.
   */
  account?: { country: string; birthDate: string; /** The three fields of workshops the guest likes, picked at registration. */ favoriteCategories?: WorkshopCategory[]; gender?: Gender; socials?: Socials; avatarUrl?: string; /** When the guest agreed that the shop keeps the country and the date of birth. */ consentAt?: string };
}

export interface PaymentEntry {
  id: string; type: "PAYMENT" | "REFUND"; amount: number; method: PaymentMethod; note?: string; recordedAt: string; recordedBy: string;
}

export interface Booking {
  id: string; bookingCode: string; sessionId: string; workshopId: string; customerId: string;
  source: BookingSource; quantity: number; status: BookingStatus; paymentStatus: PaymentStatus;
  /** The name of the guest as it was typed when the booking was made. Each booking keeps its own; the customer (found by email) keeps one name. */
  guestName?: string;
  unitPriceAmount: number; totalAmount: number; currency: string;
  workshopTitle: string; startsAt: string; endsAt: string; timezone: string;
  specialRequest?: string; cancelReason?: string;
  /** Who cancelled the booking: the shop owner or the guest (a guest can cancel until the session starts). */
  cancelledBy?: "SHOP" | "GUEST";
  createdAt: string; payments: PaymentEntry[];
  /** Promotions the guest used on this booking (a snapshot: the booking keeps them if the promotion is later deleted) and what they took off. */
  promotionIds?: string[]; discountAmount?: number;
  /** When the guest was checked in (set by Check-in, cleared by Uncheck-in), for tracking. */
  checkedInAt?: string;
  /** The status the booking had before the check-in (NOT_CONFIRMED or CONFIRMED), kept while it is checked in: an uncheck-in goes back to it. */
  statusBeforeCheckIn?: "NOT_CONFIRMED" | "CONFIRMED";
}

/** Per-section colour overrides (hex only, #RGB or #RRGGBB). Rendered only via CSS custom properties. */
export interface SectionStyle { background?: string; text?: string; accent?: string }
export interface SectionInstance {
  id: string; type: SectionType; enabled: boolean;
  /** Layout variant declared by the section registry; falls back to the registry default when missing/unknown. */
  variant?: string;
  /** Show a Book button in this section. Missing = the type's default (hero and workshops on, others off). Never on the footer. */
  showBook?: boolean;
  props: Record<string, unknown>;
  style?: SectionStyle;
}
/** Page structure ("frame") of a template: how sections are arranged and what chrome surrounds them. */
export type LayoutKey =
  | "classic" | "quicklinks" | "sidebar" | "bento" | "bookingrail"
  | "magazine" | "cinematic" | "floatingcards" | "journey" | "appstyle";
export interface PageContent {
  schemaVersion: 1; sections: SectionInstance[]; seo: { title: Localized; description: Localized };
  /** Page layout; missing or unknown values fall back to the first layout ("classic"). */
  layout?: LayoutKey;
}
export type ThemeRadius = "none" | "sm" | "md" | "lg" | "xl";
export type ThemeDensity = "compact" | "comfortable" | "spacious";
/** Page-level theme tokens. Palettes are presets that fill the colour tokens; "custom" means edited by hand. */
export interface PageTheme {
  palette: string; primary: string; background: string; text: string; surface: string; font: string;
  radius?: ThemeRadius; density?: ThemeDensity; logoUrl?: string; faviconUrl?: string;
}

export interface AuditEntry {
  id: string; organizationId?: string; actor: string; action: string; entityType: string; entityId: string; createdAt: string; ip?: string;
}
/** A report of a landing page (see @workshop/shared reports). */
export type AbuseReport = ReportRecord;
