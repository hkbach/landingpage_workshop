// Mock data of two more ACTIVE shops, so the Workshops page of the guest area (/customer/{id}/workshops) has workshops of several shops to show. Their workshops and
// sessions are kept apart from the ones of the demo shop (data.ts), which the shop owner screens, the bookings and their tests are built on: this is data for looking at the
// UI. TODO(api): replaced by the real workshops of every shop (organization_id).
import type { Localized, WorkshopCategory } from "@workshop/shared";
import { applyTemplate, themeForTemplate, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme, Session, Shop, Workshop } from "../types";

const DAY = 86_400_000;

/** ISO UTC for `daysFromNow` at the given local hour of a zone that is `offsetHours` ahead of UTC. */
function localAt(offsetHours: number) {
  return (daysFromNow: number, hourLocal: number): string => {
    const d = new Date();
    const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + daysFromNow * DAY;
    return new Date(base + (hourLocal - offsetHours) * 3_600_000).toISOString();
  };
}
const photo = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export interface OtherShopSite {
  theme: PageTheme; content: PageContent; workshops: Workshop[]; sessions: Session[];
}

interface PageInfo {
  template: TemplateKey; seed: string; title: Localized; subtitle: Localized; about: Localized; seoTitle: Localized; seoDescription: Localized; hours: string;
}

/** A simple landing page (hero, about, workshops, location, contact, footer) in the template of the shop. */
function landing(shop: Shop, info: PageInfo): { content: PageContent; theme: PageTheme } {
  const raw: PageContent = {
    schemaVersion: 1,
    seo: { title: info.seoTitle, description: info.seoDescription },
    sections: [
      { id: "s-hero", type: "hero", enabled: true, props: { title: info.title, subtitle: info.subtitle, imageUrl: photo(`${info.seed}-hero`, 1600, 1000), ctaText: { en: "Book a workshop", vi: "Đặt chỗ", ko: "예약하기", ja: "予約する", zh: "立即预订" } } },
      { id: "s-about", type: "about", enabled: true, showBook: true, props: { heading: { en: "About us", vi: "Về chúng tôi", ja: "私たちについて", zh: "关于我们" }, body: info.about, imageUrl: photo(`${info.seed}-about`, 900, 700) } },
      { id: "s-ws", type: "workshops", enabled: true, props: { heading: { en: "Our workshops", vi: "Các workshop", ja: "ワークショップ", zh: "我们的工作坊" } } },
      { id: "s-loc", type: "location", enabled: true, props: { heading: { en: "Find us" }, address: { en: shop.address }, hours: { en: info.hours }, mapsUrl: shop.mapsUrl } },
      { id: "s-con", type: "contact", enabled: true, props: { heading: { en: "Contact" }, phone: shop.contactPhone, whatsapp: "", email: shop.contactEmail, socials: [{ label: "Instagram", url: `https://instagram.com/${shop.slug}.example` }] } },
      { id: "s-foot", type: "footer", enabled: true, props: { text: { en: `© ${shop.name}` }, socials: [] } },
    ],
  };
  return { content: applyTemplate(raw, info.template), theme: themeForTemplate(info.template) };
}

/** A workshop with the common fields filled in. */
function workshop(w: Pick<Workshop, "id" | "title" | "shortDescription" | "durationMinutes" | "priceAmount" | "currency" | "defaultCapacity" | "maxPerBooking" | "status" | "sortOrder"> & Partial<Workshop>, seed: string, createdDaysAgo: number, categories: WorkshopCategory[], rating?: Workshop["rating"]): Workshop {
  return {
    description: { en: "A hands-on class led by our team, in a small group, with everything included." }, includes: { en: ["All ingredients", "Recipe card", "A tasting"] }, notes: {},
    coverUrl: photo(seed, 1200, 800), galleryUrls: [photo(`${seed}-1`, 800, 600)], createdAt: new Date(Date.now() - createdDaysAgo * DAY).toISOString(), categories, ...(rating ? { rating } : {}), ...w,
  };
}

/** A session of one of the workshops: it lasts as long as its workshop. */
function sessionOf(list: readonly Workshop[], s: Pick<Session, "id" | "code" | "workshopId" | "capacity" | "reservedCount" | "status" | "bookingCutoffMinutes"> & Partial<Session>, startsAt: string): Session {
  const w = list.find((x) => x.id === s.workshopId)!;
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + w.durationMinutes * 60_000).toISOString(), ...s };
}

