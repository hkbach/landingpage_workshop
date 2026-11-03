// Temporary mock data for UI development. Replaced by API calls (TanStack Query) once apps/api exists.
import type {
  AbuseReport, AuditEntry, Booking, Customer, PageContent, PageTheme, PaymentEntry, Session, Shop, Workshop,
} from "../types";
import { applyTemplate, themeForTemplate, type TemplateKey } from "@/components/sections/templates";
import { priceBooking, type BookingPriceInfo, type PaymentMethod } from "@workshop/shared";
import { computePaymentStatus, reservedSeats } from "../booking-state";

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
    defaultLocale: "en", enabledLocales: ["en", "vi", "ko", "ja", "zh"], contactEmail: "hello@clayco.example", contactPhone: "+84 90 000 0000",
    whatsapp: "+84 90 000 0000", address: "12 Nguyen Hue, District 1, Ho Chi Minh City", mapsUrl: "https://maps.app.goo.gl/example",
    plan: "FREE", ownerName: "Linh Tran", ownerEmail: "linh@clayco.example", createdAt: at(-60, 9),
  },
  {
    id: "org-2", name: "Wax & Wick", slug: "waxwick", status: "PENDING_REVIEW", country: "VN", timezone: TZ, currency: "VND",
    defaultLocale: "en", enabledLocales: ["en", "ja"], contactEmail: "hi@waxwick.example", contactPhone: "+84 91 111 1111",
    address: "5 Le Loi, Hoi An", mapsUrl: "https://maps.app.goo.gl/example2",
    plan: "FREE", ownerName: "Minh Pham", ownerEmail: "minh@waxwick.example", createdAt: at(-3, 10),
  },
  {
    id: "org-3", name: "Silver Thread", slug: "silverthread", status: "SUSPENDED", statusReason: "Reported as misleading", country: "VN", timezone: TZ, currency: "USD",
    defaultLocale: "en", enabledLocales: ["en"], contactEmail: "contact@silver.example", contactPhone: "+84 92 222 2222",
    address: "88 Hang Bac, Hanoi", mapsUrl: "https://maps.app.goo.gl/example3",
    plan: "PRO", ownerName: "An Nguyen", ownerEmail: "an@silver.example", createdAt: at(-120, 10),
  },
];

/** The shop the dashboard mock is "logged in" as. */
export const currentShop = shops[0]!;

export const workshops: Workshop[] = [
  {
    id: "ws-1", title: { en: "Pottery Wheel Basics", vi: "Làm gốm cơ bản", ko: "도자기 물레 기초", ja: "ろくろ体験の基本", zh: "陶艺转盘入门" },
    shortDescription: { en: "Throw your first bowl on the wheel.", vi: "Tự tay làm chiếc bát đầu tiên." },
    description: { en: "A relaxed 2-hour class: centering, pulling and shaping clay with a local artisan." },
    includes: { en: ["All materials", "Apron", "Tea and snacks"] }, notes: { en: "Wear clothes you do not mind getting dirty." },
    durationMinutes: 120, priceAmount: 650_000, currency: "VND", defaultCapacity: 8, maxPerBooking: 6,
    coverUrl: "https://picsum.photos/seed/pottery/1200/800", galleryUrls: ["https://picsum.photos/seed/p1/800/600", "https://picsum.photos/seed/p2/800/600"],
    status: "ACTIVE", sortOrder: 1, createdAt: at(-120, 9),
  },
  {
    id: "ws-2", title: { en: "Glaze & Paint Your Mug", vi: "Vẽ men lên cốc" },
    shortDescription: { en: "Decorate a ready-made mug." }, description: { en: "Pick colours and patterns; we fire it for pickup in 5 days." },
    includes: { en: ["Mug", "Glazes"] }, notes: {},
    durationMinutes: 90, priceAmount: 400_000, currency: "VND", defaultCapacity: 10, maxPerBooking: 6,
    coverUrl: "https://picsum.photos/seed/mug/1200/800", galleryUrls: [], status: "ACTIVE", sortOrder: 2, createdAt: at(-75, 14),
  },
  {
    id: "ws-3", title: { en: "Hand-building Plates" }, shortDescription: { en: "Coil and slab techniques." }, description: { en: "Draft." },
    includes: {}, notes: {}, durationMinutes: 150, priceAmount: 500_000, currency: "VND", defaultCapacity: 6, maxPerBooking: 4,
    coverUrl: "https://picsum.photos/seed/plates/1200/800", galleryUrls: [], status: "DRAFT", sortOrder: 3, createdAt: at(-6, 10.5),
  },
];

/** ISO UTC for `minutes` from now (negative: in the past). Used by the demo sessions that must be taking place, or about to start, when the page is opened. */
function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

const pic = (seed: string) => `https://picsum.photos/seed/session-${seed}/400/300`;

