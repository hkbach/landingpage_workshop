// Temporary mock data for UI development. Replaced by API calls (TanStack Query) once apps/api exists.
import type {
  AbuseReport, AuditEntry, Booking, Customer, PageContent, PageTheme, Session, Shop, Workshop,
} from "../types";
import { themeForTemplate, type TemplateKey } from "@/components/sections/templates";

const TZ = "Asia/Ho_Chi_Minh"; // UTC+7
const DAY = 86_400_000;

/** ISO UTC for `daysFromNow` at the given shop-local hour. */
function at(daysFromNow: number, hourLocal: number): string {
  const d = new Date();
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + daysFromNow * DAY;
  return new Date(base + (hourLocal - 7) * 3_600_000).toISOString();
}

export const shops: Shop[] = [
  {
    id: "org-1", name: "Clay & Co Studio", slug: "clayco", status: "ACTIVE", country: "VN", timezone: TZ, currency: "VND",
    defaultLocale: "en", enabledLocales: ["en", "vi", "ko"], contactEmail: "hello@clayco.example", contactPhone: "+84 90 000 0000",
    whatsapp: "+84 90 000 0000", address: "12 Nguyen Hue, District 1, Ho Chi Minh City", mapsUrl: "https://maps.app.goo.gl/example",
    bookingCutoffMinutes: 120, plan: "FREE", ownerName: "Linh Tran", ownerEmail: "linh@clayco.example", createdAt: at(-60, 9),
  },
  {
    id: "org-2", name: "Wax & Wick", slug: "waxwick", status: "PENDING_REVIEW", country: "VN", timezone: TZ, currency: "VND",
    defaultLocale: "en", enabledLocales: ["en", "ja"], contactEmail: "hi@waxwick.example", contactPhone: "+84 91 111 1111",
    address: "5 Le Loi, Hoi An", mapsUrl: "https://maps.app.goo.gl/example2",
    bookingCutoffMinutes: 120, plan: "FREE", ownerName: "Minh Pham", ownerEmail: "minh@waxwick.example", createdAt: at(-3, 10),
  },
  {
    id: "org-3", name: "Silver Thread", slug: "silverthread", status: "SUSPENDED", statusReason: "Reported as misleading", country: "VN", timezone: TZ, currency: "USD",
    defaultLocale: "en", enabledLocales: ["en"], contactEmail: "contact@silver.example", contactPhone: "+84 92 222 2222",
    address: "88 Hang Bac, Hanoi", mapsUrl: "https://maps.app.goo.gl/example3",
    bookingCutoffMinutes: 120, plan: "PRO", ownerName: "An Nguyen", ownerEmail: "an@silver.example", createdAt: at(-120, 10),
  },
];

/** The shop the dashboard mock is "logged in" as. */
export const currentShop = shops[0]!;

export const workshops: Workshop[] = [
  {
    id: "ws-1", title: { en: "Pottery Wheel Basics", vi: "Làm gốm cơ bản", ko: "도자기 물레 기초" },
    shortDescription: { en: "Throw your first bowl on the wheel.", vi: "Tự tay làm chiếc bát đầu tiên." },
    description: { en: "A relaxed 2-hour class: centering, pulling and shaping clay with a local artisan." },
    includes: { en: ["All materials", "Apron", "Tea and snacks"] }, notes: { en: "Wear clothes you do not mind getting dirty." },
    durationMinutes: 120, priceAmount: 650_000, currency: "VND", defaultCapacity: 8, maxPerBooking: 6,
    coverUrl: "https://picsum.photos/seed/pottery/1200/800", galleryUrls: ["https://picsum.photos/seed/p1/800/600", "https://picsum.photos/seed/p2/800/600"],
    status: "ACTIVE", sortOrder: 1,
  },
  {
    id: "ws-2", title: { en: "Glaze & Paint Your Mug", vi: "Vẽ men lên cốc" },
    shortDescription: { en: "Decorate a ready-made mug." }, description: { en: "Pick colours and patterns; we fire it for pickup in 5 days." },
    includes: { en: ["Mug", "Glazes"] }, notes: {},
    durationMinutes: 90, priceAmount: 400_000, currency: "VND", defaultCapacity: 10, maxPerBooking: 6,
    coverUrl: "https://picsum.photos/seed/mug/1200/800", galleryUrls: [], status: "ACTIVE", sortOrder: 2,
  },
  {
    id: "ws-3", title: { en: "Hand-building Plates" }, shortDescription: { en: "Coil and slab techniques." }, description: { en: "Draft." },
    includes: {}, notes: {}, durationMinutes: 150, priceAmount: 500_000, currency: "VND", defaultCapacity: 6, maxPerBooking: 4,
    coverUrl: "https://picsum.photos/seed/plates/1200/800", galleryUrls: [], status: "DRAFT", sortOrder: 3,
  },
];