// ---- Brew & Bean Coffee Lab (Ho Chi Minh City, VND) ---------------------------------------------------------------------------------------------------------

const brewbean: Shop = {
  id: "org-4", name: "Brew & Bean Coffee Lab", slug: "brewbean", status: "ACTIVE", country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND",
  defaultLocale: "en", enabledLocales: ["en", "vi", "ko"], contactEmail: "hello@brewbean.example", contactPhone: "+84 28 3000 4444", address: "27 Dong Khoi, District 1, Ho Chi Minh City",
  mapsUrl: "https://maps.app.goo.gl/example4", plan: "PRO", ownerName: "Hoang Le", ownerEmail: "hoang@brewbean.example", createdAt: new Date(Date.now() - 45 * DAY).toISOString(), showOnCustomerPage: true,
};
const brewWorkshops: Workshop[] = [
  workshop({
    id: "ws-b1", title: { en: "Latte Art Basics", vi: "Latte art cơ bản", ko: "라떼 아트 기초" }, shortDescription: { en: "Pour your first rosetta and heart.", vi: "Rót hình trái tim và lá đầu tiên của bạn.", ko: "첫 로제타와 하트를 부어 보세요." },
    durationMinutes: 90, priceAmount: 450_000, currency: "VND", defaultCapacity: 6, maxPerBooking: 4, status: "ACTIVE", sortOrder: 1,
  }, "latte", 44, ["COFFEE_TEA", "DRINKS"], { average: 4.7, count: 63 }),
  workshop({
    id: "ws-b2", title: { en: "Home Barista Essentials", vi: "Barista tại nhà" }, shortDescription: { en: "Espresso, milk and brewing methods you can repeat at home." },
    durationMinutes: 150, priceAmount: 800_000, currency: "VND", defaultCapacity: 8, maxPerBooking: 4, status: "ACTIVE", sortOrder: 2,
  }, "barista", 40, ["COFFEE_TEA"], { average: 4.4, count: 41 }),
  workshop({
    id: "ws-b3", address: "The Roastery, 41 Nguyen Van Troi, Phu Nhuan District, Ho Chi Minh City", addressNote: "Look for the red brick building; the roastery is at the back.", title: { en: "Cold Brew & Cupping", vi: "Cold brew và thử vị cà phê", ko: "콜드브루와 커핑" }, shortDescription: { en: "Taste five origins side by side and brew a cold brew to take home." },
    durationMinutes: 120, priceAmount: 550_000, currency: "VND", defaultCapacity: 10, maxPerBooking: 6, status: "ACTIVE", sortOrder: 3,
  }, "coldbrew", 30, ["COFFEE_TEA", "DRINKS"], { average: 4.6, count: 28 }),
  workshop({
    id: "ws-b4", title: { en: "Coffee Roasting Day" }, shortDescription: { en: "Roast a batch of beans from green to cup." }, description: { en: "Draft." },
    durationMinutes: 180, priceAmount: 950_000, currency: "VND", defaultCapacity: 6, maxPerBooking: 3, status: "DRAFT", sortOrder: 4,
  }, "roasting", 5, ["COFFEE_TEA", "COOKING"]),
];
const brewAt = localAt(7);
const brewSessions: Session[] = [
  sessionOf(brewWorkshops, { id: "se-b1", code: "SES-0201", workshopId: "ws-b1", capacity: 6, reservedCount: 2, status: "RUNNING", bookingCutoffMinutes: 120, imageUrl: photo("session-latte", 400, 300) }, brewAt(1, 10)),
  sessionOf(brewWorkshops, { id: "se-b2", code: "SES-0202", workshopId: "ws-b1", capacity: 6, reservedCount: 6, status: "RUNNING", bookingCutoffMinutes: 120 }, brewAt(3, 15)), // sold out
  sessionOf(brewWorkshops, { id: "se-b3", code: "SES-0203", workshopId: "ws-b2", capacity: 8, reservedCount: 3, status: "RUNNING", bookingCutoffMinutes: 240 }, brewAt(2, 9)),
  sessionOf(brewWorkshops, { id: "se-b4", code: "SES-0204", workshopId: "ws-b2", capacity: 8, reservedCount: 0, status: "PAUSED", bookingCutoffMinutes: 120 }, brewAt(6, 9)),
  sessionOf(brewWorkshops, { id: "se-b5", code: "SES-0205", workshopId: "ws-b3", capacity: 10, reservedCount: 4, status: "RUNNING", bookingCutoffMinutes: 60, imageUrl: photo("session-cupping", 400, 300) }, brewAt(4, 14)),
  sessionOf(brewWorkshops, { id: "se-b6", code: "SES-0206", workshopId: "ws-b3", capacity: 10, reservedCount: 1, status: "RUNNING", bookingCutoffMinutes: 1440 }, brewAt(8, 14)),
  sessionOf(brewWorkshops, { id: "se-b7", code: "SES-0207", workshopId: "ws-b1", capacity: 6, reservedCount: 0, status: "OPEN", bookingCutoffMinutes: 120 }, brewAt(10, 10)),
];