// Demo sessions: every status, every situation of the Sessions page, in the past, today and the future.
//   code          SES-0001 ... (the number is the number of the id, never changes)
//   reservedCount is filled below from the bookings (a cancelled booking holds no seat)
//   Open: new, never started. Running: bookable. Paused: stopped (Close / Re-schedule). Closed: by the owner (with a reason) or by the system.
export const sessions: Session[] = [
  // ---- TODAY (fixed hours: depending on the time of day they are over, taking place or still to come) ----
  { id: "se-1", code: "SES-0001", workshopId: "ws-1", startsAt: at(0, 9), endsAt: at(0, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120, imageUrl: pic("wheel") },
  { id: "se-2", code: "SES-0002", workshopId: "ws-2", startsAt: at(0, 14), endsAt: at(0, 15.5), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },

  // ---- RIGHT NOW (times relative to when the server started) ----
  // Taking place: Running (can only be paused), with a guest who checked in and two who did not yet.
  { id: "se-27", code: "SES-0027", workshopId: "ws-1", startsAt: inMinutes(-30), endsAt: inMinutes(90), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120, imageUrl: pic("live") },
  // Taking place but Paused: Close is read-only until it ends, Re-schedule is possible.
  { id: "se-28", code: "SES-0028", workshopId: "ws-2", startsAt: inMinutes(-20), endsAt: inMinutes(70), capacity: 10, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 60 },
  // Starts soon, inside its cut-off: guests see "Booking closed" (the owner can still check guests in).
  { id: "se-29", code: "SES-0029", workshopId: "ws-1", startsAt: inMinutes(40), endsAt: inMinutes(160), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },
  // Starts in a few hours with a short cut-off: bookable now.
  { id: "se-30", code: "SES-0030", workshopId: "ws-2", startsAt: inMinutes(300), endsAt: inMinutes(390), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 60 },
  // Paused and not started: it can be closed (with a reason) or re-scheduled, and it has guests.
  { id: "se-31", code: "SES-0031", workshopId: "ws-1", startsAt: inMinutes(180), endsAt: inMinutes(300), capacity: 8, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 90 },

  // ---- COMING DAYS ----
  { id: "se-3", code: "SES-0003", workshopId: "ws-1", startsAt: at(1, 9), endsAt: at(1, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120, imageUrl: pic("glaze") },
  // Closed by the owner before it started, with a reason that is one of the basic ones.
  { id: "se-4", code: "SES-0004", workshopId: "ws-1", startsAt: at(1, 14), endsAt: at(1, 16), capacity: 8, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "CLOSED", at: at(-1, 16), reason: { code: "VENUE_ISSUE" } }] },
  { id: "se-5", code: "SES-0005", workshopId: "ws-2", startsAt: at(2, 10), endsAt: at(2, 11.5), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 180, imageUrl: pic("mug") },
  { id: "se-41", code: "SES-0041", workshopId: "ws-1", startsAt: at(2, 16), endsAt: at(2, 18), capacity: 6, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 0 }, // closes when it starts
  { id: "se-6", code: "SES-0006", workshopId: "ws-1", startsAt: at(3, 9), endsAt: at(3, 11), capacity: 8, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "CLOSED", at: at(0, 8), reason: { code: "INSTRUCTOR_UNAVAILABLE" } }] },
  { id: "se-7", code: "SES-0007", workshopId: "ws-1", startsAt: at(4, 9), endsAt: at(4, 11), capacity: 8, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 60 },
  { id: "se-8", code: "SES-0008", workshopId: "ws-2", startsAt: at(4, 14), endsAt: at(4, 15.5), capacity: 10, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 120 },
  { id: "se-9", code: "SES-0009", workshopId: "ws-1", startsAt: at(5, 9), endsAt: at(5, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 1440, imageUrl: pic("pottery") },
  { id: "se-10", code: "SES-0010", workshopId: "ws-2", startsAt: at(5, 10), endsAt: at(5, 11.5), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },
  // Paused with two guests: one has an email (re-scheduling emails them), the other is a walk-in.
  { id: "se-11", code: "SES-0011", workshopId: "ws-1", startsAt: at(6, 14), endsAt: at(6, 16), capacity: 8, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 120 },
  { id: "se-12", code: "SES-0012", workshopId: "ws-2", startsAt: at(6, 9), endsAt: at(6, 10.5), capacity: 10, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [
    { type: "CLOSED", at: at(-4, 9), reason: { code: "NOT_ENOUGH_GUESTS" } }, { type: "REOPENED", at: at(-3, 9) },
    { type: "CLOSED", at: at(-3, 15), reason: { code: "VENUE_ISSUE" } }, { type: "REOPENED", at: at(-2, 9) },
    { type: "CLOSED", at: at(-2, 15), reason: { code: "INSTRUCTOR_UNAVAILABLE" } }, { type: "REOPENED", at: at(-1, 9) },
    { type: "CLOSED", at: at(0, 10), reason: { code: "SCHEDULE_CHANGE" } }, // the 4th close: closed for good (only a system administrator can open it)
  ] },
  { id: "se-13", code: "SES-0013", workshopId: "ws-1", startsAt: at(7, 9), endsAt: at(7, 11), capacity: 8, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "CLOSED", at: at(-3, 10), reason: { code: "NOT_ENOUGH_GUESTS" } }, { type: "REOPENED", at: at(-2, 9) }, { type: "CLOSED", at: at(-1, 9), reason: { code: "NOT_ENOUGH_GUESTS" } }] },
  { id: "se-14", code: "SES-0014", workshopId: "ws-2", startsAt: at(7, 14), endsAt: at(7, 15.5), capacity: 10, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "RESCHEDULED", at: at(-4, 11), reason: { code: "VENUE_ISSUE" } }, { type: "CLOSED", at: at(-1, 11), reason: { code: "OTHER", note: "The glaze delivery is late." } }] },
  // Sold out: every seat is booked.
  { id: "se-15", code: "SES-0015", workshopId: "ws-1", startsAt: at(8, 10), endsAt: at(8, 12), capacity: 6, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 30, imageUrl: pic("plates") },
  // Closed by a system administrator (the note says so): the owner cannot re-open it, only an administrator can.
  { id: "se-16", code: "SES-0016", workshopId: "ws-2", startsAt: at(9, 10), endsAt: at(9, 11.5), capacity: 12, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 240, notes: [{ type: "CLOSED", at: at(0, 7), by: "ADMIN", reason: { code: "OTHER", note: "Reported by guests: the venue is not safe." } }] },
  // Cloned from SES-0009.
  { id: "se-17", code: "SES-0017", workshopId: "ws-1", startsAt: at(10, 9), endsAt: at(10, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 1440, imageUrl: pic("pottery"), clonedFrom: { code: "SES-0009", workshopId: "ws-1" } },
  // Re-scheduled once already (it was moved from another day): its Re-schedule button is read-only.
  { id: "se-34", code: "SES-0034", workshopId: "ws-2", startsAt: at(12, 10), endsAt: at(12, 11.5), capacity: 10, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 120, notes: [{ type: "RESCHEDULED", at: at(-1, 10), reason: { code: "SCHEDULE_CHANGE" } }] },
  // Three sessions on one day, in three situations.
  // Closed 4 times by the owner (the last one for good), then opened again by a system administrator: Open, and the owner can never close it again.
  { id: "se-38", code: "SES-0038", workshopId: "ws-1", startsAt: at(14, 9), endsAt: at(14, 11), capacity: 8, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 120, notes: [
    { type: "CLOSED", at: at(-8, 9), reason: { code: "NOT_ENOUGH_GUESTS" } }, { type: "REOPENED", at: at(-7, 9) },
    { type: "CLOSED", at: at(-6, 9), reason: { code: "SCHEDULE_CHANGE" } }, { type: "REOPENED", at: at(-5, 9) },
    { type: "CLOSED", at: at(-4, 9), reason: { code: "VENUE_ISSUE" } }, { type: "REOPENED", at: at(-3, 9) },
    { type: "CLOSED", at: at(-2, 9), reason: { code: "NOT_ENOUGH_GUESTS" } }, { type: "REOPENED", at: at(-1, 9), by: "ADMIN" },
  ] },
  { id: "se-39", code: "SES-0039", workshopId: "ws-2", startsAt: at(14, 13), endsAt: at(14, 14.5), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },
  { id: "se-40", code: "SES-0040", workshopId: "ws-1", startsAt: at(14, 17), endsAt: at(14, 19), capacity: 8, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 120, notes: [{ type: "RESCHEDULED", at: at(-9, 15), reason: { code: "INSTRUCTOR_UNAVAILABLE" } }, { type: "RESCHEDULED", at: at(-5, 10), reason: { code: "SCHEDULE_CHANGE" } }, { type: "RESCHEDULED", at: at(-2, 15), reason: { code: "OTHER", note: "The studio is booked for a private event." } }] },
  // Cloned from SES-0034 (the clone is a new Open session).
  { id: "se-35", code: "SES-0035", workshopId: "ws-2", startsAt: at(20, 10), endsAt: at(20, 11.5), capacity: 10, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 120, clonedFrom: { code: "SES-0034", workshopId: "ws-2" } },
  // Far ahead: inside the 60 days of the default range, and beyond it (set the To date to see SES-0037).
  { id: "se-36", code: "SES-0036", workshopId: "ws-1", startsAt: at(45, 9), endsAt: at(45, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },
  { id: "se-37", code: "SES-0037", workshopId: "ws-2", startsAt: at(75, 14), endsAt: at(75, 15.5), capacity: 10, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 120 },

  // ---- PAST (the Sessions page shows them when From is set to an earlier day) ----
  // Left Running with every kind of booking: the system shows it as Closed, and the check-in list shows each status.
  { id: "se-32", code: "SES-0032", workshopId: "ws-2", startsAt: at(-1, 14), endsAt: at(-1, 15.5), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120, imageUrl: pic("past") },
  { id: "se-18", code: "SES-0018", workshopId: "ws-1", startsAt: at(-1, 9), endsAt: at(-1, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },
  // Closed by the owner before it started, with each kind of reason:
  { id: "se-19", code: "SES-0019", workshopId: "ws-1", startsAt: at(-2, 9), endsAt: at(-2, 11), capacity: 8, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "CLOSED", at: at(-3, 10), reason: { code: "NOT_ENOUGH_GUESTS" } }] },
  { id: "se-20", code: "SES-0020", workshopId: "ws-2", startsAt: at(-2, 14), endsAt: at(-2, 15.5), capacity: 10, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 60, notes: [{ type: "CLOSED", at: at(-4, 15), reason: { code: "INSTRUCTOR_UNAVAILABLE" } }] },
  { id: "se-21", code: "SES-0021", workshopId: "ws-1", startsAt: at(-3, 14), endsAt: at(-3, 16), capacity: 8, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "CLOSED", at: at(-5, 9), reason: { code: "OTHER", note: "The kiln needed an urgent repair." } }] },
  { id: "se-26", code: "SES-0026", workshopId: "ws-2", startsAt: at(-9, 10), endsAt: at(-9, 11.5), capacity: 10, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 180, notes: [{ type: "CLOSED", at: at(-11, 11), reason: { code: "SCHEDULE_CHANGE" } }] },
  { id: "se-43", code: "SES-0043", workshopId: "ws-1", startsAt: at(-12, 9), endsAt: at(-12, 11), capacity: 8, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120, notes: [{ type: "CLOSED", at: at(-14, 9), reason: { code: "VENUE_ISSUE" } }] },
  // Left Running, Paused or Open when their time was over: the system shows them as Closed automatically.
  { id: "se-22", code: "SES-0022", workshopId: "ws-2", startsAt: at(-4, 10), endsAt: at(-4, 11.5), capacity: 10, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 },
  { id: "se-33", code: "SES-0033", workshopId: "ws-1", startsAt: at(-3, 9), endsAt: at(-3, 11), capacity: 8, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 120, notes: [{ type: "RESCHEDULED", at: at(-6, 10), reason: { code: "INSTRUCTOR_UNAVAILABLE" } }] },
  { id: "se-23", code: "SES-0023", workshopId: "ws-1", startsAt: at(-5, 9), endsAt: at(-5, 11), capacity: 8, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 240 },
  { id: "se-24", code: "SES-0024", workshopId: "ws-2", startsAt: at(-6, 14), endsAt: at(-6, 15.5), capacity: 12, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 120 },
  { id: "se-25", code: "SES-0025", workshopId: "ws-1", startsAt: at(-7, 9), endsAt: at(-7, 11), capacity: 8, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 90 },
];

