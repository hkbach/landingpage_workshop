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
import { buildPage } from "./seed-pages";
import { DEMO_ACCOUNTS, GUESTS, P, SHOPS, SPECIAL_USERS, WALK_INS, photo, type Guest, type ShopSeed, type WorkshopSeed } from "./seed-data";
import * as schema from "./schema";

// Demo data for development and testing (REQUIREMENTS 11.2). `pnpm db:seed` makes: one platform administrator, nine shops in every state and of every kind (an active shop with a long history, a shop in
// DRAFT, a SUSPENDED one, shops in Vietnam, Korea, Japan, Thailand and the USA with their own currency, time zone and language, a shop made of edge cases, a shop whose page was never published),
// their owners, sixteen customers with accounts, workshops with real photographs from the internet, weekly schedules, sessions in every state and the bookings and payments of them, landing pages (live,
// with kept versions, draft), promotions, ratings, favorites, an affiliate and an invite program, a wallet, support messages, reports and the Terms. Everything is relative to today, so the data
// always looks current, and it is made by a small deterministic generator, so two runs on empty databases give the same shape.
//
// The password of every demo account is NOT in the code. Set SEED_PASSWORD to choose it, or leave it unset: the seed then makes a random one and writes it to apps/api/.seed-credentials
// (a file that git ignores), without printing it. The seed can be run again: a shop that exists is left as it is. `pnpm db:reseed` wipes the database first.
export { DEMO_ACCOUNTS };

export interface SeedResult { created: string[]; existing: string[]; sessions: number; bookings: number; payments: number }

/** A small deterministic generator (same seed, same numbers). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x1_0000_0000; };
}

const DAY = 86_400_000;
const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "E_WALLET"] as const;
const localeOf = (country: string): string => (country === "VN" ? "vi" : country === "KR" ? "ko" : country === "JP" ? "ja" : country === "CN" ? "zh" : "en");

/** Everything one shop needs while it is being made. */
interface Ctx {
  db: Executor; now: Date; rand: () => number; result: SeedResult;
  cfg: ShopSeed; orgId: string; ownerId: string;
  customers: Map<string, string>; walkIns: string[];
  userIds: Map<string, string>;
  sessionNumber: number;
  /** Bookings of guests who came: the people who can rate the workshop afterwards. */
  attended: { bookingId: string; email: string; workshopId: string; endsAt: Date }[];
  affiliateUserId?: string;
}

interface WorkshopRow { id: string; seed: WorkshopSeed }
interface SessionRow { id: string; code: string; startsAt: Date; endsAt: Date; capacity: number }

interface BookingPlan {
  guest: Guest | "walk-in" | number; quantity: number; status: "NOT_CONFIRMED" | "CONFIRMED" | "CHECKED_IN" | "CANCELLED"; paid?: boolean;
  source?: "ONLINE" | "WALK_IN" | "PHONE" | "OTHER"; discountPct?: number; discountCode?: string; promotionIds?: string[]; linkId?: string | null;
  cancelledBy?: "GUEST" | "SHOP"; cancelReason?: string; reversed?: boolean; request?: string; method?: (typeof METHODS)[number];
}

export async function seed(db: Executor, password: string, now: Date = new Date()): Promise<SeedResult> {
  const passwordHash = await hashPassword(password);
  const result: SeedResult = { created: [], existing: [], sessions: 0, bookings: 0, payments: 0 };
  const rand = rng(20260101);
  const userIds = new Map<string, string>();

  async function user(email: string, fullName: string, opts: { role?: "SUPER_ADMIN" | null; status?: "ACTIVE" | "UNVERIFIED" | "DISABLED" } = {}): Promise<{ id: string; isNew: boolean }> {
    const [found] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (found) { result.existing.push(email); userIds.set(email, found.id); return { id: found.id, isNew: false }; }
    const status = opts.status ?? "ACTIVE";
    const [row] = await db.insert(schema.users).values({
      email, passwordHash, fullName, status, platformRole: opts.role ?? null, ...(status === "UNVERIFIED" ? {} : { emailVerifiedAt: addMs(now, -80 * DAY) }), createdAt: addMs(now, -80 * DAY), uiLocale: localeOf(email.endsWith(".vn") ? "VN" : "US"),
    }).returning({ id: schema.users.id });
    result.created.push(email);
    userIds.set(email, row!.id);
    return { id: row!.id, isNew: true };
  }

  // The platform administrator, the guests (each one has an account, so the customer area shows their bookings), and two accounts whose STATE is what is tested.
  await user(DEMO_ACCOUNTS.admin, "Platform Admin", { role: "SUPER_ADMIN" });
  for (const g of GUESTS) await user(g.email, g.name); // (Emma first: her affiliate link goes on some bookings of the shops)
  await user(SPECIAL_USERS.unverified.email, SPECIAL_USERS.unverified.name, { status: "UNVERIFIED" });
  await user(SPECIAL_USERS.disabled.email, SPECIAL_USERS.disabled.name, { status: "DISABLED" });

  for (const cfg of SHOPS) {
    const owner = await user(cfg.owner.email, cfg.owner.name);
    if (!owner.isNew) continue; // a shop that exists is left as it is
    await makeShop({ db, now, rand, result, cfg, orgId: "", ownerId: owner.id, customers: new Map(), walkIns: [], userIds, sessionNumber: 0, attended: [], ...(userIds.get(DEMO_ACCOUNTS.customer) ? { affiliateUserId: userIds.get(DEMO_ACCOUNTS.customer)! } : {}) });
  }
  return result;
}

// ---- one shop --------------------------------------------------------------------------------------------------------------------------------------------

