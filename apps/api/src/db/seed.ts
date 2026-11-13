import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "../auth/crypto";
import { addDays, dateIn, ruleStarts } from "../common/zoned-time";
import { newCode } from "../affiliate/codes";
import { AuditService } from "../audit/audit.service";
import { loadDotEnv } from "../config/env";
import { FinanceService } from "../finance/finance.service";
import type { Database, Executor } from "./db.module";
import * as schema from "./schema";

// Demo data for development (REQUIREMENTS 11.2). `pnpm db:seed` makes: one platform administrator, three shops (ACTIVE with a full history, DRAFT, SUSPENDED), their owners, customers,
// workshops, weekly schedules, about two months of sessions (past and coming) and the bookings and payments of them, in every state. Everything is relative to today, so the data always
// looks current, and it is made by a small deterministic generator, so two runs on empty databases give the same shape.
//
// The password of every demo account is NOT in the code. Set SEED_PASSWORD to choose it, or leave it unset: the seed then makes a random one and writes it to apps/api/.seed-credentials
// (a file that git ignores), without printing it. The seed can be run again: a shop that exists is left as it is.
export const DEMO_ACCOUNTS = {
  admin: "admin@workshopkit.example",
  activeOwner: "linh@whiskladle.example",
  draftOwner: "ava@sugarsift.example",
  suspendedOwner: "minh@goldennoodle.example",
  customer: "emma@example.com",
} as const;

export interface SeedResult { created: string[]; existing: string[]; sessions: number; bookings: number; payments: number }