export const customers: Customer[] = [
  { id: "cu-1", fullName: "Emma Johnson", email: "emma@example.com", phone: "+44 7000 000000", preferredLocale: "en", account: { country: "GB", birthDate: "1990-04-12", avatarUrl: "https://picsum.photos/seed/avatar-emma/200/200", gender: "FEMALE", socials: { WHATSAPP: "+44 7000 000000", FACEBOOK: "emma.johnson.clay", INSTAGRAM: "@emma.makes" } } },
  { id: "cu-2", fullName: "Kim Min-jun", email: "minjun@example.com", preferredLocale: "ko" }, // booked without an account
  { id: "cu-3", fullName: "Walk-in guest", preferredLocale: "en" },
  { id: "cu-4", fullName: "Nguyen Thu", email: "thu@example.com", phone: "+84 90 123 4567", preferredLocale: "vi", account: { country: "VN", birthDate: "1995-09-30", avatarUrl: "https://picsum.photos/seed/avatar-thu/200/200", socials: { ZALO: "0901 234 567", TIKTOK: "@thu.clay" } } }, // no gender given
];

// The booking code is "<session code>-<3 digits>", counted per session in the order the demo bookings are listed.
const bookingsOfSession = new Map<string, number>();

/**
 * When a demo booking was made: 1 to 14 days before its session (a different time for each booking), and never later than a few hours ago, so the
 * customers list and the booking lists have bookings made on different days.
 */