async function makeShop(ctx: Ctx): Promise<void> {
  const { db, now, cfg } = ctx;
  const history = cfg.weeksBack > 0;
  const [org] = await db.insert(schema.organizations).values({
    name: cfg.name, slug: cfg.slug, status: cfg.status, ...(cfg.statusReason ? { statusReason: cfg.statusReason } : {}), country: cfg.country, timezone: cfg.timezone, currency: cfg.currency,
    defaultLocale: cfg.defaultLocale, enabledLocales: cfg.enabledLocales, contactEmail: cfg.owner.email, contactPhone: cfg.phone, whatsapp: cfg.whatsapp || null, address: cfg.address, mapsUrl: cfg.mapsUrl,
    showOnCustomerPage: cfg.listed && cfg.status === "ACTIVE", createdAt: addMs(now, -(history ? 75 : 5) * DAY),
    ...(cfg.customDomain ? { customDomain: cfg.customDomain.domain, ...(cfg.customDomain.verified ? { customDomainVerifiedAt: addMs(now, -30 * DAY) } : {}) } : {}),
  }).returning();
  ctx.orgId = org!.id;
  await db.insert(schema.organizationMembers).values({ organizationId: org!.id, userId: ctx.ownerId, role: "OWNER" });
  await db.insert(schema.auditLogs).values({ organizationId: org!.id, actorUserId: ctx.ownerId, action: "organization.create", entityType: "organization", entityId: org!.id, after: { slug: cfg.slug, status: cfg.status } });
  if (cfg.status === "SUSPENDED") {
    const [admin] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin)).limit(1);
    await db.insert(schema.auditLogs).values({ organizationId: org!.id, actorUserId: admin?.id ?? null, action: "organization.suspend", entityType: "organization", entityId: org!.id, before: { status: "ACTIVE" }, after: { status: "SUSPENDED", reason: cfg.statusReason } });
  }
  if (cfg.workshops.length === 0) return;

  // the customers of the shop: the guests who booked there, and people at the studio who gave no email
  if (history) {
    for (const g of GUESTS) {
      const [c] = await db.insert(schema.customers).values({ organizationId: org!.id, emailNormalized: g.email, fullName: g.name, country: g.country, phone: g.phone, preferredLocale: localeOf(g.country), createdAt: addMs(now, -45 * DAY) }).returning({ id: schema.customers.id });
      ctx.customers.set(g.email, c!.id);
    }
    for (const w of WALK_INS) {
      const [c] = await db.insert(schema.customers).values({ organizationId: org!.id, fullName: w.name, country: w.country, phone: w.phone, createdAt: addMs(now, -40 * DAY) }).returning({ id: schema.customers.id });
      ctx.walkIns.push(c!.id);
    }
  }

  const rows: WorkshopRow[] = [];
  for (const [index, w] of cfg.workshops.entries()) {
    const [row] = await db.insert(schema.workshops).values({
      organizationId: org!.id, title: w.title, shortDescription: w.short, description: w.description, includes: w.includes, notes: { en: "Wear closed shoes.", vi: "Hãy mang giày kín mũi." },
      durationMinutes: w.durationMinutes, priceAmount: w.price, currency: cfg.currency, defaultCapacity: w.capacity, maxPerBooking: w.maxPerBooking, coverUrl: w.cover, galleryUrls: w.gallery,
      categories: w.categories, address: "", addressNote: index === 0 ? "Ring the bell at the green door." : "", status: w.status, sortOrder: index, createdAt: addMs(now, -(history ? 70 : 4) * DAY),
    }).returning({ id: schema.workshops.id });
    await db.insert(schema.auditLogs).values({ organizationId: org!.id, actorUserId: ctx.ownerId, action: "workshop.create", entityType: "workshop", entityId: row!.id, after: { priceAmount: w.price, status: "DRAFT" } });
    rows.push({ id: row!.id, seed: w });
  }

  const promos = await makePromotions(ctx); // after the workshops: a promotion for chosen workshops needs their ids
  if (cfg.key === "edge") await edgeSessions(ctx, rows, promos);
  else await ruleSessions(ctx, rows);
  await db.update(schema.organizations).set({ sessionSeq: ctx.sessionNumber }).where(eq(schema.organizations.id, org!.id));

  await makeRatings(ctx);
  if (cfg.page) await makePages(ctx, rows, promos.length > 0);
}

// ---- sessions ---------------------------------------------------------------------------------------------------------------------------------------------

async function insertSession(ctx: Ctx, w: WorkshopRow, startsAt: Date, over: { status?: "OPEN" | "PAUSED" | "RUNNING" | "CLOSED" | "COMPLETED"; capacity?: number; notes?: schema.SessionNoteRow[]; autoClosed?: boolean; ruleId?: string; origin?: Date; cutoff?: number } = {}): Promise<SessionRow> {
  ctx.sessionNumber++;
  const ends = addMs(startsAt, w.seed.durationMinutes * 60_000);
  const past = ends.getTime() <= ctx.now.getTime();
  const ageDays = (ctx.now.getTime() - ends.getTime()) / DAY;
  const daysAhead = (startsAt.getTime() - ctx.now.getTime()) / DAY;
  const status = over.status ?? (past ? (ageDays > 14 ? "COMPLETED" : "CLOSED") : daysAhead <= 28 ? "RUNNING" : "OPEN");
  const autoClosed = over.autoClosed ?? (past && over.status === undefined);
  const [s] = await ctx.db.insert(schema.workshopSessions).values({
    organizationId: ctx.orgId, workshopId: w.id, ...(over.ruleId ? { scheduleRuleId: over.ruleId } : {}), startsAt, originStartsAt: over.origin ?? startsAt, endsAt: ends, capacity: over.capacity ?? w.seed.capacity, status, autoClosed,
    code: `SES-${String(ctx.sessionNumber).padStart(4, "0")}`, sessionNotes: over.notes ?? (autoClosed ? [{ type: "AUTO_CLOSED", at: ends.toISOString() }] : []), bookingCutoffMinutes: over.cutoff ?? 120,
  }).returning({ id: schema.workshopSessions.id, code: schema.workshopSessions.code });
  ctx.result.sessions++;
  return { id: s!.id, code: s!.code, startsAt, endsAt: ends, capacity: over.capacity ?? w.seed.capacity };
}

