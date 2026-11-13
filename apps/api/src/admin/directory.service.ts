import { Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { MAX_CLOSES } from "@workshop/shared";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { shopOrigin } from "../common/origins";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { DB, type Database } from "../db/db.module";

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
const page = (cursor?: string): number => (cursor ? Math.max(0, Math.floor(Number(decodeCursor<{ o: number }>(cursor, ["o"]).o)) || 0) : 0);
const isRealDay = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);

interface Paged { limit: number; cursor?: string | undefined }

/**
 * The lists of the platform administrator (FR-ADM-10 to FR-ADM-14): the workshops, sessions, bookings, customers and landing pages of every shop, read only. Search is case-insensitive; every list is
 * paged with a cursor. Personal data (a guest's email and phone) is shown here because the administrator needs it to look an account or a booking up; none of it is written to a log.
 */
@Injectable()
export class DirectoryService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(ENV) private readonly env: Env) {}

  private async rows<T>(query: SQL): Promise<T[]> {
    return (await this.db.execute(query)).rows as T[];
  }
  private like(q: string | undefined): string | undefined {
    return q?.trim() ? `%${escapeLike(q.trim())}%` : undefined;
  }

  /** `GET /admin/directory/workshops`: the workshops of every shop with the score, the sessions and the bookings. Search: the title in any language, the shop. */
  async workshops(q: Paged & { q?: string | undefined; status?: "ACTIVE" | "DRAFT" | undefined }) {
    const like = this.like(q.q);
    const offset = page(q.cursor);
    const rows = await this.rows<Record<string, unknown>>(sql`
      select w.id, w.title, w.status, w.price_amount, w.currency, w.duration_minutes, w.default_capacity, w.address, o.id as shop_id, o.name as shop_name, o.slug as shop_slug,
             (select count(*)::int from workshop_sessions s where s.organization_id = w.organization_id and s.workshop_id = w.id) as sessions,
             (select count(*)::int from bookings b where b.organization_id = w.organization_id and b.workshop_id = w.id) as bookings,
             (select round(avg(r.stars)::numeric, 1) from workshop_ratings r where r.organization_id = w.organization_id and r.workshop_id = w.id and r.removed_at is null) as rating,
             (select count(*)::int from workshop_ratings r where r.organization_id = w.organization_id and r.workshop_id = w.id and r.removed_at is null) as ratings
        from workshops w join organizations o on o.id = w.organization_id
       where true ${q.status ? sql`and w.status = ${q.status}` : sql``} ${like ? sql`and (w.title::text ilike ${like} escape '\\' or o.name ilike ${like} escape '\\' or o.slug ilike ${like} escape '\\')` : sql``}
       order by w.created_at desc, w.id desc limit ${q.limit + 1} offset ${offset}`);
    return {
      items: rows.slice(0, q.limit).map((r) => ({
        id: r.id, title: r.title, status: r.status, priceAmount: num(r.price_amount), currency: r.currency, durationMinutes: num(r.duration_minutes), defaultCapacity: num(r.default_capacity), address: r.address,
        shop: { id: r.shop_id, name: r.shop_name, slug: r.shop_slug }, sessions: num(r.sessions), bookings: num(r.bookings), rating: { average: r.rating === null ? null : Number(r.rating), count: num(r.ratings) },
      })),
      nextCursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
    };
  }

  /** `GET /admin/directory/sessions`: the sessions of every shop with their history. Search: the code, the workshop, the day (YYYY-MM-DD in the time zone of the shop), the state, a note, the shop; filter: state, closed for good. */
  async sessions(q: Paged & { q?: string | undefined; status?: string | undefined; forGood?: boolean | undefined }) {
    const like = this.like(q.q);
    const offset = page(q.cursor);
    const closes = sql`(select count(*) from jsonb_array_elements(s.session_notes) n where n->>'type' = 'CLOSED')`;
    const rows = await this.rows<Record<string, unknown>>(sql`
      select s.id, s.code, s.starts_at, s.ends_at, s.status, s.capacity, s.reserved_count, s.auto_closed, s.session_notes, w.id as workshop_id, w.title, o.id as shop_id, o.name as shop_name, o.slug as shop_slug
        from workshop_sessions s join workshops w on w.organization_id = s.organization_id and w.id = s.workshop_id join organizations o on o.id = s.organization_id
       where true ${q.status ? sql`and s.status = ${q.status}` : sql``} ${q.forGood ? sql`and s.status = 'CLOSED' and ${closes} >= ${MAX_CLOSES}` : sql``}
         ${like ? sql`and (s.code ilike ${like} escape '\\' or w.title::text ilike ${like} escape '\\' or to_char(s.starts_at at time zone o.timezone, 'YYYY-MM-DD') ilike ${like} escape '\\' or s.status::text ilike ${like} escape '\\' or s.session_notes::text ilike ${like} escape '\\' or o.name ilike ${like} escape '\\' or o.slug ilike ${like} escape '\\')` : sql``}
       order by s.starts_at desc, s.id desc limit ${q.limit + 1} offset ${offset}`);
    return {
      items: rows.slice(0, q.limit).map((r) => ({
        id: r.id, code: r.code, startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), status: r.status, capacity: num(r.capacity), reserved: num(r.reserved_count), autoClosed: r.auto_closed, history: r.session_notes,
        workshop: { id: r.workshop_id, title: r.title }, shop: { id: r.shop_id, name: r.shop_name, slug: r.shop_slug },
        closedForGood: r.status === "CLOSED" && (r.session_notes as { type: string }[]).filter((n) => n.type === "CLOSED").length >= MAX_CLOSES,
      })),
      nextCursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
    };
  }

  /**
   * `GET /admin/directory/bookings`: the bookings of every shop. Search: the booking code, the workshop, the shop, the email of the guest, or the id of the customer or of the account. The days are
   * the days the booking was MADE (in the time zone of its shop, both included): a first day after the last is refused (`422`).
   */
  async bookings(q: Paged & { q?: string | undefined; from?: string | undefined; to?: string | undefined }) {
    const fields: Record<string, string> = {};
    if (q.from && !isRealDay(q.from)) fields.from = "invalid";
    if (q.to && !isRealDay(q.to)) fields.to = "invalid";
    if (!fields.from && !fields.to && q.from && q.to && q.from > q.to) fields.to = "beforeFrom";
    if (Object.keys(fields).length > 0) throw new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
    const like = this.like(q.q);
    const offset = page(q.cursor);
    const asId = q.q?.trim().match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? q.q.trim() : undefined;
    const day = sql`(b.created_at at time zone o.timezone)::date`;
    const rows = await this.rows<Record<string, unknown>>(sql`
      select b.id, b.booking_code, b.status, b.payment_status, b.quantity, b.total_amount, b.discount_amount, b.currency, b.guest_name, b.guest_email, b.guest_phone, b.guest_country, b.created_at, b.checked_in_at, b.customer_id,
             b.special_request, b.cancel_reason, b.cancelled_by, w.id as workshop_id, w.title, s.code as session_code, s.starts_at, s.status as session_status, o.id as shop_id, o.name as shop_name, o.slug as shop_slug, u.id as account_id,
             coalesce((select sum(case when p.type = 'PAYMENT' then p.amount else -p.amount end) from payments p where p.organization_id = b.organization_id and p.booking_id = b.id), 0)::bigint as paid
        from bookings b join workshop_sessions s on s.organization_id = b.organization_id and s.id = b.session_id join workshops w on w.organization_id = b.organization_id and w.id = b.workshop_id
        join organizations o on o.id = b.organization_id left join users u on u.email = lower(b.guest_email)
       where true ${q.from ? sql`and ${day} >= ${q.from}::date` : sql``} ${q.to ? sql`and ${day} <= ${q.to}::date` : sql``}
         ${like ? sql`and (b.booking_code ilike ${like} escape '\\' or w.title::text ilike ${like} escape '\\' or o.name ilike ${like} escape '\\' or o.slug ilike ${like} escape '\\' or b.guest_email ilike ${like} escape '\\' or b.guest_name ilike ${like} escape '\\'${asId ? sql` or b.customer_id = ${asId}::uuid or u.id = ${asId}::uuid` : sql``})` : sql``}
       order by b.created_at desc, b.id desc limit ${q.limit + 1} offset ${offset}`);
    return {
      items: rows.slice(0, q.limit).map((r) => ({
        id: r.id, code: r.booking_code, status: r.status, paymentStatus: r.payment_status, quantity: num(r.quantity), totalAmount: num(r.total_amount), discountAmount: num(r.discount_amount), paidAmount: num(r.paid), currency: r.currency,
        guest: { name: r.guest_name, email: r.guest_email, phone: r.guest_phone, country: r.guest_country }, specialRequest: r.special_request, cancelReason: r.cancel_reason, cancelledBy: r.cancelled_by,
        customerId: r.customer_id, accountId: r.account_id ?? null, createdAt: iso(r.created_at), checkedInAt: r.checked_in_at ? iso(r.checked_in_at) : null,
        workshop: { id: r.workshop_id, title: r.title }, session: { code: r.session_code, startsAt: iso(r.starts_at), status: r.session_status }, shop: { id: r.shop_id, name: r.shop_name, slug: r.shop_slug },
      })),
      nextCursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
    };
  }

  /** `GET /admin/directory/customers`: one line for each email that booked anywhere (the shops it booked in, how many bookings, the first and the last), and the accounts that never booked. Search: email, name, shop. */
  async customers(q: Paged & { q?: string | undefined }) {
    const like = this.like(q.q);
    const booked = await this.rows<Record<string, unknown>>(sql`
      select lower(b.guest_email) as email, (array_agg(b.guest_name order by b.created_at desc))[1] as name, array_agg(distinct o.name order by o.name) as shops, count(*)::int as bookings,
             min(b.created_at) as first_at, max(b.created_at) as last_at, max(u.id::text) as account_id
        from bookings b join organizations o on o.id = b.organization_id left join users u on u.email = lower(b.guest_email)
       where b.guest_email is not null
       group by lower(b.guest_email)
      ${like ? sql`having lower(b.guest_email) ilike ${like.toLowerCase()} escape '\\' or bool_or(b.guest_name ilike ${like} escape '\\') or bool_or(o.name ilike ${like} escape '\\')` : sql``}`);
    const seen = new Set(booked.map((r) => r.email as string));
    const accounts = await this.rows<Record<string, unknown>>(sql`
      select u.id, u.email, u.full_name as name, u.created_at from users u
       where u.status <> 'DISABLED' and u.platform_role is null and not exists (select 1 from organization_members m where m.user_id = u.id)
         ${like ? sql`and (u.email ilike ${like} escape '\\' or u.full_name ilike ${like} escape '\\')` : sql``}`);
    const all = [
      ...booked.map((r) => ({ email: r.email as string, name: r.name as string, shops: r.shops as string[], bookings: num(r.bookings), firstBookingAt: iso(r.first_at), lastBookingAt: iso(r.last_at), accountId: (r.account_id as string | null) ?? null, hasAccount: r.account_id !== null, _at: Date.parse(iso(r.last_at)) })),
      ...accounts.filter((a) => !seen.has(a.email as string)).map((a) => ({ email: a.email as string, name: a.name as string, shops: [] as string[], bookings: 0, firstBookingAt: null as string | null, lastBookingAt: null as string | null, accountId: a.id as string, hasAccount: true, _at: Date.parse(iso(a.created_at)) })),
    ].sort((x, y) => y._at - x._at || x.email.localeCompare(y.email));
    const offset = page(q.cursor);
    return { items: all.slice(offset, offset + q.limit).map(({ _at, ...rest }) => { void _at; return rest; }), nextCursor: offset + q.limit < all.length ? encodeCursor({ o: offset + q.limit }) : null, total: all.length };
  }

  /** `GET /admin/directory/landing-pages`: the shops with their landing pages (which one is live, its version) and the address it is served at. Search: the name or the slug of the shop. */
  async landingPages(q: Paged & { q?: string | undefined }) {
    const like = this.like(q.q);
    const offset = page(q.cursor);
    const shops = await this.rows<Record<string, unknown>>(sql`
      select o.id, o.name, o.slug, o.status, o.custom_domain, o.custom_domain_verified_at,
             coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'templateKey', p.template_key, 'isLive', p.is_live, 'version', p.version, 'publishedAt', p.published_at) order by p.created_at) from site_pages p where p.organization_id = o.id), '[]'::jsonb) as pages
        from organizations o where true ${like ? sql`and (o.name ilike ${like} escape '\\' or o.slug ilike ${like} escape '\\')` : sql``}
       order by o.created_at desc, o.id desc limit ${q.limit + 1} offset ${offset}`);
    return {
      items: shops.slice(0, q.limit).map((o) => ({
        shop: { id: o.id, name: o.name, slug: o.slug, status: o.status }, ownDomain: o.custom_domain ?? null, ownDomainVerified: Boolean(o.custom_domain_verified_at),
        // the address people use: the own domain once it is verified, the address of the system otherwise
        liveUrl: o.custom_domain && o.custom_domain_verified_at ? `https://${o.custom_domain as string}` : shopOrigin(this.env, o.slug as string), pages: o.pages,
      })),
      nextCursor: shops.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
    };
  }
}