export const sessions: Session[] = [
  { id: "se-1", workshopId: "ws-1", startsAt: at(0, 9), endsAt: at(0, 11), capacity: 8, reservedCount: 5, status: "OPEN" },
  { id: "se-2", workshopId: "ws-2", startsAt: at(0, 14), endsAt: at(0, 15.5), capacity: 10, reservedCount: 10, status: "OPEN" },
  { id: "se-3", workshopId: "ws-1", startsAt: at(1, 9), endsAt: at(1, 11), capacity: 8, reservedCount: 2, status: "OPEN" },
  { id: "se-4", workshopId: "ws-1", startsAt: at(1, 14), endsAt: at(1, 16), capacity: 8, reservedCount: 0, status: "CLOSED" },
  { id: "se-5", workshopId: "ws-2", startsAt: at(2, 10), endsAt: at(2, 11.5), capacity: 10, reservedCount: 3, status: "OPEN" },
  { id: "se-6", workshopId: "ws-1", startsAt: at(3, 9), endsAt: at(3, 11), capacity: 8, reservedCount: 0, status: "CANCELLED", cancelReason: "Instructor unavailable" },
];

export const customers: Customer[] = [
  { id: "cu-1", fullName: "Emma Johnson", email: "emma@example.com", country: "GB", phone: "+44 7000 000000", preferredLocale: "en" },
  { id: "cu-2", fullName: "Kim Min-jun", email: "minjun@example.com", country: "KR", preferredLocale: "ko" },
  { id: "cu-3", fullName: "Walk-in guest", country: "VN", preferredLocale: "en" },
  { id: "cu-4", fullName: "Nguyen Thu", email: "thu@example.com", country: "VN", phone: "+84 90 123 4567", preferredLocale: "vi" },
];

function booking(p: Partial<Booking> & Pick<Booking, "id" | "bookingCode" | "sessionId" | "customerId" | "quantity">): Booking {
  const s = sessions.find((x) => x.id === p.sessionId)!;
  const w = workshops.find((x) => x.id === s.workshopId)!;
  return {
    workshopId: w.id, source: "ONLINE", status: "CONFIRMED", paymentStatus: "UNPAID", unitPriceAmount: w.priceAmount,
    totalAmount: w.priceAmount * p.quantity, currency: w.currency, workshopTitle: w.title.en ?? "", startsAt: s.startsAt,
    endsAt: s.endsAt, timezone: TZ, createdAt: at(-1, 12), payments: [], ...p,
  };
}

export const bookings: Booking[] = [
  booking({ id: "bk-1", bookingCode: "7K3M9QX2", sessionId: "se-1", customerId: "cu-1", quantity: 2, specialRequest: "Vegetarian snacks please" }),
  booking({ id: "bk-2", bookingCode: "A8D4N6TP", sessionId: "se-1", customerId: "cu-2", quantity: 3, status: "CHECKED_IN",
    paymentStatus: "PAID", payments: [{ id: "pm-1", type: "PAYMENT", amount: 1_950_000, method: "CASH", recordedAt: at(0, 9), recordedBy: "Linh Tran" }] }),
  booking({ id: "bk-3", bookingCode: "C2F7R5WZ", sessionId: "se-2", customerId: "cu-4", quantity: 10 }),
  booking({ id: "bk-4", bookingCode: "E9H1J3KB", sessionId: "se-3", customerId: "cu-3", quantity: 2, source: "WALK_IN" }),
  booking({ id: "bk-5", bookingCode: "G4M8P2VS", sessionId: "se-5", customerId: "cu-1", quantity: 3, status: "CANCELLED", cancelReason: "Guest changed plans" }),
];