/** The sessions of the weekly schedules from `weeksBack` weeks ago to `daysForward` days ahead, with the bookings of the ones that are over or close. */
async function ruleSessions(ctx: Ctx, rows: WorkshopRow[]): Promise<void> {
  const { cfg, now } = ctx;
  let affiliateDone = false;
  for (const w of rows) {
    if (!w.seed.rule || w.seed.status !== "ACTIVE") continue;
    const effectiveFrom = addDays(dateIn(now, cfg.timezone), -(cfg.weeksBack * 7 + 1));
    const [rule] = await ctx.db.insert(schema.scheduleRules).values({ organizationId: ctx.orgId, workshopId: w.id, weekdays: w.seed.rule.weekdays, startTimes: w.seed.rule.times, effectiveFrom, capacityOverride: null }).returning({ id: schema.scheduleRules.id });
    const like = { weekdays: w.seed.rule.weekdays, startTimes: w.seed.rule.times, effectiveFrom, effectiveTo: null };
    const starts: Date[] = [];
    // ruleStarts only looks forward, so the past is made by moving `now` back one week at a time
    for (let back = cfg.weeksBack * 7; back >= 7; back -= 7) starts.push(...ruleStarts(like, cfg.timezone, addMs(now, -back * DAY), 7));
    starts.push(...ruleStarts(like, cfg.timezone, now, cfg.daysForward));
    const unique = [...new Map(starts.map((s) => [s.getTime(), s])).values()].sort((x, y) => x.getTime() - y.getTime());

    // an affiliate link of the demo customer to the first workshop that runs in the first two shops that have history; some of the paid bookings came through it
    let linkId: string | null = null;
    if (ctx.affiliateUserId && !affiliateDone && cfg.weeksBack >= 4 && (cfg.key === "whisk" || cfg.key === "tokyo")) {
      const [link] = await ctx.db.insert(schema.affiliateLinks).values({ userId: ctx.affiliateUserId, organizationId: ctx.orgId, workshopId: w.id, code: newCode("A"), clicks: 37 }).returning({ id: schema.affiliateLinks.id });
      linkId = link!.id;
      affiliateDone = true;
    }

    let count = 0;
    for (const startsAt of unique) {
      count++;
      const past = addMs(startsAt, w.seed.durationMinutes * 60_000).getTime() <= now.getTime();
      const daysAhead = (startsAt.getTime() - now.getTime()) / DAY;
      let status: "OPEN" | "PAUSED" | "RUNNING" | "CLOSED" | "COMPLETED" | undefined;
      const notes: schema.SessionNoteRow[] = [];
      if (!past && count % 17 === 0) status = "PAUSED";
      else if (!past && count % 23 === 0) { // a session the owner closed before it started: its bookings are cancelled by the shop
        status = "CLOSED";
        notes.push({ type: "CLOSED", at: addMs(now, -DAY).toISOString(), reason: { code: "VENUE_ISSUE" } });
      }
      const s = await insertSession(ctx, w, startsAt, { ruleId: rule!.id, ...(status ? { status, notes } : {}) });
      const finalStatus = status ?? (past ? ((now.getTime() - s.endsAt.getTime()) / DAY > 14 ? "COMPLETED" : "CLOSED") : daysAhead <= 28 ? "RUNNING" : "OPEN");
      if (cfg.weeksBack === 0 || finalStatus === "OPEN" || daysAhead > 30) continue;
      await bookSession(ctx, w, s, { past, closedByOwner: status === "CLOSED" && !past, linkId, discount: cfg.key === "whisk" });
    }
  }
}

/** A few guests book a session: never more seats than the capacity, in every state a booking can be in. */
async function bookSession(ctx: Ctx, w: WorkshopRow, s: SessionRow, o: { past: boolean; closedByOwner: boolean; linkId: string | null; discount: boolean }): Promise<void> {
  const { rand } = ctx;
  let left = w.seed.capacity - (o.past ? 0 : Math.floor(rand() * 3));
  const guests = [...GUESTS].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 4));
  const plans: BookingPlan[] = [];
  for (const [i, g] of guests.entries()) {
    const quantity = Math.min(1 + Math.floor(rand() * Math.min(w.seed.maxPerBooking, 3)), left);
    if (quantity < 1) break;
    const roll = rand();
    const status = o.closedByOwner ? "CANCELLED" : o.past ? (roll < 0.7 ? "CHECKED_IN" : roll < 0.85 ? "CONFIRMED" : "CANCELLED") : roll < 0.3 ? "NOT_CONFIRMED" : roll < 0.9 ? "CONFIRMED" : "CANCELLED";
    const walkIn = !o.closedByOwner && rand() < 0.12;
    plans.push({
      guest: walkIn ? "walk-in" : g, quantity, status, paid: status === "CHECKED_IN" && rand() < 0.9, source: walkIn ? (rand() < 0.5 ? "WALK_IN" : "PHONE") : rand() < 0.05 ? "OTHER" : "ONLINE",
      ...(o.discount && (i + 1) % 4 === 0 ? { discountPct: 10, discountCode: "WELCOME10" } : {}), ...(o.linkId && !walkIn && g.email !== DEMO_ACCOUNTS.customer && (i + 1) % 3 === 0 ? { linkId: o.linkId } : {}),
      ...(status === "CANCELLED" ? o.closedByOwner ? { cancelledBy: "SHOP" as const, cancelReason: "The session was closed by the studio (venue issue)" } : { cancelledBy: rand() < 0.6 ? ("GUEST" as const) : ("SHOP" as const), cancelReason: "Change of plans" } : {}),
    });
    if (status !== "CANCELLED") left -= quantity;
  }
  await placeBookings(ctx, w, s, plans);
}

/** Inserts the bookings of a session and sets its seats from them. */
async function placeBookings(ctx: Ctx, w: WorkshopRow, s: SessionRow, plans: BookingPlan[]): Promise<void> {
  let reserved = 0;
  for (const [i, plan] of plans.entries()) {
    await insertBooking(ctx, w, s, i + 1, plan);
    if (plan.status !== "CANCELLED") reserved += plan.quantity;
  }
  await ctx.db.update(schema.workshopSessions).set({ reservedCount: reserved, bookingSeq: plans.length }).where(eq(schema.workshopSessions.id, s.id));
}