function bookedAt(id: string, startsAt: string): string {
  const n = Number(id.replace(/\D/g, "")) || 1;
  const before = Date.parse(startsAt) - (1 + ((n * 7) % 14)) * DAY - (n % 7) * 3_600_000;
  return new Date(Math.min(before, Date.now() - (2 + (n % 20)) * 3_600_000)).toISOString();
}

function booking(p: Partial<Booking> & Pick<Booking, "id" | "sessionId" | "customerId" | "quantity">): Booking {
  const s = sessions.find((x) => x.id === p.sessionId)!;
  const n = (bookingsOfSession.get(s.id) ?? 0) + 1;
  bookingsOfSession.set(s.id, n);
  const w = workshops.find((x) => x.id === s.workshopId)!;
  return {
    workshopId: w.id, source: "ONLINE", status: "CONFIRMED", paymentStatus: "UNPAID", unitPriceAmount: w.priceAmount,
    totalAmount: w.priceAmount * p.quantity, currency: w.currency, workshopTitle: w.title.en ?? "", startsAt: s.startsAt,
    endsAt: s.endsAt, timezone: TZ, createdAt: bookedAt(p.id, s.startsAt), payments: [], ...p,
    bookingCode: `${s.code}-${String(n).padStart(3, "0")}`,
  };
}

