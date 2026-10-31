import type {
  BookingSource, BookingStatus, Localized, Locale, OrgStatus, PaymentMethod,
  PaymentStatus, SectionType, SessionStatus, WorkshopStatus,
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

export interface SectionInstance { id: string; type: SectionType; enabled: boolean; props: Record<string, unknown> }
export interface PageContent {
  schemaVersion: 1; sections: SectionInstance[]; seo: { title: Localized; description: Localized };
}
export interface PageTheme { palette: string; primary: string; font: string; logoUrl?: string; faviconUrl?: string }

export interface AuditEntry {
  id: string; organizationId?: string; actor: string; action: string; entityType: string; entityId: string; createdAt: string; ip?: string;
}
export interface AbuseReport {
  id: string; shopSlug: string; reason: "SCAM" | "PHISHING" | "INAPPROPRIATE" | "OTHER";
  description: string; reporterEmail?: string; status: "OPEN" | "RESOLVED" | "DISMISSED"; createdAt: string;
}