async function insertBooking(ctx: Ctx, w: WorkshopRow, s: SessionRow, seq: number, p: BookingPlan): Promise<void> {
  const { db, cfg, now, rand } = ctx;
  const guest = typeof p.guest === "number" ? GUESTS[p.guest]! : p.guest === "walk-in" ? null : p.guest;
  const walk = WALK_INS[seq % WALK_INS.length]!;
  const customerId = guest ? ctx.customers.get(guest.email)! : ctx.walkIns[seq % ctx.walkIns.length]!;
  const subtotal = w.seed.price * p.quantity;
  const discount = p.discountPct ? Math.round((subtotal * p.discountPct) / 100) : 0;
  const total = subtotal - discount;
  const paid = Boolean(p.paid) && total > 0;
  const created = new Date(Math.min(ctx.now.getTime() - 3_600_000, s.startsAt.getTime() - (Math.floor(rand() * 10) + 2) * DAY));
  const checkedIn = p.status === "CHECKED_IN";
  const [b] = await db.insert(schema.bookings).values({
    organizationId: ctx.orgId, bookingCode: `${s.code}-${String(seq).padStart(3, "0")}`, sessionId: s.id, workshopId: w.id, customerId, source: p.source ?? "ONLINE", quantity: p.quantity, status: p.status,
    paymentStatus: paid && !p.reversed ? "PAID" : "UNPAID", statusBeforeCheckIn: checkedIn ? "CONFIRMED" : null, unitPriceAmount: w.seed.price, totalAmount: total, discountAmount: discount, ...(p.promotionIds ? { promotionIds: p.promotionIds } : {}),
    currency: cfg.currency, guestName: guest?.name ?? walk.name, guestEmail: guest?.email ?? null, guestPhone: guest?.phone ?? walk.phone, guestCountry: guest?.country ?? walk.country,
    snapshot: { workshopTitle: w.seed.title, sessionCode: s.code, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), timezone: cfg.timezone, address: cfg.address, subtotalAmount: subtotal, ...(discount > 0 ? { discounts: [{ code: p.discountCode ?? "PROMO", amount: discount }] } : {}) },
    ...(p.linkId ? { affiliateLinkId: p.linkId } : {}), locale: guest ? localeOf(guest.country) : "en", ...(p.request ? { specialRequest: p.request } : {}),
    ...(checkedIn ? { checkedInAt: addMs(s.startsAt, 5 * 60_000), checkedInBy: ctx.ownerId } : {}),
    ...(p.status === "CANCELLED" ? { cancelledBy: p.cancelledBy ?? "GUEST", cancelReason: p.cancelReason ?? "Change of plans" } : {}), createdAt: created, ...(p.source === "WALK_IN" || p.source === "PHONE" ? { createdBy: ctx.ownerId } : {}),
  }).returning({ id: schema.bookings.id });
  ctx.result.bookings++;
  if (paid) {
    const recordedAt = addMs(s.startsAt, 60 * 60_000 > now.getTime() - s.startsAt.getTime() ? 0 : 60 * 60_000);
    await db.insert(schema.payments).values({ organizationId: ctx.orgId, bookingId: b!.id, type: "PAYMENT", amount: total, currency: cfg.currency, method: p.method ?? METHODS[Math.floor(rand() * METHODS.length)]!, note: "Paid at the studio", recordedBy: ctx.ownerId, recordedAt });
    ctx.result.payments++;
    if (p.reversed) { // a payment entered by mistake and put right with a REVERSAL (never edited or deleted)
      await db.insert(schema.payments).values({ organizationId: ctx.orgId, bookingId: b!.id, type: "REVERSAL", amount: total, currency: cfg.currency, method: p.method ?? "CASH", note: "Entered by mistake", recordedBy: ctx.ownerId, recordedAt: addMs(recordedAt, 10 * 60_000) });
      ctx.result.payments++;
    }
  }
  if (checkedIn && guest) ctx.attended.push({ bookingId: b!.id, email: guest.email, workshopId: w.id, endsAt: s.endsAt });
}

// ---- the shop of edge cases ----------------------------------------------------------------------------------------------------------------------------

/**
 * Sessions made by hand, each one a case to test: sold out, one seat left, inside the booking cut-off, running now, paused, closed by the owner (its bookings cancelled), moved to another time,
 * completed, closed by the system, far in the future, a free workshop, the longest workshop, a payment put right with a reversal, a booking with promotions and one with a special request.
 */