// ---- Green Table Vegan Kitchen (Singapore, USD: amounts in cents) ----------------------------------------------------------------------------------------------

const greentable: Shop = {
  id: "org-5", name: "Green Table Vegan Kitchen", slug: "greentable", status: "ACTIVE", country: "SG", timezone: "Asia/Singapore", currency: "USD",
  defaultLocale: "en", enabledLocales: ["en", "ja", "zh"], contactEmail: "hello@greentable.example", contactPhone: "+65 6000 5555", address: "18 Tiong Bahru Road, Singapore",
  mapsUrl: "https://maps.app.goo.gl/example5", plan: "FREE", ownerName: "Mei Tan", ownerEmail: "mei@greentable.example", createdAt: new Date(Date.now() - 70 * DAY).toISOString(), showOnCustomerPage: true,
};
const greenWorkshops: Workshop[] = [
  workshop({
    id: "ws-g1", title: { en: "Plant-based Ramen", ja: "ヴィーガンラーメン", zh: "纯素拉面" }, shortDescription: { en: "Build a rich broth and hand-pull noodles without any animal products.", ja: "動物性食材を使わず、濃厚なスープと手打ち麺を作ります。", zh: "不使用任何动物性食材，制作浓郁汤底和手工面条。" },
    durationMinutes: 150, priceAmount: 6_500, currency: "USD", defaultCapacity: 8, maxPerBooking: 4, status: "ACTIVE", sortOrder: 1,
  }, "ramen", 68, ["COOKING"], { average: 4.9, count: 92 }),
  workshop({
    id: "ws-g2", address: "Community Kitchen, 5 Eng Hoon Street, Singapore", addressNote: "Take the lift to level 2.", title: { en: "Vegan Dumplings Night", ja: "ヴィーガン餃子ナイト", zh: "纯素饺子之夜" }, shortDescription: { en: "Fold and pan-fry three kinds of dumplings, then share the table." },
    durationMinutes: 120, priceAmount: 4_800, currency: "USD", defaultCapacity: 12, maxPerBooking: 6, status: "ACTIVE", sortOrder: 2,
  }, "dumplings", 60, ["COOKING", "WELLNESS"], { average: 3.8, count: 35 }),
  workshop({
    id: "ws-g3", title: { en: "Fermentation 101: Kimchi & Miso", ja: "発酵入門：キムチと味噌", zh: "发酵入门：泡菜与味噌" }, shortDescription: { en: "Start a jar of kimchi and a batch of miso to take home.", zh: "制作一罐泡菜和一份味噌带回家。" },
    durationMinutes: 180, priceAmount: 7_200, currency: "USD", defaultCapacity: 6, maxPerBooking: 3, status: "ACTIVE", sortOrder: 3,
  }, "ferment", 50, ["WELLNESS", "COOKING"]),
  workshop({
    id: "ws-g4", title: { en: "Dessert Without Dairy" }, shortDescription: { en: "Creamy desserts made with nuts, oats and coconut." }, description: { en: "Draft." },
    durationMinutes: 120, priceAmount: 5_500, currency: "USD", defaultCapacity: 8, maxPerBooking: 4, status: "DRAFT", sortOrder: 4,
  }, "dessert", 4, ["BAKING"]),
];
const greenAt = localAt(8);
const greenSessions: Session[] = [
  sessionOf(greenWorkshops, { id: "se-g1", code: "SES-0301", workshopId: "ws-g1", capacity: 8, reservedCount: 5, status: "RUNNING", bookingCutoffMinutes: 120, imageUrl: photo("session-ramen", 400, 300) }, greenAt(1, 18.5)),
  sessionOf(greenWorkshops, { id: "se-g2", code: "SES-0302", workshopId: "ws-g1", capacity: 8, reservedCount: 8, status: "RUNNING", bookingCutoffMinutes: 120 }, greenAt(5, 18.5)), // sold out
  sessionOf(greenWorkshops, { id: "se-g3", code: "SES-0303", workshopId: "ws-g2", capacity: 12, reservedCount: 7, status: "RUNNING", bookingCutoffMinutes: 180 }, greenAt(2, 19)),
  sessionOf(greenWorkshops, { id: "se-g4", code: "SES-0304", workshopId: "ws-g2", capacity: 12, reservedCount: 0, status: "RUNNING", bookingCutoffMinutes: 120 }, greenAt(7, 19)),
  sessionOf(greenWorkshops, { id: "se-g5", code: "SES-0305", workshopId: "ws-g3", capacity: 6, reservedCount: 2, status: "RUNNING", bookingCutoffMinutes: 720, imageUrl: photo("session-ferment", 400, 300) }, greenAt(3, 10)),
  sessionOf(greenWorkshops, {
    id: "se-g6", code: "SES-0306", workshopId: "ws-g3", capacity: 6, reservedCount: 0, status: "CLOSED", bookingCutoffMinutes: 120,
    notes: [{ type: "CLOSED", at: greenAt(-1, 9), reason: { code: "NOT_ENOUGH_GUESTS" } }],
  }, greenAt(9, 10)),
];