export const bookings: Booking[] = [
  // Bookings that used promotions: 20% off 1,300,000; 150,000 + 15% + 5% off 1,950,000; 100,000 off 4,000,000; 5% off 1,200,000 (cancelled).
  booking({ id: "bk-1", sessionId: "se-1", customerId: "cu-1", quantity: 2, specialRequest: "Vegetarian snacks please",
    promotionIds: ["pr-1"], discountAmount: 260_000, totalAmount: 1_040_000 }),
  booking({ id: "bk-2", sessionId: "se-1", customerId: "cu-2", quantity: 3, status: "CHECKED_IN", checkedInAt: at(0, 9.1),
    promotionIds: ["pr-5", "pr-6", "pr-7"], discountAmount: 540_000, totalAmount: 1_410_000,
    paymentStatus: "PAID", payments: [{ id: "pm-1", type: "PAYMENT", amount: 1_410_000, method: "CASH", recordedAt: at(0, 9), recordedBy: "Linh Tran" }] }),
  booking({ id: "bk-3", sessionId: "se-2", customerId: "cu-4", quantity: 10, promotionIds: ["pr-2"], discountAmount: 100_000, totalAmount: 3_900_000 }),
  booking({ id: "bk-4", sessionId: "se-3", customerId: "cu-3", quantity: 2, source: "WALK_IN" }),
  booking({ id: "bk-5", sessionId: "se-5", customerId: "cu-1", quantity: 3, status: "CANCELLED", cancelReason: "Guest changed plans",
    promotionIds: ["pr-7"], discountAmount: 60_000, totalAmount: 1_140_000 }),
  // Upcoming sessions: these keep their promotions in use whatever the time of day.
  booking({ id: "bk-6", sessionId: "se-3", customerId: "cu-2", quantity: 2, promotionIds: ["pr-1"], discountAmount: 260_000, totalAmount: 1_040_000 }),
  booking({ id: "bk-7", sessionId: "se-5", customerId: "cu-3", quantity: 2, promotionIds: ["pr-2"], discountAmount: 100_000, totalAmount: 700_000 }),
  // A guest cancelled this booking of se-3: it no longer holds seats, and the check-in list shows why.
  booking({ id: "bk-11", sessionId: "se-3", customerId: "cu-4", quantity: 3, status: "CANCELLED", cancelReason: "Guest is ill" }),
  // Fills the sold-out session se-15.
  booking({ id: "bk-8", sessionId: "se-15", customerId: "cu-4", quantity: 6 }),
  // Two guests of the paused session se-11 (re-scheduling it emails the guest who has an email; the walk-in has none).
  booking({ id: "bk-9", sessionId: "se-11", customerId: "cu-1", quantity: 2 }),
  booking({ id: "bk-10", sessionId: "se-11", customerId: "cu-3", quantity: 1, source: "WALK_IN" }),
  // ---- More guests, for the sessions above ----
  // SES-0027 (taking place): one checked in and paid, two not yet.
  booking({ id: "bk-12", sessionId: "se-27", customerId: "cu-1", quantity: 2, status: "CHECKED_IN", checkedInAt: inMinutes(-25), paymentStatus: "PAID",
    payments: [{ id: "pm-2", type: "PAYMENT", amount: 1_300_000, method: "CARD", recordedAt: inMinutes(-25), recordedBy: "Linh Tran" }] }),
  booking({ id: "bk-13", sessionId: "se-27", customerId: "cu-2", quantity: 1 }),
  booking({ id: "bk-14", sessionId: "se-27", customerId: "cu-4", quantity: 2 }),
  // SES-0028 (paused, taking place), SES-0029 (inside its cut-off), SES-0031 (paused, not started).
  booking({ id: "bk-15", sessionId: "se-28", customerId: "cu-1", quantity: 1 }),
  booking({ id: "bk-16", sessionId: "se-29", customerId: "cu-2", quantity: 2 }),
  booking({ id: "bk-17", sessionId: "se-31", customerId: "cu-4", quantity: 1 }),
  booking({ id: "bk-18", sessionId: "se-31", customerId: "cu-1", quantity: 2 }),
  // SES-0032 (over): one booking in every status the check-in list can show. The confirmed ones become Session expired when the session ends.
  booking({ id: "bk-19", sessionId: "se-32", customerId: "cu-1", quantity: 2, status: "COMPLETED", checkedInAt: at(-1, 14.05), paymentStatus: "PAID",
    payments: [{ id: "pm-3", type: "PAYMENT", amount: 800_000, method: "CASH", recordedAt: at(-1, 15), recordedBy: "Linh Tran" }] }),
  booking({ id: "bk-20", sessionId: "se-32", customerId: "cu-2", quantity: 1, status: "NO_SHOW" }),
  booking({ id: "bk-21", sessionId: "se-32", customerId: "cu-4", quantity: 2, status: "CHECKED_IN", checkedInAt: at(-1, 14.1) }),
  booking({ id: "bk-22", sessionId: "se-32", customerId: "cu-3", quantity: 1, source: "WALK_IN" }),
  booking({ id: "bk-23", sessionId: "se-32", customerId: "cu-1", quantity: 1, status: "CANCELLED", cancelReason: "Schedule conflict" }),
  booking({ id: "bk-24", sessionId: "se-32", customerId: "cu-2", quantity: 1, status: "LATE_RELEASED" }),
  // SES-0033 (paused when its time was over) and SES-0034 / SES-0039 (to come).
  booking({ id: "bk-25", sessionId: "se-33", customerId: "cu-4", quantity: 2 }),
  booking({ id: "bk-26", sessionId: "se-34", customerId: "cu-2", quantity: 2 }),
  booking({ id: "bk-27", sessionId: "se-34", customerId: "cu-1", quantity: 1 }),
  booking({ id: "bk-28", sessionId: "se-39", customerId: "cu-4", quantity: 3 }),
  // A guest of the session taking place who was late: the booking was released, and the guest can still be checked in while there is room.
  booking({ id: "bk-29", sessionId: "se-27", customerId: "cu-3", quantity: 1, source: "WALK_IN", status: "LATE_RELEASED" }),
  // ---- Closed sessions: closing one emails every guest who booked it except the one who cancelled (the walk-in has no email) ----
  // SES-0012 (closed for good by the owner).
  booking({ id: "bk-30", sessionId: "se-12", customerId: "cu-1", quantity: 2 }),
  booking({ id: "bk-31", sessionId: "se-12", customerId: "cu-2", quantity: 1 }),
  booking({ id: "bk-32", sessionId: "se-12", customerId: "cu-4", quantity: 1, status: "CANCELLED", cancelReason: "The session was closed several times" }),
  // SES-0013 (closed, re-opened and closed again) and SES-0016 (closed by a system administrator).
  booking({ id: "bk-33", sessionId: "se-13", customerId: "cu-4", quantity: 2 }),
  booking({ id: "bk-34", sessionId: "se-13", customerId: "cu-3", quantity: 1, source: "WALK_IN" }),
  booking({ id: "bk-35", sessionId: "se-16", customerId: "cu-1", quantity: 2 }),
  booking({ id: "bk-36", sessionId: "se-16", customerId: "cu-2", quantity: 2 }),
  booking({ id: "bk-37", sessionId: "se-16", customerId: "cu-4", quantity: 1, status: "CANCELLED", cancelReason: "Guest changed plans" }),
  // SES-0038 (opened again by an administrator) and SES-0022 (left Running when its time was over: the system closed it).
  booking({ id: "bk-38", sessionId: "se-38", customerId: "cu-2", quantity: 1 }),
  booking({ id: "bk-39", sessionId: "se-22", customerId: "cu-1", quantity: 2 }),
  booking({ id: "bk-40", sessionId: "se-22", customerId: "cu-4", quantity: 1, status: "CANCELLED", cancelReason: "Could not come" }),
];