async function edgeSessions(ctx: Ctx, rows: WorkshopRow[], promos: { id: string; code: string }[]): Promise<void> {
  const { now } = ctx;
  const by = (key: string): WorkshopRow => rows.find((r) => r.seed.key === key)!;
  const at = (days: number, minutes = 0): Date => new Date(now.getTime() + days * DAY + minutes * 60_000);
  const [pizza, burger, free, intensive] = [by("pizza-night"), by("burger-lab"), by("free-intro"), by("intensive")];
  const stack = promos.find((p) => p.code === "STACK30");

  // (1) sold out: four seats, all taken
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(2, 60)), [
    { guest: 0, quantity: 2, status: "CONFIRMED" }, { guest: 1, quantity: 2, status: "CONFIRMED" },
  ]);
  // (2) one seat left, and a guest who wrote a special request
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(3, 120)), [
    { guest: 2, quantity: 3, status: "NOT_CONFIRMED", request: "One of us is allergic to nuts: please keep the pesto separate." },
  ]);
  // (3) inside the booking cut-off: it starts in 60 minutes and online booking closes 120 minutes before
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(0, 60), { status: "RUNNING" }), [{ guest: 3, quantity: 1, status: "CONFIRMED" }]);
  // (4) running right now: it started 30 minutes ago, one guest already checked in and paid
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(0, -30), { status: "RUNNING" }), [{ guest: 4, quantity: 2, status: "CHECKED_IN", paid: true, method: "CARD" }, { guest: "walk-in", quantity: 1, status: "CHECKED_IN", source: "WALK_IN", paid: true }]);
  // (5) paused (not bookable) with a booking already in it
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(5, 180), { status: "PAUSED" }), [{ guest: 5, quantity: 1, status: "CONFIRMED" }]);
  // (6) closed by the owner before it started: its bookings were cancelled by the shop
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(4, 300), { status: "CLOSED", autoClosed: false, notes: [{ type: "CLOSED", at: addMs(now, -DAY).toISOString(), reason: { code: "VENUE_ISSUE" } }] }), [
    { guest: 6, quantity: 2, status: "CANCELLED", cancelledBy: "SHOP", cancelReason: "The session was closed by the studio (venue issue)" },
  ]);
  // (7) moved to another time (the original start is kept)
  const moved = at(6, 240);
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, moved, { origin: at(5, 240), notes: [{ type: "RESCHEDULED", at: addMs(now, -2 * DAY).toISOString(), reason: { code: "OTHER", note: "The chef is travelling" } }] }), [{ guest: 7, quantity: 2, status: "CONFIRMED" }]);
  // (8) completed last week, and one closed by the system two days ago
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(-8, 0), { status: "COMPLETED" }), [
    { guest: 8, quantity: 2, status: "CHECKED_IN", paid: true, method: "CASH" }, { guest: 9, quantity: 1, status: "CHECKED_IN", paid: true, method: "E_WALLET" }, { guest: 10, quantity: 1, status: "CANCELLED", cancelledBy: "GUEST", cancelReason: "I am ill" },
  ]);
  await placeBookings(ctx, pizza, await insertSession(ctx, pizza, at(-2, 0)), [{ guest: 11, quantity: 2, status: "CHECKED_IN", paid: false }, { guest: 12, quantity: 1, status: "CONFIRMED" }]); // CLOSED with bookings still unpaid: the owner has to confirm them
  // (9) far in the future, empty
  await insertSession(ctx, pizza, at(25, 0), { status: "OPEN" });

  // the burger lab: bookings with promotions, a payment put right, every payment method
  const burgerOpen = await insertSession(ctx, burger, at(1, 120));
  await placeBookings(ctx, burger, burgerOpen, [
    { guest: 0, quantity: 2, status: "CONFIRMED", discountPct: 30, discountCode: "STACK30", ...(stack ? { promotionIds: [stack.id] } : {}) },
    { guest: 1, quantity: 1, status: "NOT_CONFIRMED" },
  ]);
  await placeBookings(ctx, burger, await insertSession(ctx, burger, at(-5, 0)), [
    { guest: 2, quantity: 2, status: "CHECKED_IN", paid: true, method: "CASH" }, { guest: 3, quantity: 1, status: "CHECKED_IN", paid: true, method: "CARD" },
    { guest: 4, quantity: 1, status: "CHECKED_IN", paid: true, method: "BANK_TRANSFER" }, { guest: 5, quantity: 2, status: "CHECKED_IN", paid: true, reversed: true, method: "CASH" },
  ]);
  await insertSession(ctx, burger, at(8, 0));
  await insertSession(ctx, burger, at(26, 0), { status: "OPEN" });

  // the free workshop: the total is zero, nothing to pay
  await placeBookings(ctx, free, await insertSession(ctx, free, at(2, 0)), [{ guest: 13, quantity: 3, status: "CONFIRMED" }, { guest: 14, quantity: 2, status: "NOT_CONFIRMED" }]);
  await insertSession(ctx, free, at(9, 0));
  // the longest workshop, two seats a booking
  await placeBookings(ctx, intensive, await insertSession(ctx, intensive, at(10, 0)), [{ guest: 15, quantity: 2, status: "CONFIRMED" }]);
}

// ---- promotions ------------------------------------------------------------------------------------------------------------------------------------------

/** The promotions of a shop in every state (running, scheduled, paused, over), one to use alone and some that combine; never more than 5 running at once, never a free workshop. */
async function makePromotions(ctx: Ctx): Promise<{ id: string; code: string }[]> {
  const { db, cfg } = ctx;
  const day = (n: number): string => addDays(dateIn(ctx.now, cfg.timezone), n);
  const base = { organizationId: ctx.orgId, discountType: "PERCENT" as const, description: {} };
  const fixed = (vnd: number): number => (cfg.currency === "VND" ? vnd : cfg.currency === "KRW" ? vnd / 20 : cfg.currency === "JPY" ? Math.round(vnd / 170) : cfg.currency === "THB" ? vnd / 700 : 500);
  let list: Array<Record<string, unknown>> = [];
  if (cfg.key === "whisk") {
    const first = (await db.select({ id: schema.workshops.id }).from(schema.workshops).where(eq(schema.workshops.organizationId, ctx.orgId)).orderBy(schema.workshops.sortOrder).limit(1))[0];
    list = [
      { ...base, title: { en: "Early bird: 20% off", vi: "Đặt sớm: giảm 20%" }, code: "EARLY20", discountValue: 20, stacking: "SINGLE", startDate: day(-10), endDate: day(20), description: { en: "Book any workshop early and pay 20% less.", vi: "Đặt sớm bất kỳ workshop nào để được giảm 20%." }, imageUrl: photo(P.cookTogether, 800) },
      { ...base, title: { en: "Groups save 10%", vi: "Đi nhóm giảm 10%" }, code: "GROUP10", discountValue: 10, stacking: "MULTIPLE", startDate: day(-2), endDate: day(25) },
      { ...base, title: { en: "Welcome gift: 50,000 off" }, code: "WELCOME50", discountType: "FIXED_AMOUNT", discountValue: 50_000, stacking: "MULTIPLE", appliesTo: "SELECTED", workshopIds: first ? [first.id] : [], startDate: day(-5), endDate: day(15) },
      { ...base, title: { en: "Autumn festival" }, code: "AUTUMN15", discountValue: 15, stacking: "SINGLE", startDate: day(14), endDate: day(30) }, // scheduled
      { ...base, title: { en: "Student discount" }, code: "STUDENT10", discountValue: 10, stacking: "MULTIPLE", enabled: false, startDate: day(-10), endDate: day(40) }, // paused
      { ...base, title: { en: "Summer sale" }, code: "SUMMER25", discountValue: 25, stacking: "SINGLE", startDate: day(-70), endDate: day(-40) }, // over
    ];
  } else if (cfg.key === "tokyo") {
    list = [{ ...base, title: { ja: "秋の早割 10%オフ", en: "Autumn early bird: 10% off" }, code: "AKI10", discountValue: 10, stacking: "MULTIPLE", startDate: day(-3), endDate: day(30) }, { ...base, title: { en: "First time: 1,000 yen off" }, code: "FIRST1000", discountType: "FIXED_AMOUNT", discountValue: fixed(170_000), stacking: "MULTIPLE", startDate: day(-3), endDate: day(30) }];
  } else if (cfg.key === "seoul") {
    list = [{ ...base, title: { ko: "얼리버드 15% 할인", en: "Early bird 15%" }, code: "EARLYKR", discountValue: 15, stacking: "SINGLE", startDate: day(-5), endDate: day(25) }];
  } else if (cfg.key === "edge") {
    list = [
      { ...base, title: { en: "Stack 30%" }, code: "STACK30", discountValue: 30, stacking: "MULTIPLE", startDate: day(-5), endDate: day(40) },
      { ...base, title: { en: "Five dollars off" }, code: "FIVEOFF", discountType: "FIXED_AMOUNT", discountValue: 500, stacking: "MULTIPLE", startDate: day(-5), endDate: day(40) },
      { ...base, title: { en: "Weekend flash: 40% (alone)" }, code: "FLASH40", discountValue: 40, stacking: "SINGLE", startDate: day(-1), endDate: day(3) },
      { ...base, title: { en: "Starts in a month" }, code: "LATER20", discountValue: 20, stacking: "SINGLE", startDate: day(30), endDate: day(60) },
    ];
  }
  if (list.length === 0) return [];
  const rows = await db.insert(schema.promotions).values(list as (typeof schema.promotions.$inferInsert)[]).returning({ id: schema.promotions.id, code: schema.promotions.code });
  return rows.map((r) => ({ id: r.id, code: r.code }));
}