/** A small deterministic generator (same seed, same numbers). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x1_0000_0000; };
}

const GUESTS = [
  { name: "Emma Wilson", email: "emma@example.com", country: "GB", phone: "+44 7700 900101" },
  { name: "Minh Tran", email: "minh.tran@example.com", country: "VN", phone: "+84 90 100 2001" },
  { name: "Yuki Tanaka", email: "yuki.tanaka@example.com", country: "JP", phone: "+81 90 1234 5678" },
  { name: "Jisoo Kim", email: "jisoo.kim@example.com", country: "KR", phone: "+82 10 2345 6789" },
  { name: "Li Wei", email: "li.wei@example.com", country: "CN", phone: "+86 138 0013 8000" },
  { name: "Sophie Martin", email: "sophie.martin@example.com", country: "FR", phone: "+33 6 12 34 56 78" },
  { name: "Noah Brown", email: "noah.brown@example.com", country: "US", phone: "+1 415 555 0132" },
  { name: "Linh Pham", email: "linh.pham@example.com", country: "VN", phone: "+84 91 300 4002" },
  { name: "Anna Schmidt", email: "anna.schmidt@example.com", country: "DE", phone: "+49 151 2345 6789" },
  { name: "Carlos Diaz", email: "carlos.diaz@example.com", country: "ES", phone: "+34 612 345 678" },
  { name: "Hana Park", email: "hana.park@example.com", country: "KR", phone: "+82 10 3456 7890" },
  { name: "Tuan Nguyen", email: "tuan.nguyen@example.com", country: "VN", phone: "+84 93 400 5003" },
  { name: "Olivia Jones", email: "olivia.jones@example.com", country: "AU", phone: "+61 412 345 678" },
  { name: "Kenji Sato", email: "kenji.sato@example.com", country: "JP", phone: "+81 80 9876 5432" },
] as const;

interface WorkshopSeed {
  key: string; title: { en: string; vi: string }; short: { en: string; vi: string }; description: { en: string; vi: string }; includes: { en: string[]; vi: string[] };
  durationMinutes: number; price: number; capacity: number; maxPerBooking: number; categories: string[]; status: "ACTIVE" | "DRAFT";
  rule?: { weekdays: number[]; times: string[] };
}

const WHISK_WORKSHOPS: WorkshopSeed[] = [
  {
    key: "street-food", title: { en: "Vietnamese Street Food Cooking Class", vi: "Lớp nấu món đường phố Việt Nam" }, short: { en: "Cook three iconic street dishes with a local chef.", vi: "Nấu ba món đường phố nổi tiếng cùng đầu bếp bản địa." },
    description: { en: "Start at the market, then cook banh xeo, fresh spring rolls and a rich beef noodle soup in a small group.", vi: "Bắt đầu từ chợ, rồi nấu bánh xèo, gỏi cuốn và một tô phở bò đậm vị trong nhóm nhỏ." },
    includes: { en: ["Market tour", "All ingredients", "Recipe booklet", "Lunch"], vi: ["Đi chợ cùng đầu bếp", "Toàn bộ nguyên liệu", "Sổ công thức", "Bữa trưa"] },
    durationMinutes: 180, price: 850_000, capacity: 10, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", rule: { weekdays: [6, 0], times: ["09:00", "14:00"] },
  },
  {
    key: "pho", title: { en: "Pho From Scratch", vi: "Phở nấu từ đầu" }, short: { en: "Simmer a clear, fragrant broth and slice the perfect bowl.", vi: "Ninh nước dùng trong và thơm, thái và bày một tô phở hoàn hảo." },
    description: { en: "Learn the spices, the charring of aromatics and the patience behind a great pho.", vi: "Học về gia vị, cách nướng hành gừng và sự kiên nhẫn làm nên tô phở ngon." },
    includes: { en: ["Ingredients", "Apron", "Take-home broth"], vi: ["Nguyên liệu", "Tạp dề", "Nước dùng mang về"] },
    durationMinutes: 150, price: 700_000, capacity: 8, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", rule: { weekdays: [2, 4], times: ["18:30"] },
  },
  {
    key: "sourdough", title: { en: "Sourdough Bread Basics", vi: "Làm bánh mì sourdough cơ bản" }, short: { en: "Shape, proof and bake your own loaf.", vi: "Tạo hình, ủ và nướng ổ bánh của riêng bạn." },
    description: { en: "A hands-on introduction to wild yeast, folding and scoring. You take home a loaf and a starter.", vi: "Buổi học thực hành về men tự nhiên, gấp bột và rạch bánh. Bạn mang về một ổ bánh và men mẹ." },
    includes: { en: ["Starter to take home", "One loaf", "Tea and snacks"], vi: ["Men mẹ mang về", "Một ổ bánh", "Trà và đồ ăn nhẹ"] },
    durationMinutes: 210, price: 950_000, capacity: 8, maxPerBooking: 3, categories: ["BAKING"], status: "ACTIVE", rule: { weekdays: [5], times: ["10:00"] },
  },
  {
    key: "coffee", title: { en: "Coffee Cupping Lab", vi: "Phòng thí nghiệm cà phê" }, short: { en: "Taste, compare and learn to describe coffee.", vi: "Nếm, so sánh và học cách mô tả cà phê." },
    description: { en: "A relaxed cupping of five Vietnamese single origins. Coming soon.", vi: "Buổi cupping năm loại cà phê đơn nguồn Việt Nam. Sắp ra mắt." },
    includes: { en: ["Five coffees", "Tasting notes"], vi: ["Năm loại cà phê", "Phiếu nếm thử"] },
    durationMinutes: 90, price: 450_000, capacity: 12, maxPerBooking: 4, categories: ["COFFEE_TEA"], status: "DRAFT",
  },
];

const SUGAR_WORKSHOPS: WorkshopSeed[] = [
  {
    key: "macarons", title: { en: "French Macarons Workshop", vi: "Workshop macaron kiểu Pháp" }, short: { en: "Pipe, bake and fill your own macarons.", vi: "Tự bóp, nướng và kẹp nhân macaron." },
    description: { en: "Opening soon.", vi: "Sắp khai trương." }, includes: { en: ["Ingredients"], vi: ["Nguyên liệu"] },
    durationMinutes: 150, price: 800_000, capacity: 8, maxPerBooking: 4, categories: ["BAKING"], status: "DRAFT",
  },
];

const NOODLE_WORKSHOPS: WorkshopSeed[] = [
  {
    key: "noodles", title: { en: "Hand-Pulled Noodles", vi: "Mì kéo tay" }, short: { en: "Knead, rest and pull noodles by hand.", vi: "Nhào, ủ và kéo mì bằng tay." },
    description: { en: "A noodle class from a family kitchen.", vi: "Lớp làm mì từ một căn bếp gia đình." }, includes: { en: ["Ingredients", "Lunch"], vi: ["Nguyên liệu", "Bữa trưa"] },
    durationMinutes: 120, price: 600_000, capacity: 10, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", rule: { weekdays: [3], times: ["17:00"] },
  },
];

const img = (key: string, n = 0): string => `https://picsum.photos/seed/${key}-${n}/960/640`;

/** The demo data. `now` is a parameter so the data can be made for any day. */
export async function seed(db: Executor, password: string, now: Date = new Date()): Promise<SeedResult> {
  const passwordHash = await hashPassword(password);
  const result: SeedResult = { created: [], existing: [], sessions: 0, bookings: 0, payments: 0 };
  const rand = rng(20260101);

  async function user(email: string, fullName: string, platformRole: "SUPER_ADMIN" | null = null): Promise<{ id: string; isNew: boolean }> {
    const [found] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (found) { result.existing.push(email); return { id: found.id, isNew: false }; }
    const [row] = await db.insert(schema.users).values({ email, passwordHash, fullName, status: "ACTIVE", platformRole, emailVerifiedAt: now }).returning({ id: schema.users.id });
    result.created.push(email);
    return { id: row!.id, isNew: true };
  }

  async function shop(owner: { id: string; isNew: boolean }, input: { name: string; slug: string; status: "ACTIVE" | "DRAFT" | "SUSPENDED"; statusReason?: string; contactEmail: string; address: string }, workshops: WorkshopSeed[], opts: { history: boolean; affiliateUserId?: string }): Promise<void> {
    if (!owner.isNew) return;
    const [org] = await db.insert(schema.organizations).values({
      name: input.name, slug: input.slug, status: input.status, ...(input.statusReason ? { statusReason: input.statusReason } : {}), country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND", defaultLocale: "en", enabledLocales: ["en", "vi"],
      contactEmail: input.contactEmail, contactPhone: "+84 28 3822 0000", whatsapp: "+84 90 123 4567", address: input.address, mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(input.address)}`,
    }).returning();
    await db.insert(schema.organizationMembers).values({ organizationId: org!.id, userId: owner.id, role: "OWNER" });
    await db.insert(schema.auditLogs).values({ organizationId: org!.id, actorUserId: owner.id, action: "organization.create", entityType: "organization", entityId: org!.id, after: { slug: input.slug, status: input.status } });
    if (workshops.length === 0) return;

    // customers of the shop (the guests who booked there)
    const customerIds = new Map<string, string>();
    if (opts.history) {
      for (const g of GUESTS) {
        const [c] = await db.insert(schema.customers).values({ organizationId: org!.id, emailNormalized: g.email, fullName: g.name, country: g.country, phone: g.phone, createdAt: addMs(now, -45 * 86_400_000) }).returning({ id: schema.customers.id });
        customerIds.set(g.email, c!.id);
      }
    }

    let sessionNumber = 0;
    let affiliateDone = false;
    for (const [index, w] of workshops.entries()) {
      const [row] = await db.insert(schema.workshops).values({
        organizationId: org!.id, title: w.title, shortDescription: w.short, description: w.description, includes: w.includes, notes: { en: "Wear closed shoes.", vi: "Hãy mang giày kín mũi." },
        durationMinutes: w.durationMinutes, priceAmount: w.price, currency: "VND", defaultCapacity: w.capacity, maxPerBooking: w.maxPerBooking, coverUrl: img(w.key), galleryUrls: [img(w.key, 1), img(w.key, 2)],
        categories: w.categories, address: "", addressNote: "", status: w.status, sortOrder: index,
      }).returning();
      await db.insert(schema.auditLogs).values({ organizationId: org!.id, actorUserId: owner.id, action: "workshop.create", entityType: "workshop", entityId: row!.id, after: { priceAmount: w.price, status: "DRAFT" } });
      if (!w.rule || w.status !== "ACTIVE") continue;
      // an affiliate link of the demo customer to this workshop (the first one that runs); some of its paid bookings came through it
      let linkId: string | null = null;
      if (opts.history && opts.affiliateUserId && !affiliateDone) {
        const [link] = await db.insert(schema.affiliateLinks).values({ userId: opts.affiliateUserId, organizationId: org!.id, workshopId: row!.id, code: newCode("A"), clicks: 37 }).returning({ id: schema.affiliateLinks.id });
        linkId = link!.id;
        affiliateDone = true;
      }

      const [rule] = await db.insert(schema.scheduleRules).values({ organizationId: org!.id, workshopId: row!.id, weekdays: w.rule.weekdays, startTimes: w.rule.times, effectiveFrom: addDays(dateIn(now, "Asia/Ho_Chi_Minh"), -60), capacityOverride: null }).returning();
      // the sessions of the rule from six weeks ago to the next 60 days: ruleStarts only looks forward, so the past is made by moving `now` back
      const starts: Date[] = [];
      for (let back = 42; back >= 0; back -= 7) for (const s of ruleStarts({ weekdays: w.rule.weekdays, startTimes: w.rule.times, effectiveFrom: rule!.effectiveFrom, effectiveTo: null }, "Asia/Ho_Chi_Minh", addMs(now, -back * 86_400_000), 7)) starts.push(s);
      for (const s of ruleStarts({ weekdays: w.rule.weekdays, startTimes: w.rule.times, effectiveFrom: rule!.effectiveFrom, effectiveTo: null }, "Asia/Ho_Chi_Minh", now, 60)) starts.push(s);
      const unique = [...new Map(starts.map((s) => [s.getTime(), s])).values()].sort((x, y) => x.getTime() - y.getTime());

      for (const starts_at of unique) {
        sessionNumber++;
        const ends = new Date(starts_at.getTime() + w.durationMinutes * 60_000);
        const past = ends.getTime() <= now.getTime();
        const daysAhead = (starts_at.getTime() - now.getTime()) / 86_400_000;
        const ageDays = (now.getTime() - ends.getTime()) / 86_400_000;
        // past sessions: closed by the system (the older ones completed by the owner); coming ones: running for the next 4 weeks, open after; one paused and one closed by the owner for the demo
        let status: "OPEN" | "PAUSED" | "RUNNING" | "CLOSED" | "COMPLETED" = past ? (ageDays > 14 ? "COMPLETED" : "CLOSED") : daysAhead <= 28 ? "RUNNING" : "OPEN";
        const notes: schema.SessionNoteRow[] = past ? [{ type: "AUTO_CLOSED", at: ends.toISOString() }] : [];
        if (!past && sessionNumber % 17 === 0) status = "PAUSED";
        const [session] = await db.insert(schema.workshopSessions).values({
          organizationId: org!.id, workshopId: row!.id, scheduleRuleId: rule!.id, startsAt: starts_at, originStartsAt: starts_at, endsAt: ends, capacity: w.capacity, status, autoClosed: past,
          code: `SES-${String(sessionNumber).padStart(4, "0")}`, sessionNotes: notes, bookingCutoffMinutes: 120,
        }).returning();
        result.sessions++;
        if (!opts.history || status === "OPEN" || daysAhead > 30) continue;

        // bookings of the session: a few guests each, never more seats than the capacity
        let left = w.capacity - (past ? 0 : Math.floor(rand() * 3));
        let reserved = 0;
        let seq = 0;
        const guests = [...GUESTS].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 5));
        for (const g of guests) {
          const quantity = Math.min(1 + Math.floor(rand() * Math.min(w.maxPerBooking, 3)), left);
          if (quantity < 1) break;
          seq++;
          const roll = rand();
          const status2 = past
            ? roll < 0.7 ? "CHECKED_IN" : roll < 0.85 ? "CONFIRMED" : "CANCELLED"
            : roll < 0.3 ? "NOT_CONFIRMED" : roll < 0.9 ? "CONFIRMED" : "CANCELLED";
          const paid = status2 === "CHECKED_IN" && rand() < 0.9;
          // every fourth booking used the demo code WELCOME10 (10% off): the fees are taken on the price before it (FR-PAY-02)
          const subtotal = w.price * quantity;
          const discount = seq % 4 === 0 ? Math.round(subtotal / 10) : 0;
          const total = subtotal - discount;
          const booking = await db.insert(schema.bookings).values({
            organizationId: org!.id, bookingCode: `${session!.code}-${String(seq).padStart(3, "0")}`, sessionId: session!.id, workshopId: row!.id, customerId: customerIds.get(g.email)!,
            source: rand() < 0.15 ? "WALK_IN" : "ONLINE", quantity, status: status2, paymentStatus: paid ? "PAID" : "UNPAID", statusBeforeCheckIn: status2 === "CHECKED_IN" ? "CONFIRMED" : null,
            unitPriceAmount: w.price, totalAmount: total, discountAmount: discount, currency: "VND", guestName: g.name, guestEmail: g.email, guestPhone: g.phone, guestCountry: g.country,
            snapshot: { workshopTitle: w.title, sessionCode: session!.code, startsAt: starts_at.toISOString(), endsAt: ends.toISOString(), timezone: "Asia/Ho_Chi_Minh", address: input.address, subtotalAmount: subtotal, ...(discount > 0 ? { discounts: [{ code: "WELCOME10", amount: discount }] } : {}) },
            ...(linkId && g.email !== DEMO_ACCOUNTS.customer && seq % 3 === 0 ? { affiliateLinkId: linkId } : {}), locale: g.country === "VN" ? "vi" : "en", ...(status2 === "CHECKED_IN" ? { checkedInAt: addMs(starts_at, 5 * 60_000) } : {}),
            ...(status2 === "CANCELLED" ? { cancelledBy: rand() < 0.6 ? ("GUEST" as const) : ("SHOP" as const), cancelReason: "Change of plans" } : {}),
            createdAt: addMs(starts_at, -Math.floor(rand() * 10 + 2) * 86_400_000),
          }).returning({ id: schema.bookings.id });
          result.bookings++;
          if (status2 !== "CANCELLED") { left -= quantity; reserved += quantity; }
          if (paid) {
            await db.insert(schema.payments).values({ organizationId: org!.id, bookingId: booking[0]!.id, type: "PAYMENT", amount: total, currency: "VND", method: rand() < 0.5 ? "CASH" : "BANK_TRANSFER", note: "Paid at the studio", recordedBy: owner.id, recordedAt: addMs(starts_at, 30 * 60_000) });
            result.payments++;
          }
        }
        await db.update(schema.workshopSessions).set({ reservedCount: reserved, bookingSeq: seq }).where(eq(schema.workshopSessions.id, session!.id));
      }
    }
    await db.update(schema.organizations).set({ sessionSeq: sessionNumber }).where(eq(schema.organizations.id, org!.id));
  }

  const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);

  await user(DEMO_ACCOUNTS.admin, "Platform Admin", "SUPER_ADMIN");
  const emma = await user(DEMO_ACCOUNTS.customer, "Emma Wilson"); // before the shops: her affiliate link goes on some of their bookings
  await shop(await user(DEMO_ACCOUNTS.activeOwner, "Linh Tran"), { name: "Whisk & Ladle Kitchen", slug: "whiskladle", status: "ACTIVE", contactEmail: DEMO_ACCOUNTS.activeOwner, address: "12 Nguyen Hue, District 1, Ho Chi Minh City" }, WHISK_WORKSHOPS, { history: true, affiliateUserId: emma.id });
  await shop(await user(DEMO_ACCOUNTS.draftOwner, "Ava Nguyen"), { name: "Sugar & Sift Bakery", slug: "sugarsift", status: "DRAFT", contactEmail: DEMO_ACCOUNTS.draftOwner, address: "8 Le Loi, District 1, Ho Chi Minh City" }, SUGAR_WORKSHOPS, { history: false });
  await shop(await user(DEMO_ACCOUNTS.suspendedOwner, "Minh Le"), { name: "Golden Noodle House", slug: "goldennoodle", status: "SUSPENDED", statusReason: "Reported for misleading prices (demo)", contactEmail: DEMO_ACCOUNTS.suspendedOwner, address: "45 Tran Hung Dao, District 5, Ho Chi Minh City" }, NOODLE_WORKSHOPS, { history: false });
  for (const g of GUESTS.slice(1, 6)) await user(g.email, g.name);
  return result;
}

/**
 * The demo shop gets rates of its own (different from the defaults, so the screens show that each shop has its own) and the months that are over are closed, as the worker does every hour.
 * Safe to run again: rates that exist are kept, a closed month is skipped.
 */
export async function seedFinance(db: Database): Promise<{ closed: number }> {
  const [shop] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, "whiskladle")).limit(1);
  if (shop) {
    const rates = { maintenanceBps: 800, serviceBps: 1200, affiliateBps: 500, inviteBonusBps: 300 };
    await db.insert(schema.organizationFeeSettings).values({ organizationId: shop.id, ...rates }).onConflictDoNothing();
    // the demo history is long: these rates apply to the whole demo past (a change made later only reaches what is paid after it, D24)
    await db.insert(schema.organizationFeeRates).values({ organizationId: shop.id, effectiveFrom: new Date(0), ...rates }).onConflictDoNothing();
  }
  const { closed } = await new FinanceService(db, new AuditService(db)).closeMonths();
  await seedWallet(db);
  await seedInvites(db);
  await seedPromotions(db);
  return { closed };
}

/**
 * The demo shop gets promotions in every state (running, scheduled, paused), one to use alone and two that can be combined (never more than 5 running at once, never a free workshop).
 * Written once: when the shop already has promotions nothing is added.
 */
async function seedPromotions(db: Database): Promise<void> {
  const [shop] = await db.select({ id: schema.organizations.id, timezone: schema.organizations.timezone }).from(schema.organizations).where(eq(schema.organizations.slug, "whiskladle")).limit(1);
  if (!shop) return;
  const [has] = await db.select({ id: schema.promotions.id }).from(schema.promotions).where(eq(schema.promotions.organizationId, shop.id)).limit(1);
  if (has) return;
  const first = (await db.select({ id: schema.workshops.id }).from(schema.workshops).where(eq(schema.workshops.organizationId, shop.id)).orderBy(schema.workshops.sortOrder).limit(1))[0];
  const today = dateIn(new Date(), shop.timezone);
  const day = (n: number): string => addDays(today, n);
  const base = { organizationId: shop.id, discountType: "PERCENT" as const, description: {} };
  await db.insert(schema.promotions).values([
    { ...base, title: { en: "Early bird: 20% off", vi: "Đặt sớm: giảm 20%" }, code: "EARLY20", discountValue: 20, stacking: "SINGLE", startDate: day(-10), endDate: day(20), description: { en: "Book any workshop and pay 20% less." } },
    { ...base, title: { en: "Groups save 10%", vi: "Đi nhóm giảm 10%" }, code: "GROUP10", discountValue: 10, stacking: "MULTIPLE", startDate: day(-2), endDate: day(25) },
    { ...base, title: { en: "Welcome gift: 50,000 off" }, code: "WELCOME50", discountType: "FIXED_AMOUNT", discountValue: 50_000, stacking: "MULTIPLE", appliesTo: "SELECTED", workshopIds: first ? [first.id] : [], startDate: day(-5), endDate: day(12) },
    { ...base, title: { en: "Autumn festival" }, code: "AUTUMN15", discountValue: 15, stacking: "SINGLE", startDate: day(14), endDate: day(30) },
    { ...base, title: { en: "Student discount" }, code: "STUDENT10", discountValue: 10, stacking: "MULTIPLE", enabled: false, startDate: day(-10), endDate: day(40) },
  ]);
}

/**
 * The demo customer gets an invite link and two friends who registered with it: one registered long ago (the bookings they made since are counted, so the bonus shows) and one just now (waiting
 * for a first paid booking). Written once.
 */
async function seedInvites(db: Database): Promise<void> {
  const [emma] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.customer)).limit(1);
  if (!emma) return;
  const [has] = await db.select({ userId: schema.inviteLinks.userId }).from(schema.inviteLinks).where(eq(schema.inviteLinks.userId, emma.id)).limit(1);
  if (has) return;
  await db.insert(schema.inviteLinks).values({ userId: emma.id, code: newCode("I") });
  const friends = [GUESTS[1], GUESTS[2]];
  const ages = [50, 0]; // days ago
  for (const [i, g] of friends.entries()) {
    const [friend] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, g!.email)).limit(1);
    if (friend) await db.insert(schema.referrals).values({ inviterUserId: emma.id, friendUserId: friend.id, createdAt: new Date(Date.now() - ages[i]! * 86_400_000) }).onConflictDoNothing();
  }
}

/**
 * The demo customer gets a wallet: some credits written by hand (what the two programs earn is worked out from the bookings and added to them) and one invoice of each state.
 * Written once: when the customer already has credits nothing is added.
 */
async function seedWallet(db: Database): Promise<void> {
  const [emma] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.customer)).limit(1);
  const [root] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin)).limit(1);
  if (!emma) return;
  const [existing] = await db.select({ id: schema.walletCredits.id }).from(schema.walletCredits).where(eq(schema.walletCredits.userId, emma.id)).limit(1);
  if (existing) return;
  const credits: [("AFFILIATE" | "REFERRAL"), number, string][] = [["AFFILIATE", 160_000, "Demo credit (an adjustment made by hand)"], ["AFFILIATE", 90_000, "Demo credit (an adjustment made by hand)"], ["REFERRAL", 100_000, "Demo credit (an adjustment made by hand)"], ["REFERRAL", 100_000, "Demo credit (an adjustment made by hand)"]];
  for (const [source, amount, note] of credits) await db.insert(schema.walletCredits).values({ userId: emma.id, source, currency: "VND", amount, note });
  const number = sql`'WD-' || lpad(nextval('withdrawal_number_seq')::text, 4, '0')`;
  const day = 86_400_000;
  const bank = { bankName: "Demo Bank", bankAccountNumber: "000011112222", bankAccountHolder: "Emma Wilson" }; // made up: not a real account
  await db.insert(schema.withdrawals).values([
    { number, userId: emma.id, source: "AFFILIATE", currency: "VND", amount: 100_000, ...bank, status: "PAID", requestedAt: new Date(Date.now() - 20 * day), processedAt: new Date(Date.now() - 18 * day), processedBy: root?.id ?? null },
    { number, userId: emma.id, source: "AFFILIATE", currency: "VND", amount: 50_000, ...bank, status: "REJECTED", reason: "Bank details are missing (demo)", requestedAt: new Date(Date.now() - 9 * day), processedAt: new Date(Date.now() - 8 * day), processedBy: root?.id ?? null },
    { number, userId: emma.id, source: "REFERRAL", currency: "VND", amount: 60_000, ...bank, status: "PENDING", requestedAt: new Date(Date.now() - 1 * day) },
  ]);
}

async function main(): Promise<void> {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  let password = process.env.SEED_PASSWORD;
  let written = false;
  if (password !== undefined && password.length < 10) throw new Error("SEED_PASSWORD must have at least 10 characters.");
  if (!password) {
    password = randomBytes(18).toString("base64url"); // 24 characters
    written = true;
  }
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema }) as Database;
    const result = await db.transaction((tx) => seed(tx, password!));
    const finance = await seedFinance(db);
    if (written && result.created.length > 0) {
      const lines = ["Demo accounts (made by pnpm db:seed). They all use the same password. This file is ignored by git: do not share it.", "", `password: ${password}`, "", ...Object.values(DEMO_ACCOUNTS).map((e) => `  ${e}`), ""];
      writeFileSync(".seed-credentials", lines.join("\n"), { encoding: "utf8" });
      try { chmodSync(".seed-credentials", 0o600); } catch { /* not supported on every file system */ }
    }
    console.log(`Seed done: ${result.created.length} accounts created (${result.existing.length} already there), ${result.sessions} sessions, ${result.bookings} bookings, ${result.payments} payments, ${finance.closed} month(s) closed.`);
    if (written && result.created.length > 0) console.log("The password was written to apps/api/.seed-credentials (not shown here).");
    else if (result.created.length === 0) console.log("Nothing to do: the demo accounts already exist.");
  } finally {
    await pool.end();
  }
}

// Run only when this file is the entry point (not when a test imports it).
if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "The seed failed.");
    process.exit(1);
  });
}