// What each demo booking has paid, so the Income page, the payment status of the bookings and the cancelled bookings agree. A guest who cancels
// is refunded (all or part of it), a no-show keeps the payment, a booking of a session that was closed keeps what it paid until the owner refunds
// it. Booking bk-2, bk-12 and bk-19 above already carry their payments.
{
  type Plan = { pay?: number | "FULL"; method: PaymentMethod; at: string; refund?: number | "ALL"; refundAt?: string };
  const plans: Record<string, Plan> = {
    "bk-1": { pay: "FULL", method: "CARD", at: at(-1, 12.5) },
    "bk-3": { pay: 1_000_000, method: "BANK_TRANSFER", at: at(-1, 13) }, // a deposit: partly paid
    "bk-5": { pay: "FULL", method: "BANK_TRANSFER", at: at(-2, 10), refund: "ALL", refundAt: at(-1, 9) }, // cancelled: refunded in full
    "bk-6": { pay: "FULL", method: "CARD", at: at(-1, 14) },
    "bk-7": { pay: 350_000, method: "E_WALLET", at: at(-1, 15) },
    "bk-8": { pay: "FULL", method: "CARD", at: at(-1, 16) },
    "bk-9": { pay: "FULL", method: "BANK_TRANSFER", at: at(-1, 12.2) },
    "bk-11": { pay: "FULL", method: "CARD", at: at(-2, 11), refund: 975_000, refundAt: at(-1, 10) }, // cancelled: half refunded
    "bk-20": { pay: "FULL", method: "CARD", at: at(-2, 9) }, // no-show: keeps the payment
    "bk-21": { pay: "FULL", method: "CASH", at: at(-1, 14.1) },
    "bk-23": { pay: "FULL", method: "CARD", at: at(-3, 11), refund: "ALL", refundAt: at(-1, 10) }, // paid last month, refunded this month
    "bk-30": { pay: "FULL", method: "BANK_TRANSFER", at: at(-4, 10) },
    "bk-32": { pay: "FULL", method: "E_WALLET", at: at(-4, 11), refund: "ALL", refundAt: at(0, 7) },
    "bk-33": { pay: "FULL", method: "CARD", at: at(-3, 9) },
    "bk-35": { pay: "FULL", method: "CARD", at: at(-2, 15) },
    "bk-36": { pay: "FULL", method: "BANK_TRANSFER", at: at(-2, 16) },
    "bk-37": { pay: "FULL", method: "CARD", at: at(-2, 17), refund: "ALL", refundAt: at(-1, 8) },
    "bk-39": { pay: "FULL", method: "CASH", at: at(-5, 12) },
    "bk-40": { pay: "FULL", method: "CARD", at: at(-5, 13), refund: "ALL", refundAt: at(-4, 9) },
  };
  for (const [id, plan] of Object.entries(plans)) {
    const b = bookings.find((x) => x.id === id)!;
    const entries: PaymentEntry[] = [];
    if (plan.pay) entries.push({ id: `pm-${id}-1`, type: "PAYMENT", amount: plan.pay === "FULL" ? b.totalAmount : plan.pay, method: plan.method, recordedAt: plan.at, recordedBy: "Linh Tran" });
    if (plan.refund) {
      const paid = entries[0]!.amount;
      entries.push({ id: `pm-${id}-2`, type: "REFUND", amount: plan.refund === "ALL" ? paid : plan.refund, method: plan.method, note: "Booking cancelled", recordedAt: plan.refundAt ?? plan.at, recordedBy: "Linh Tran" });
    }
    b.payments = entries;
    b.paymentStatus = computePaymentStatus(b.totalAmount, entries);
  }
  // A booking is made before it is paid: no booking is dated after its first payment.
  for (const b of bookings) {
    const first = b.payments.map((x) => x.recordedAt).sort()[0];
    if (first && b.createdAt > first) b.createdAt = new Date(Date.parse(first) - 30 * 60_000).toISOString();
  }
}

// The seats a session has taken come from its bookings (a cancelled booking holds none).
for (const session of sessions) session.reservedCount = reservedSeats(bookings, session.id);

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

// Default site of the current shop. The demo shop uses the Bento Grid layout (the most striking structure); the sample
// content below has enough photos, team members, reviews and FAQs to look good in all 10 layouts.
const MOCK_TEMPLATE: TemplateKey = "bento";