// ---- ratings and pages ------------------------------------------------------------------------------------------------------------------------------------

const COMMENTS: Record<string, string[]> = {
  en: ["A wonderful afternoon: the chef was patient and funny.", "Great value, small group and plenty of tasting.", "Loved it. I cooked the same dish at home the next day.", "Good class, but the room was a little warm.", "Perfect for a rainy day with friends."],
  vi: ["Một buổi chiều tuyệt vời, đầu bếp rất kiên nhẫn.", "Đáng tiền, nhóm nhỏ và được nếm thử nhiều món.", "Rất thích! Hôm sau mình đã nấu lại ở nhà."],
  ko: ["선생님이 친절하고 재미있었어요. 또 오고 싶어요.", "소규모라서 집중해서 배울 수 있었습니다."],
  ja: ["先生がとても丁寧で、楽しい時間でした。", "少人数で、じっくり学べました。"],
};

/** Ratings of the guests who came (a part of them, one for each booking): some low, one removed by the platform administrator (a reason is kept). */
async function makeRatings(ctx: Ctx): Promise<void> {
  const { db, rand, cfg } = ctx;
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin)).limit(1);
  let removed = 0;
  for (const a of ctx.attended) {
    if (rand() > 0.5) continue;
    const userId = ctx.userIds.get(a.email);
    if (!userId) continue;
    const roll = rand();
    const stars = roll < 0.55 ? 5 : roll < 0.8 ? 4 : roll < 0.92 ? 3 : roll < 0.97 ? 2 : 1;
    const pool = COMMENTS[cfg.defaultLocale] ?? COMMENTS.en!;
    const comment = rand() < 0.75 ? pool[Math.floor(rand() * pool.length)]! : null;
    const drop = removed === 0 && stars <= 2 && comment !== null; // one poor, commented rating is removed by the administrator
    if (drop) removed++;
    await db.insert(schema.workshopRatings).values({
      organizationId: ctx.orgId, workshopId: a.workshopId, bookingId: a.bookingId, userId, stars, comment, createdAt: addMs(a.endsAt, Math.floor(rand() * 3 + 1) * DAY),
      ...(drop ? { removedAt: addMs(ctx.now, -2 * DAY), removedReason: "Contains the phone number of a person (demo)", removedBy: admin?.id ?? null } : {}),
    }).onConflictDoNothing();
  }
}

/** The landing pages: a live one with the versions it was published as (and a newer draft), and for the first shop a second page that was never published. */
async function makePages(ctx: Ctx, rows: WorkshopRow[], hasPromotions: boolean): Promise<void> {
  const { db, cfg, now } = ctx;
  const page = cfg.page!;
  const built = buildPage(cfg, rows.map((r) => r.seed), hasPromotions);
  const publishedAt = addMs(now, -20 * DAY);
  const [main] = await db.insert(schema.sitePages).values({
    organizationId: ctx.orgId, name: "Main", templateKey: page.template, theme: built.theme, draftContent: built.content, publishedContent: built.content, publishedTheme: built.theme, publishedTemplateKey: page.template,
    version: page.versions, isLive: page.live, publishedAt, publishedBy: ctx.ownerId, createdAt: addMs(now, -60 * DAY),
  }).returning({ id: schema.sitePages.id });
  for (let v = 1; v <= page.versions; v++) {
    // the older versions had a shorter title, to tell them apart when one is put back
    const older = v === page.versions ? built.content : { ...built.content, seo: { ...built.content.seo, title: { ...built.content.seo.title, en: `${cfg.name} (version ${v})` } } };
    await db.insert(schema.sitePageVersions).values({ organizationId: ctx.orgId, pageId: main!.id, version: v, templateKey: page.template, content: older, theme: built.theme, publishedBy: ctx.ownerId, publishedAt: addMs(publishedAt, -(page.versions - v) * 7 * DAY) });
  }
  if (page.extraDraft) { // a second page that was never published
    const other = buildPage(cfg, rows.map((r) => r.seed), hasPromotions, { palette: "plum", title: "Autumn campaign" });
    await db.insert(schema.sitePages).values({ organizationId: ctx.orgId, name: "Autumn campaign", templateKey: "magazine", theme: other.theme, draftContent: other.content, version: 0, isLive: false, createdAt: addMs(now, -3 * DAY) });
  }
}

// ---- what is around the shops ----------------------------------------------------------------------------------------------------------------------------

/**
 * What the platform administrator handles: the support channels, the messages of the Contact form and the reports of a site in every state, and the Terms and the Privacy Policy (published once, every
 * demo account agreed to it, so nobody is stopped by the window of agreement; a draft of a newer Terms waits to be published to see it). Written once.
 */