export const auditLogs: AuditEntry[] = [
  { id: "au-1", organizationId: "org-1", actor: "Linh Tran", action: "booking.check_in", entityType: "booking", entityId: "bk-2", createdAt: at(0, 9) },
  { id: "au-2", organizationId: "org-1", actor: "Linh Tran", action: "payment.record", entityType: "booking", entityId: "bk-2", createdAt: at(0, 9.2) },
  { id: "au-3", organizationId: "org-3", actor: "Platform Admin", action: "organization.suspend", entityType: "organization", entityId: "org-3", createdAt: at(-5, 15) },
  { id: "au-4", organizationId: "org-1", actor: "Platform Admin", action: "organization.approve", entityType: "organization", entityId: "org-1", createdAt: at(-58, 11) },
];

export const abuseReports: AbuseReport[] = [
  { id: "ar-1", shopSlug: "silverthread", reason: "SCAM", description: "Charged me twice on arrival.", reporterEmail: "x@example.com", status: "OPEN", createdAt: at(-6, 10) },
  { id: "ar-2", shopSlug: "clayco", reason: "OTHER", description: "Address looks wrong.", status: "DISMISSED", createdAt: at(-20, 10) },
];

// Default site of the current shop: the "artisan" template (craft-focused) with a video section.
export const defaultTheme: PageTheme = themeForTemplate("artisan");

export const sitePage: { draft: PageContent; theme: PageTheme; template: TemplateKey } = {
  theme: defaultTheme,
  template: "artisan",
  draft: {
    schemaVersion: 1,
    seo: { title: { en: "Clay & Co Studio – Pottery workshops in Saigon" }, description: { en: "Hands-on pottery classes for travellers." } },
    sections: [
      { id: "s-hero", type: "hero", enabled: true, variant: "split", props: {
        title: { en: "Make something with your hands", vi: "Tự tay tạo nên điều đặc biệt" },
        subtitle: { en: "Pottery workshops in the heart of Saigon" }, imageUrl: "https://picsum.photos/seed/hero/1600/900", ctaText: { en: "Book a workshop", vi: "Đặt chỗ" } } },
      { id: "s-about", type: "about", enabled: true, variant: "image-right", props: {
        heading: { en: "About us" }, body: { en: "We are a small family studio.\nEvery class is led by a local artisan." }, imageUrl: "https://picsum.photos/seed/about/800/600" } },
      { id: "s-team", type: "team", enabled: true, variant: "cards", props: { heading: { en: "Meet the artisans" }, members: [{ name: "Linh", role: { en: "Founder" }, bio: { en: "15 years of experience." }, imageUrl: "https://picsum.photos/seed/t1/400/400" }] } },
      { id: "s-ws", type: "workshops", enabled: true, variant: "grid", props: { heading: { en: "Our workshops" } } },
      { id: "s-gal", type: "gallery", enabled: true, variant: "masonry", props: { heading: { en: "Gallery" }, imageUrls: ["https://picsum.photos/seed/g1/600/600", "https://picsum.photos/seed/g2/600/800", "https://picsum.photos/seed/g3/600/500"] } },
      // Placeholder video ID for the mock; shops paste a YouTube link and only the ID is stored.
      { id: "s-video", type: "video", enabled: true, variant: "split", props: { heading: { en: "A day in the studio" }, caption: { en: "Watch how a bowl is made, from a lump of clay to the kiln." }, videoId: "dQw4w9WgXcQ" } },
      { id: "s-test", type: "testimonials", enabled: true, variant: "cards", props: { heading: { en: "Guests say" }, items: [{ name: "Emma", country: "GB", text: { en: "Best afternoon of our trip!" } }] } },
      { id: "s-faq", type: "faq", enabled: true, variant: "accordion", props: { heading: { en: "FAQ" }, items: [{ q: { en: "What if I arrive late?" }, a: { en: "Please arrive on time; bookings may be released after 30 minutes." } }] } },
      { id: "s-loc", type: "location", enabled: true, variant: "card", props: { heading: { en: "Find us" }, address: { en: "12 Nguyen Hue, District 1, HCMC" }, hours: { en: "Daily 9:00–18:00" }, mapsUrl: "https://maps.app.goo.gl/example" } },
      { id: "s-con", type: "contact", enabled: true, variant: "list", props: { heading: { en: "Contact" }, phone: "+84 90 000 0000", whatsapp: "+84 90 000 0000", email: "hello@clayco.example", socials: [] } },
      { id: "s-foot", type: "footer", enabled: true, variant: "dark", props: { text: { en: "© Clay & Co Studio" }, socials: [] } },
    ],
  },
};