const photo = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const mockContent: PageContent = {
  schemaVersion: 1,
  seo: { title: { en: "Clay & Co Studio – Pottery workshops in Saigon", ja: "Clay & Co Studio – サイゴンの陶芸ワークショップ", zh: "Clay & Co Studio – 西贡陶艺工作坊" }, description: { en: "Hands-on pottery classes for travellers.", ja: "旅行者向けの陶芸体験クラス。", zh: "面向游客的陶艺体验课程。" } },
  sections: [
    { id: "s-hero", type: "hero", enabled: true, props: {
      title: { en: "Make something with your hands", vi: "Tự tay tạo nên điều đặc biệt", ko: "손으로 직접 만들어 보세요", ja: "自分の手で作ってみましょう", zh: "亲手创作属于你的作品" },
      subtitle: { en: "Pottery workshops in the heart of Saigon", vi: "Workshop làm gốm giữa lòng Sài Gòn", ja: "サイゴンの中心で陶芸体験", zh: "西贡市中心的陶艺工作坊" },
      imageUrl: photo("hero", 1600, 1000), ctaText: { en: "Book a workshop", vi: "Đặt chỗ", ko: "예약하기", ja: "予約する", zh: "立即预订" } } },
    { id: "s-about", type: "about", enabled: true, showBook: true, props: {
      heading: { en: "About us", vi: "Về chúng tôi", ja: "私たちについて", zh: "关于我们" },
      body: { en: "We are a small family studio. Every class is led by a local artisan, in small groups, with everything included.", vi: "Chúng tôi là xưởng gốm gia đình nhỏ. Mỗi lớp do một nghệ nhân địa phương hướng dẫn." },
      imageUrl: photo("about", 900, 700) } },
    { id: "s-team", type: "team", enabled: true, props: { heading: { en: "Meet the artisans" }, members: [
      { name: "Linh", role: { en: "Founder" }, bio: { en: "15 years of experience." }, imageUrl: photo("t1", 400, 400) },
      { name: "Minh", role: { en: "Glaze specialist" }, bio: { en: "Loves bold colours and speckled glazes." }, imageUrl: photo("t2", 400, 400) },
      { name: "An", role: { en: "Host" }, bio: { en: "Makes sure every guest leaves with a smile." }, imageUrl: photo("t3", 400, 400) },
    ] } },
    { id: "s-ws", type: "workshops", enabled: true, props: { heading: { en: "Our workshops", vi: "Các workshop", ja: "ワークショップ", zh: "我们的工作坊" } } },
    { id: "s-gal", type: "gallery", enabled: true, props: { heading: { en: "Gallery", vi: "Thư viện ảnh" }, imageUrls: [
      photo("g1", 700, 700), photo("g2", 700, 900), photo("g3", 800, 600), photo("g4", 700, 700),
      photo("g5", 900, 700), photo("g6", 700, 900), photo("g7", 700, 700), photo("g8", 800, 600),
    ] } },
    // Placeholder video ID for the mock; shops paste a YouTube link and only the ID is stored.
    { id: "s-video", type: "video", enabled: true, props: { heading: { en: "A day in the studio" }, caption: { en: "Watch how a bowl is made, from a lump of clay to the kiln." }, videos: ["dQw4w9WgXcQ", "9bZkp7q19f0", "jNQXAC9IVRw"] } },
    { id: "s-test", type: "testimonials", enabled: true, props: { heading: { en: "Guests say" }, items: [
      { name: "Emma", country: "GB", text: { en: "Best afternoon of our trip!" } },
      { name: "Min-jun", country: "KR", text: { en: "Patient teachers and a very relaxed atmosphere." } },
      { name: "Sofia", country: "ES", text: { en: "I made a bowl I actually use every day." } },
    ] } },
    { id: "s-faq", type: "faq", enabled: true, showBook: true, props: { heading: { en: "FAQ" }, items: [
      { q: { en: "What if I arrive late?" }, a: { en: "Please arrive on time; bookings may be released after 30 minutes." } },
      { q: { en: "Do I need experience?" }, a: { en: "No. Every class is designed for complete beginners." } },
      { q: { en: "Can I bring children?" }, a: { en: "Children from 8 years old are welcome with an adult." } },
    ] } },
    { id: "s-loc", type: "location", enabled: true, props: { heading: { en: "Find us" }, address: { en: "12 Nguyen Hue, District 1, HCMC" }, hours: { en: "Daily 9:00–18:00" }, mapsUrl: "https://maps.app.goo.gl/example" } },
    { id: "s-con", type: "contact", enabled: true, props: { heading: { en: "Contact" }, phone: "+84 90 000 0000", whatsapp: "+84 90 000 0000", email: "hello@clayco.example", socials: [
      { label: "Instagram", url: "https://instagram.com/clayco.example" },
    ] } },
    { id: "s-foot", type: "footer", enabled: true, props: { text: { en: "© Clay & Co Studio" }, socials: [{ label: "Instagram", url: "https://instagram.com/clayco.example" }] } },
  ],
};

/**
 * Landing pages the mock shop already has besides its main page (a second page with another template). They are only the
 * starting list: the shop owner can delete or add pages, and the list is then kept in the browser.
 */
export const mockLandingPages: { id: string; name: string; template: TemplateKey }[] = [
  { id: "p-summer", name: "Summer Pottery Promo", template: "magazine" },
];

export const defaultTheme: PageTheme = themeForTemplate(MOCK_TEMPLATE);

export const sitePage: { draft: PageContent; theme: PageTheme; template: TemplateKey } = {
  theme: defaultTheme,
  template: MOCK_TEMPLATE,
  // applyTemplate sets the layout and each section's variant / enabled flag / order from the template.
  draft: applyTemplate(mockContent, MOCK_TEMPLATE),
};

