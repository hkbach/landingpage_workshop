// Temporary mock data for UI development. Replaced by API calls (TanStack Query) once apps/api exists.
import type {
  AbuseReport, AuditEntry, Booking, Customer, PageContent, PageTheme, Session, Shop, Workshop,
} from "../types";
import type { FinanceEntry } from "@workshop/shared";
import { applyTemplate, themeForTemplate, type TemplateKey } from "@/components/sections/templates";

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
  { id: "se-1", workshopId: "ws-1", startsAt: at(0, 9), endsAt: at(0, 11), capacity: 8, reservedCount: 5, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-2", workshopId: "ws-2", startsAt: at(0, 14), endsAt: at(0, 15.5), capacity: 10, reservedCount: 10, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-3", workshopId: "ws-1", startsAt: at(1, 9), endsAt: at(1, 11), capacity: 8, reservedCount: 4, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-4", workshopId: "ws-1", startsAt: at(1, 14), endsAt: at(1, 16), capacity: 8, reservedCount: 0, status: "CLOSED", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-5", workshopId: "ws-2", startsAt: at(2, 10), endsAt: at(2, 11.5), capacity: 10, reservedCount: 2, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 180 },
  { id: "se-6", workshopId: "ws-1", startsAt: at(3, 9), endsAt: at(3, 11), capacity: 8, reservedCount: 0, status: "CANCELLED", hasRun: true, bookingCutoffMinutes: 120, cancelReason: "Instructor unavailable" },
  // More demo sessions, one of each situation of the Sessions page: new (Paused, never ran), Running without bookings (can be cancelled),
  // Paused after it ran, Closed, Cancelled and a sold-out Running session with a booking.
  { id: "se-7", workshopId: "ws-1", startsAt: at(4, 9), endsAt: at(4, 11), capacity: 8, reservedCount: 0, status: "PAUSED", hasRun: false, bookingCutoffMinutes: 60 },
  { id: "se-8", workshopId: "ws-2", startsAt: at(4, 14), endsAt: at(4, 15.5), capacity: 10, reservedCount: 0, status: "PAUSED", hasRun: false, bookingCutoffMinutes: 120 },
  { id: "se-9", workshopId: "ws-1", startsAt: at(5, 9), endsAt: at(5, 11), capacity: 8, reservedCount: 0, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 1440 },
  { id: "se-10", workshopId: "ws-2", startsAt: at(5, 10), endsAt: at(5, 11.5), capacity: 10, reservedCount: 0, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-11", workshopId: "ws-1", startsAt: at(6, 14), endsAt: at(6, 16), capacity: 8, reservedCount: 0, status: "PAUSED", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-12", workshopId: "ws-2", startsAt: at(6, 9), endsAt: at(6, 10.5), capacity: 10, reservedCount: 0, status: "CLOSED", hasRun: true, bookingCutoffMinutes: 120 },
  { id: "se-13", workshopId: "ws-1", startsAt: at(7, 9), endsAt: at(7, 11), capacity: 8, reservedCount: 0, status: "CANCELLED", hasRun: true, bookingCutoffMinutes: 120, cancelReason: "Studio maintenance" },
  { id: "se-14", workshopId: "ws-2", startsAt: at(7, 14), endsAt: at(7, 15.5), capacity: 10, reservedCount: 0, status: "CANCELLED", hasRun: true, bookingCutoffMinutes: 120, cancelReason: "Not enough guests" },
  { id: "se-15", workshopId: "ws-1", startsAt: at(8, 10), endsAt: at(8, 12), capacity: 6, reservedCount: 6, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 30 },
  { id: "se-16", workshopId: "ws-2", startsAt: at(9, 10), endsAt: at(9, 11.5), capacity: 12, reservedCount: 0, status: "PAUSED", hasRun: false, bookingCutoffMinutes: 240 },
  { id: "se-17", workshopId: "ws-1", startsAt: at(10, 9), endsAt: at(10, 11), capacity: 8, reservedCount: 0, status: "RUNNING", hasRun: true, bookingCutoffMinutes: 120 },
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
  // Bookings that used promotions: 20% off 1,300,000; 150,000 + 15% + 5% off 1,950,000; 100,000 off 4,000,000; 5% off 1,200,000 (cancelled).
  booking({ id: "bk-1", bookingCode: "7K3M9QX2", sessionId: "se-1", customerId: "cu-1", quantity: 2, specialRequest: "Vegetarian snacks please",
    promotionIds: ["pr-1"], discountAmount: 260_000, totalAmount: 1_040_000 }),
  booking({ id: "bk-2", bookingCode: "A8D4N6TP", sessionId: "se-1", customerId: "cu-2", quantity: 3, status: "CHECKED_IN",
    promotionIds: ["pr-5", "pr-6", "pr-7"], discountAmount: 540_000, totalAmount: 1_410_000,
    paymentStatus: "PAID", payments: [{ id: "pm-1", type: "PAYMENT", amount: 1_410_000, method: "CASH", recordedAt: at(0, 9), recordedBy: "Linh Tran" }] }),
  booking({ id: "bk-3", bookingCode: "C2F7R5WZ", sessionId: "se-2", customerId: "cu-4", quantity: 10, promotionIds: ["pr-2"], discountAmount: 100_000, totalAmount: 3_900_000 }),
  booking({ id: "bk-4", bookingCode: "E9H1J3KB", sessionId: "se-3", customerId: "cu-3", quantity: 2, source: "WALK_IN" }),
  booking({ id: "bk-5", bookingCode: "G4M8P2VS", sessionId: "se-5", customerId: "cu-1", quantity: 3, status: "CANCELLED", cancelReason: "Guest changed plans",
    promotionIds: ["pr-7"], discountAmount: 60_000, totalAmount: 1_140_000 }),
  // Upcoming sessions: these keep their promotions in use whatever the time of day.
  booking({ id: "bk-6", bookingCode: "K5N2Q8RD", sessionId: "se-3", customerId: "cu-2", quantity: 2, promotionIds: ["pr-1"], discountAmount: 260_000, totalAmount: 1_040_000 }),
  booking({ id: "bk-7", bookingCode: "M7P3T9XB", sessionId: "se-5", customerId: "cu-3", quantity: 2, promotionIds: ["pr-2"], discountAmount: 100_000, totalAmount: 700_000 }),
  // Fills the sold-out session se-15.
  booking({ id: "bk-8", bookingCode: "N4Q8V2ZC", sessionId: "se-15", customerId: "cu-4", quantity: 6 }),
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
 * Income and expenses the shop owner entered by hand over the last six months (the starting list; income from bookings is derived
 * from the payment entries). Dates are business dates stored at 12:00 UTC, never after today.
 */