export async function seedPlatform(db: Executor): Promise<void> {
  const [has] = await db.select({ key: schema.platformSettings.key }).from(schema.platformSettings).where(eq(schema.platformSettings.key, "support_contact")).limit(1);
  if (has) return;
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin)).limit(1);
  if (!admin) return;
  const now = Date.now();
  await db.insert(schema.platformSettings).values({ key: "support_contact", value: { whatsapp: "+84 90 000 1234", phone: "+84 28 3822 9999", zalo: "+84 90 000 5678", email: "support@workshopkit.example" }, updatedBy: admin.id });

  const messages: Array<{ name: string; email: string; topic: string; message: string; status: "NEW" | "IN_PROGRESS" | "DONE"; note?: string; ago: number }> = [
    { name: "Grace Lee", email: "grace.lee@example.com", topic: "demo", message: "We run a pottery studio in Hoi An and would like a demo of the booking page.", status: "NEW", ago: 0.2 },
    { name: "Ben Carter", email: "ben.carter@example.com", topic: "support", message: "My guests do not receive the confirmation email. Can you check?", status: "IN_PROGRESS", note: "Asked Resend for the delivery log.", ago: 2 },
    { name: "Thu Ha", email: "thu.ha@example.com", topic: "general", message: "Cho mình hỏi nền tảng có hỗ trợ thanh toán online không?", status: "DONE", note: "Answered: payments are recorded by the shop for now.", ago: 9 },
    { name: "Takeshi Mori", email: "takeshi.mori@example.com", topic: "partnership", message: "We are a tour operator and would like to list our cooking classes.", status: "NEW", ago: 1 },
    { name: "Park Min", email: "park.min@example.com", topic: "support", message: "저희 샵의 한국어 페이지가 영어로 보입니다.", status: "NEW", ago: 0.5 },
    { name: "Ana Souza", email: "ana.souza@example.com", topic: "general", message: "Is there a mobile app for shop owners?", status: "DONE", note: "No: the dashboard works in a phone browser.", ago: 20 },
  ];
  await db.insert(schema.contactMessages).values(messages.map((m) => ({ name: m.name, email: m.email, topic: m.topic, message: m.message, status: m.status, note: m.note ?? "", createdAt: new Date(now - m.ago * DAY), updatedAt: new Date(now - (m.ago / 2) * DAY) })));

  const shops = new Map((await db.select({ id: schema.organizations.id, slug: schema.organizations.slug }).from(schema.organizations)).map((o) => [o.slug, o.id]));
  const reports: Array<{ slug: string; reason: string; description: string; email: string | null; status: "OPEN" | "RESOLVED" | "DISMISSED"; note?: string; ago: number }> = [
    { slug: "goldennoodle", reason: "SCAM", description: "The price on the page is half of what they asked at the door.", email: "angry.guest@example.com", status: "OPEN", ago: 3 },
    { slug: "lotusceramics", reason: "INAPPROPRIATE", description: "A photo on the page is not theirs.", email: null, status: "DISMISSED", note: "Checked: the photo is licensed.", ago: 12 },
    { slug: "tokyotea", reason: "OTHER", description: "The opening hours on the page are wrong.", email: "visitor@example.com", status: "RESOLVED", note: "The owner corrected the hours.", ago: 8 },
    { slug: "whiskladle", reason: "PHISHING", description: "I received an email asking me to pay to another account.", email: "worried@example.com", status: "OPEN", ago: 1 },
  ];
  for (const r of reports) {
    const orgId = shops.get(r.slug);
    if (!orgId) continue;
    await db.insert(schema.siteReports).values({
      organizationId: orgId, reason: r.reason, description: r.description, reporterEmail: r.email, status: r.status, ...(r.note ? { note: r.note } : {}), createdAt: new Date(now - r.ago * DAY),
      ...(r.status === "OPEN" ? {} : { handledBy: admin.id, handledAt: new Date(now - (r.ago - 1) * DAY) }),
    });
  }

  // the Terms and the Privacy Policy: version 1 published (a major one: epoch 1) in English and Vietnamese; a draft of version 2 of the Terms waits
  const texts = {
    terms: { en: "# Terms of Service\n\nThese are demo terms for development. A shop owner agrees to run honest workshops, to keep prices true and to answer guests. A guest agrees to arrive on time.", vi: "# Điều khoản dịch vụ\n\nĐây là điều khoản mẫu cho môi trường phát triển. Chủ shop cam kết tổ chức workshop trung thực, giữ giá đúng và phản hồi khách. Khách cam kết đến đúng giờ." },
    privacy: { en: "# Privacy Policy\n\nDemo policy for development. We keep the data needed to run a booking and delete it on request.", vi: "# Chính sách quyền riêng tư\n\nChính sách mẫu cho môi trường phát triển. Chúng tôi giữ dữ liệu cần thiết cho việc đặt chỗ và xóa khi được yêu cầu." },
  } as const;
  for (const kind of ["terms", "privacy"] as const) {
    for (const locale of ["en", "vi"] as const) {
      const content = texts[kind][locale];
      await db.insert(schema.legalDocuments).values({ kind, locale, content, version: 1, updatedBy: admin.id });
      await db.insert(schema.legalVersions).values({ kind, locale, version: 1, content, status: "PUBLISHED", major: true, epoch: 1, createdBy: admin.id, publishedBy: admin.id, publishedAt: new Date(now - 60 * DAY), createdAt: new Date(now - 61 * DAY) });
    }
  }
  await db.insert(schema.legalVersions).values({ kind: "terms", locale: "en", version: 2, content: `${texts.terms.en}\n\n## New in version 2\n\nGuests may cancel free of charge up to 24 hours before a session (a draft: publish it as a major change to see every account asked to agree again).`, status: "DRAFT", createdBy: admin.id });
  for (const u of await db.select({ id: schema.users.id, status: schema.users.status }).from(schema.users)) {
    if (u.status !== "ACTIVE") continue;
    for (const kind of ["terms", "privacy"] as const) await db.insert(schema.legalConsents).values({ userId: u.id, kind, epoch: 1, version: 1, locale: "en", acceptedAt: new Date(now - 59 * DAY) }).onConflictDoNothing();
  }
}

/**
 * Rates of their own for some shops (different from the defaults, so the screens show that each shop has its own) and the months that are over are closed, as the worker does every hour. Then the
 * customer area (profiles, favorites, who is listed), the wallet, the invites. Safe to run again: what exists is kept.
 */