/** The shops that are not the demo shop. */
export const otherShops: Shop[] = [brewbean, greentable];

/** What the landing page and the Workshops page of each of them show (the demo shop's is in data.ts). */
export const otherShopSites: Record<string, OtherShopSite> = {
  [brewbean.id]: {
    ...landing(brewbean, {
      template: "magazine", seed: "brewbean", title: { en: "Coffee, explained by people who roast it", vi: "Cà phê, được giải thích bởi người rang nó", ko: "직접 로스팅하는 사람들이 알려주는 커피" },
      subtitle: { en: "Barista and tasting workshops in the heart of Saigon", vi: "Workshop barista và thử vị giữa lòng Sài Gòn", ko: "사이공 중심에서 만나는 바리스타·커핑 워크숍" },
      about: { en: "We are a small coffee lab. Every class is led by a barista who works behind our bar, in groups of up to ten.", vi: "Chúng tôi là một phòng thí nghiệm cà phê nhỏ. Mỗi lớp do một barista của quán hướng dẫn, tối đa mười người." },
      seoTitle: { en: "Brew & Bean Coffee Lab – Coffee workshops in Saigon" }, seoDescription: { en: "Latte art, home barista and cupping classes." }, hours: "Daily 8:00–20:00",
    }),
    workshops: brewWorkshops, sessions: brewSessions,
  },
  [greentable.id]: {
    ...landing(greentable, {
      template: "journey", seed: "greentable", title: { en: "Cook plant-based food you will want to repeat", ja: "また作りたくなるヴィーガン料理を", zh: "做出让你想一再重复的纯素料理" },
      subtitle: { en: "Vegan cooking classes in Tiong Bahru, Singapore", ja: "シンガポール・ティオンバルのヴィーガン料理教室", zh: "新加坡中峇鲁的纯素烹饪课程" },
      about: { en: "A neighbourhood kitchen that teaches vegan cooking, one dish at a time. Small groups, real recipes, and a shared table at the end.", zh: "一间社区厨房，一道菜一道菜地教授纯素烹饪。小班教学、真实食谱，课后一起享用。" },
      seoTitle: { en: "Green Table Vegan Kitchen – Vegan cooking classes in Singapore" }, seoDescription: { en: "Ramen, dumplings and fermentation classes." }, hours: "Tue–Sun 10:00–21:00",
    }),
    workshops: greenWorkshops, sessions: greenSessions,
  },
};