export const mockFinanceEntries: FinanceEntry[] = (() => {
  const now = new Date();
  const base = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const rows: [type: "INCOME" | "EXPENSE", category: FinanceEntry["category"], day: number, amounts: number[], note: string][] = [
    ["EXPENSE", "RENT", 5, [12_000_000, 12_000_000, 12_000_000, 12_000_000, 12_000_000, 12_000_000], "Studio rent"],
    ["EXPENSE", "SALARY", 28, [18_000_000, 18_000_000, 19_500_000, 19_500_000, 19_500_000, 21_000_000], "Instructor and assistant salaries"],
    ["EXPENSE", "MATERIALS", 12, [4_200_000, 3_600_000, 5_100_000, 4_800_000, 6_300_000, 5_400_000], "Clay, glaze and tools"],
    ["EXPENSE", "MARKETING", 15, [1_500_000, 2_500_000, 1_500_000, 3_000_000, 2_000_000, 2_800_000], "Social ads"],
    ["EXPENSE", "UTILITIES", 20, [1_900_000, 1_700_000, 1_800_000, 2_100_000, 2_300_000, 2_000_000], "Electricity, water, internet"],
    ["INCOME", "SALES", 18, [33_000_000, 36_500_000, 41_000_000, 44_500_000, 52_000_000, 48_000_000], "Workshop sales (walk-in, cash)"],
    ["INCOME", "OTHER_INCOME", 22, [0, 0, 2_500_000, 0, 3_200_000, 0], "Private event deposit"],
  ];
  const out: FinanceEntry[] = [{ id: "fe-equip", type: "EXPENSE", category: "EQUIPMENT", amount: 14_500_000, currency: "VND", occurredAt: "", note: "New kiln", source: "MANUAL" }];
  rows.forEach(([type, category, day, amounts, note], r) => {
    amounts.forEach((amount, i) => {
      if (!amount) return;
      const idx = base - (amounts.length - 1 - i);
      const isCurrent = i === amounts.length - 1;
      const d = isCurrent ? Math.min(day, now.getUTCDate()) : day;
      const date = new Date(Date.UTC(Math.floor(idx / 12), idx % 12, d, 12));
      out.push({ id: `fe-${r}-${i}`, type, category, amount, currency: "VND", occurredAt: date.toISOString(), note, source: "MANUAL" });
    });
  });
  const equip = out[0]!;
  equip.occurredAt = new Date(Date.UTC(Math.floor((base - 3) / 12), (base - 3) % 12, 9, 12)).toISOString();
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
