import type {
  BookingSource, BookingStatus, Localized, Locale, OrgStatus, PaymentMethod,
  PaymentStatus, ReportRecord, SectionType, SessionStatus, WorkshopStatus,
} from "@workshop/shared";

// UI-side view models. Money is minor units (number here; bigint is serialized by the API). Times are ISO UTC strings.
export interface Shop {
  id: string; name: string; slug: string; status: OrgStatus; statusReason?: string;
  country: string; timezone: string; currency: string;
  defaultLocale: Locale; enabledLocales: Locale[];
  contactEmail: string; contactPhone: string; whatsapp?: string; address: string; mapsUrl: string;
  bookingCutoffMinutes: number; plan: "FREE" | "PRO"; ownerName: string; ownerEmail: string; createdAt: string;
}

export interface Workshop {
  id: string; title: Localized; shortDescription: Localized; description: Localized;
  includes: Record<Locale, string[]> | Partial<Record<Locale, string[]>>; notes: Localized;
  durationMinutes: number; priceAmount: number; currency: string;
  defaultCapacity: number; maxPerBooking: number; coverUrl: string; galleryUrls: string[];
  status: WorkshopStatus; sortOrder: number;
}

export interface Session {
  id: string; workshopId: string; startsAt: string; endsAt: string;
  capacity: number; reservedCount: number; status: SessionStatus; cancelReason?: string;
}

export interface Customer {
  id: string; fullName: string; email?: string; country: string; phone?: string; preferredLocale: Locale;
}

export interface PaymentEntry {
  id: string; type: "PAYMENT" | "REFUND"; amount: number; method: PaymentMethod; note?: string; recordedAt: string; recordedBy: string;
}

export interface Booking {
  id: string; bookingCode: string; sessionId: string; workshopId: string; customerId: string;
  source: BookingSource; quantity: number; status: BookingStatus; paymentStatus: PaymentStatus;
  unitPriceAmount: number; totalAmount: number; currency: string;
  workshopTitle: string; startsAt: string; endsAt: string; timezone: string;
  specialRequest?: string; cancelReason?: string; createdAt: string; payments: PaymentEntry[];
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