export async function seedFinance(db: Database): Promise<{ closed: number }> {
  const custom: Record<string, { maintenanceBps: number; serviceBps: number; affiliateBps: number; inviteBonusBps: number }> = {
    whiskladle: { maintenanceBps: 800, serviceBps: 1200, affiliateBps: 500, inviteBonusBps: 300 },
    tokyotea: { maintenanceBps: 1000, serviceBps: 1000, affiliateBps: 800, inviteBonusBps: 200 },
    seoulkitchen: { maintenanceBps: 500, serviceBps: 1500, affiliateBps: 300, inviteBonusBps: 100 },
  };
  for (const [slug, rates] of Object.entries(custom)) {
    const [shop] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, slug)).limit(1);
    if (!shop) continue;
    await db.insert(schema.organizationFeeSettings).values({ organizationId: shop.id, ...rates }).onConflictDoNothing();
    // the demo history is long: these rates apply to the whole demo past (a change made later only reaches what is paid after it, D24)
    await db.insert(schema.organizationFeeRates).values({ organizationId: shop.id, effectiveFrom: new Date(0), ...rates }).onConflictDoNothing();
  }
  const { closed } = await new FinanceService(db, new AuditService(db)).closeMonths();
  await seedWallet(db);
  await seedInvites(db);
  await seedCustomerArea(db);
  await seedPlatform(db);
  return { closed };
}

/** Profiles for most of the customers (what a customer fills in when registering) and favorites in the shops that are listed. Written once: a profile that exists is kept. */
async function seedCustomerArea(db: Executor): Promise<void> {
  const users = new Map((await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users)).map((u) => [u.email, u.id]));
  const categories = ["COOKING", "BAKING", "COFFEE_TEA", "POTTERY", "CRAFTS", "ART", "WELLNESS", "DRINKS"];
  const genders = ["FEMALE", "MALE", "OTHER", null] as const;
  for (const [i, g] of GUESTS.entries()) {
    const id = users.get(g.email);
    if (!id || i >= 12) continue; // the last guests have no profile yet
    const cats = [categories[i % 8]!, categories[(i + 2) % 8]!, categories[(i + 5) % 8]!];
    await db.insert(schema.customerProfiles).values({
      userId: id, phone: g.phone, country: g.country, birthDate: `${1980 + i}-0${(i % 9) + 1}-1${i % 9}`, favoriteCategories: cats, gender: genders[i % 4] ?? null, socials: i % 3 === 0 ? { INSTAGRAM: g.name.toLowerCase().replace(/\s+/g, ".") } : {}, consentAt: new Date(),
    }).onConflictDoNothing();
  }
  // favorites: each of the first ten customers saved two or three workshops of the shops that are listed
  const listed = await db.select({ id: schema.workshops.id, organizationId: schema.workshops.organizationId }).from(schema.workshops)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.workshops.organizationId))
    .where(sql`${schema.organizations.showOnCustomerPage} AND ${schema.workshops.status} = 'ACTIVE'`);
  for (const [i, g] of GUESTS.slice(0, 10).entries()) {
    const id = users.get(g.email);
    if (!id) continue;
    for (let k = 0; k < 2 + (i % 2); k++) {
      const w = listed[(i * 3 + k * 5) % listed.length];
      if (w) await db.insert(schema.favoriteWorkshops).values({ userId: id, organizationId: w.organizationId, workshopId: w.id, createdAt: new Date(Date.now() - (i + k) * DAY) }).onConflictDoNothing();
    }
  }
}

/** The demo customer gets an invite link and two friends who registered with it: one long ago (the bookings they made since are counted) and one just now. Written once. */
async function seedInvites(db: Executor): Promise<void> {
  const [emma] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.customer)).limit(1);
  if (!emma) return;
  const [has] = await db.select({ userId: schema.inviteLinks.userId }).from(schema.inviteLinks).where(eq(schema.inviteLinks.userId, emma.id)).limit(1);
  if (has) return;
  await db.insert(schema.inviteLinks).values({ userId: emma.id, code: newCode("I") });
  const friends = [GUESTS[1], GUESTS[2]];
  const ages = [50, 0]; // days ago
  for (const [i, g] of friends.entries()) {
    const [friend] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, g!.email)).limit(1);
    if (friend) await db.insert(schema.referrals).values({ inviterUserId: emma.id, friendUserId: friend.id, createdAt: new Date(Date.now() - ages[i]! * DAY) }).onConflictDoNothing();
  }
}

/** The demo customer gets a wallet: some credits written by hand and one withdrawal of each state. Written once. */
async function seedWallet(db: Executor): Promise<void> {
  const [emma] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.customer)).limit(1);
  const [root] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin)).limit(1);
  if (!emma) return;
  const [existing] = await db.select({ id: schema.walletCredits.id }).from(schema.walletCredits).where(eq(schema.walletCredits.userId, emma.id)).limit(1);
  if (existing) return;
  const credits: [("AFFILIATE" | "REFERRAL"), number, string][] = [["AFFILIATE", 160_000, "Demo credit (an adjustment made by hand)"], ["AFFILIATE", 90_000, "Demo credit (an adjustment made by hand)"], ["REFERRAL", 100_000, "Demo credit (an adjustment made by hand)"]];
  for (const [source, amount, note] of credits) await db.insert(schema.walletCredits).values({ userId: emma.id, source, currency: "VND", amount, note });
  const number = sql`'WD-' || lpad(nextval('withdrawal_number_seq')::text, 4, '0')`;
  const bank = { bankName: "Demo Bank", bankAccountNumber: "000011112222", bankAccountHolder: "Emma Wilson" }; // made up: not a real account
  await db.insert(schema.withdrawals).values([
    { number, userId: emma.id, source: "AFFILIATE", currency: "VND", amount: 100_000, ...bank, status: "PAID", requestedAt: new Date(Date.now() - 20 * DAY), processedAt: new Date(Date.now() - 18 * DAY), processedBy: root?.id ?? null },
    { number, userId: emma.id, source: "AFFILIATE", currency: "VND", amount: 50_000, ...bank, status: "REJECTED", reason: "Bank details are missing (demo)", requestedAt: new Date(Date.now() - 9 * DAY), processedAt: new Date(Date.now() - 8 * DAY), processedBy: root?.id ?? null },
    { number, userId: emma.id, source: "REFERRAL", currency: "VND", amount: 60_000, ...bank, status: "PENDING", requestedAt: new Date(Date.now() - 1 * DAY) },
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