/**
 * Bookings of the five months before this one, as the Income page sees them: only their payments matter, so they are not in `bookings`. Each has a
 * booking code made from a session code (the sessions are past and not listed), a quantity of a workshop at its price, the vouchers used (the
 * discount comes off the price like the real promotions: fixed amounts and percentages of the price), the payment of what is left, and now and then
 * a refund (a cancelled booking is refunded in full, one in eleven in half). Deterministic: the 3rd to the 26th of each month at noon UTC.
 */
type HistoryPayment = { id: string; type: "PAYMENT" | "REFUND"; amount: number; recordedAt: string };
export const paymentHistory: { id: string; bookingCode: string; currency: string; price?: BookingPriceInfo; payments: HistoryPayment[] }[] = (() => {
  const now = new Date();
  const base = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const prices = [650_000, 400_000, 500_000]; // the three workshops
  // Vouchers of this shop (codes as in the promotions): fixed amounts, and percentages of the price. Only combinations the promotions allow.
  type Voucher = { id: string; discountType: "PERCENT" | "FIXED_AMOUNT"; discountValue: number; stacking: "SINGLE" | "MULTIPLE" };
  const VOUCHERS: Record<string, Voucher> = {
    EARLY20: { id: "EARLY20", discountType: "PERCENT", discountValue: 20, stacking: "SINGLE" },
    SPRING10: { id: "SPRING10", discountType: "PERCENT", discountValue: 10, stacking: "SINGLE" },
    MUG100: { id: "MUG100", discountType: "FIXED_AMOUNT", discountValue: 100_000, stacking: "SINGLE" },
    GROUP15: { id: "GROUP15", discountType: "PERCENT", discountValue: 15, stacking: "MULTIPLE" },
    NEWS5: { id: "NEWS5", discountType: "PERCENT", discountValue: 5, stacking: "MULTIPLE" },
    COUPLE150: { id: "COUPLE150", discountType: "FIXED_AMOUNT", discountValue: 150_000, stacking: "MULTIPLE" },
  };
  const combos: string[][] = [[], ["EARLY20"], [], ["SPRING10"], ["GROUP15", "NEWS5"], ["MUG100"], [], ["COUPLE150", "NEWS5"]];
  const out: { id: string; bookingCode: string; currency: string; price?: BookingPriceInfo; payments: HistoryPayment[] }[] = [];
  for (let back = 5; back >= 1; back--) {
    const idx = base - back;
    const count = 7 + ((5 - back) * 2) % 5 + (5 - back);
    for (let n = 0; n < count; n++) {
      const day = 3 + ((n * 7 + back * 3) % 24);
      const at = (d: number) => new Date(Date.UTC(Math.floor(idx / 12), idx % 12, d, 12)).toISOString();
      const price = prices[(n + back) % prices.length]!;
      const quantity = ((n * 5 + back) % 4) + 1;
      const combo = combos[(n * 3 + back) % combos.length]!;
      // Priced like a real booking: every voucher is worked out on the original price (see priceBooking).
      const priced = priceBooking({ unitPrice: price, quantity, promotions: combo.map((c) => VOUCHERS[c]!) });
      if (!priced.ok) throw new Error("the demo vouchers cannot be combined");
      const total = priced.total;
      const sessionNo = 100 + (5 - back) * 20 + Math.floor(n / 3); // SES-0100... : sessions of past months, three bookings each
      const payments: HistoryPayment[] = [{ id: `ph-${back}-${n}`, type: "PAYMENT", amount: total, recordedAt: at(day) }];
      if (n % 9 === 4) payments.push({ id: `ph-${back}-${n}-r`, type: "REFUND", amount: total, recordedAt: at(day + 2) }); // cancelled: refunded in full
      else if (n % 11 === 6) payments.push({ id: `ph-${back}-${n}-r`, type: "REFUND", amount: Math.round(total / 2 / 1000) * 1000, recordedAt: at(day + 2) });
      out.push({
        id: `bk-his-${back}-${n}`, bookingCode: `SES-${String(sessionNo).padStart(4, "0")}-${String((n % 3) + 1).padStart(3, "0")}`, currency: "VND",
        price: { subtotal: priced.subtotal, discounts: priced.discounts.map((d) => ({ code: d.id, amount: d.amount })) }, payments,
      });
    }
  }
  return out;
})();
/**
 * Bookings of the past year (one point per booking: session start, outcome, guests) so the overview chart has history. The
 * recent `bookings` above are added on top. Deterministic, never dated after yesterday; busier on weekends and slowly growing.
 */
export const bookingHistory: { startsAt: string; status: string; guests: number }[] = (() => {
  let seed = 20260101;
  const rand = () => { seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296; return seed / 4_294_967_296; };
  const out: { startsAt: string; status: string; guests: number }[] = [];
  for (let d = 364; d >= 1; d--) {
    const startsAt = at(-d, 9);
    const weekday = new Date(startsAt).getUTCDay(); // 0 = Sunday, 6 = Saturday
    const growth = 1 + (364 - d) / 364 * 1.5;
    const n = Math.floor(rand() * 2.2 + growth + (weekday === 0 || weekday === 6 ? 1.2 : 0));
    for (let i = 0; i < n; i++) {
      const r = rand();
      out.push({ startsAt: at(-d, i % 2 ? 14 : 9), status: r < 0.76 ? "COMPLETED" : r < 0.9 ? "CANCELLED" : "NO_SHOW", guests: 1 + Math.floor(rand() * 4) });
    }
  }
  return out;
})();
