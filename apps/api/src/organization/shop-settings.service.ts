import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { LOCALES, checkCustomDomain } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { DB, type Database } from "../db/db.module";
import { bookings, organizationMembers, organizations, users } from "../db/schema";
import { OutboxService } from "../outbox/outbox.service";
import { DNS, type DnsResolver } from "./dns";

const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Shop not found." });

export interface ShopSettingsInput {
  name?: string; contactEmail?: string; contactPhone?: string; whatsapp?: string; address?: string; mapsUrl?: string; country?: string; timezone?: string; currency?: string; defaultLocale?: string; enabledLocales?: string[];
}
const FIELDS = ["name", "contactEmail", "contactPhone", "whatsapp", "address", "mapsUrl", "country", "timezone", "currency", "defaultLocale", "enabledLocales"] as const;

const isTimezone = (tz: string): boolean => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
const isCurrency = (code: string): boolean => (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("currency").includes(code);

/**
 * The settings of a shop (FR-ORG-02, FR-ADM-09): who edits them is the owner or the platform administrator (the same rules; the slug is never changed by anybody, BR-21) and the own domain of the
 * shop (D13). An edit by the administrator tells the owner by email. The audit lists the names of the fields that changed, never what they hold (a phone number is personal data); a domain is not
 * secret, so its old and new value are kept.
 */
@Injectable()
export class ShopSettingsService {
  constructor(
    @Inject(DB) private readonly db: Database, @Inject(ENV) private readonly env: Env, @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService, @Inject(DNS) private readonly dns: DnsResolver,
  ) {}

  private view(o: typeof organizations.$inferSelect) {
    return {
      id: o.id, slug: o.slug, name: o.name, status: o.status, contactEmail: o.contactEmail, contactPhone: o.contactPhone, whatsapp: o.whatsapp ?? "", address: o.address, mapsUrl: o.mapsUrl, country: o.country,
      timezone: o.timezone, currency: o.currency, defaultLocale: o.defaultLocale, enabledLocales: o.enabledLocales, customDomain: o.customDomain, customDomainVerified: Boolean(o.customDomainVerifiedAt),
    };
  }

  /** The owners of the shop (who are told when an administrator changes it). */
  private async ownerEmails(executor: Database | Parameters<Parameters<Database["transaction"]>[0]>[0], organizationId: string) {
    return executor.select({ email: users.email, name: users.fullName, locale: users.uiLocale }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(and(eq(organizationMembers.organizationId, organizationId), eq(users.status, "ACTIVE")));
  }

  /** `PATCH /organization` (the owner) and `PATCH /admin/organizations/{id}` (the administrator): only what is sent changes; nothing changes when nothing differs. */
  async update(organizationId: string, input: ShopSettingsInput, actor: Actor, by: { admin: boolean; reason?: string | undefined } = { admin: false }) {
    const result = await this.db.transaction(async (tx) => {
      const [o] = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1).for("update");
      if (!o) throw notFound();
      const next = { ...o, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as typeof o;
      const fields: Record<string, string> = {};
      if (input.country !== undefined && !/^[A-Z]{2}$/.test(next.country)) fields.country = "invalid";
      if (input.timezone !== undefined && !isTimezone(next.timezone)) fields.timezone = "invalid";
      if (input.currency !== undefined && !isCurrency(next.currency)) fields.currency = "invalid";
      if (input.enabledLocales !== undefined && (next.enabledLocales.length === 0 || next.enabledLocales.some((l) => !(LOCALES as readonly string[]).includes(l)))) fields.enabledLocales = "invalid";
      if ((input.defaultLocale !== undefined || input.enabledLocales !== undefined) && !fields.enabledLocales && !next.enabledLocales.includes(next.defaultLocale)) fields.defaultLocale = "notEnabled"; // the default must be one of the enabled languages
      if (Object.keys(fields).length > 0) throw invalid(fields);
      const changed = FIELDS.filter((f) => JSON.stringify((o as Record<string, unknown>)[f]) !== JSON.stringify((next as Record<string, unknown>)[f]));
      if (changed.length === 0) return { shop: this.view(o), changed: [] as string[], warnings: [] as string[] };
      const [row] = await tx.update(organizations).set({ ...Object.fromEntries(changed.map((f) => [f, (next as Record<string, unknown>)[f]])), updatedAt: new Date() }).where(eq(organizations.id, organizationId)).returning();
      // A change of the time zone or of the currency of a shop that has bookings is allowed, and the old data is NOT converted: the screen warns about it.
      const warnings: string[] = [];
      if (changed.includes("timezone") || changed.includes("currency")) {
        const [has] = await tx.select({ n: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.organizationId, organizationId));
        if ((has?.n ?? 0) > 0) warnings.push(...changed.filter((f) => f === "timezone" || f === "currency").map((f) => `${f}ChangedWithBookings`));
      }
      await this.audit.record({ organizationId, actorUserId: actor.userId, action: "shop.profile_update", entityType: "organization", entityId: organizationId, after: { fields: changed, ...(by.admin ? { by: "ADMIN" } : {}) }, ip: actor.ip }, tx);
      if (by.admin) {
        for (const owner of await this.ownerEmails(tx, organizationId)) {
          await this.outbox.enqueueEmail(tx, { name: "admin-edit-notice", to: owner.email, locale: owner.locale, data: { name: owner.name, shop: row!.name, what: { kind: "SHOP_SETTINGS", detail: changed.join(", ") }, reason: by.reason ?? "" } }, organizationId);
        }
      }
      return { shop: this.view(row!), changed: [...changed], warnings };
    });
    if (by.admin && result.changed.length > 0) void this.outbox.wake();
    return { ...result.shop, changed: result.changed, warnings: result.warnings };
  }

  // ---- the own domain (D13) --------------------------------------------------------------------------------------------------------------------------------------

  private target(slug: string): string {
    return `${slug}.${this.env.PLATFORM_DOMAIN}`;
  }

  async domain(organizationId: string) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!o) throw notFound();
    return { domain: o.customDomain ?? "", verified: Boolean(o.customDomainVerifiedAt), target: this.target(o.slug) };
  }

  /**
   * Puts, changes or removes (an empty value) the own domain of a shop. The text is cleaned (a pasted address works) and checked with the shared rule; one domain belongs to one shop (`409 DOMAIN_TAKEN`).
   * A new domain counts only after its DNS was checked (D13, even when the administrator sets it): `verified` is false until then.
   */
  async setDomain(organizationId: string, raw: string, actor: Actor, by: { admin: boolean } = { admin: false }) {
    if (raw.length > 300) throw invalid({ domain: "tooLong" });
    const checked = checkCustomDomain(raw, this.env.PLATFORM_DOMAIN);
    if (!checked.ok) throw invalid({ domain: checked.error === "PLATFORM" ? "platform" : "invalid" });
    try {
      await this.db.transaction(async (tx) => {
        const [o] = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1).for("update");
        if (!o) throw notFound();
        const next = checked.domain === "" ? null : checked.domain;
        if ((o.customDomain ?? null) === next) return;
        await tx.update(organizations).set({ customDomain: next, customDomainVerifiedAt: null, updatedAt: new Date() }).where(eq(organizations.id, organizationId));
        await this.audit.record({ organizationId, actorUserId: actor.userId, action: next ? "shop.domain_set" : "shop.domain_remove", entityType: "organization", entityId: organizationId, before: { domain: o.customDomain }, after: { domain: next, ...(by.admin ? { by: "ADMIN" } : {}) }, ip: actor.ip }, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: "DOMAIN_TAKEN", message: "This domain belongs to another shop." });
      throw error;
    }
    return this.domain(organizationId);
  }

  /** `POST /shop/domain/verify`: looks at the DNS: the domain must have a CNAME to `{slug}.{PLATFORM_DOMAIN}`. Until it does the shop keeps using the address of the system. */
  async verifyDomain(organizationId: string, actor: Actor) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!o) throw notFound();
    if (!o.customDomain) throw new ConflictException({ code: "NO_DOMAIN", message: "This shop has no own domain." });
    const target = this.target(o.slug);
    const found = (await this.dns.cname(o.customDomain).catch(() => [])).map((c) => c.toLowerCase().replace(/\.$/, ""));
    const verified = found.includes(target);
    if (verified && !o.customDomainVerifiedAt) {
      await this.db.transaction(async (tx) => {
        await tx.update(organizations).set({ customDomainVerifiedAt: new Date() }).where(and(eq(organizations.id, organizationId), eq(organizations.customDomain, o.customDomain!)));
        await this.audit.record({ organizationId, actorUserId: actor.userId, action: "shop.domain_verify", entityType: "organization", entityId: organizationId, after: { domain: o.customDomain }, ip: actor.ip }, tx);
      });
    }
    return { domain: o.customDomain, verified: verified || Boolean(o.customDomainVerifiedAt), target, found };
  }

  /**
   * `GET /public/tls/ask?domain=`: may the front server (Caddy, on-demand TLS) ask a certificate for this host? Only for a host the platform really serves: the platform's own two hosts, the
   * `{slug}.PLATFORM_DOMAIN` of an ACTIVE shop, or the verified own domain of an ACTIVE shop. Anything else is a `404`, so nobody can make the server ask for a certificate for an arbitrary
   * name (it would burn the limits of the certificate authority). The answer holds no data. The front server calls it on the internal network; the public site does not route it.
   */
  async tlsAllowed(domain: string): Promise<void> {
    const host = domain.trim().toLowerCase();
    const notServed = () => new NotFoundException({ code: "NOT_FOUND", message: "Unknown host." });
    if (host.length === 0 || host.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) throw notServed();
    const platform = this.env.PLATFORM_DOMAIN.toLowerCase();
    if (host === platform || host === `app.${platform}`) return;
    if (host.endsWith(`.${platform}`)) {
      const slug = host.slice(0, -(platform.length + 1));
      if (slug.includes(".")) throw notServed();
      const [o] = await this.db.select({ status: organizations.status }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (!o || o.status !== "ACTIVE") throw notServed();
      return;
    }
    await this.hostLookup(host);
  }

  /** `GET /public/domains/{host}`: which shop an own domain belongs to (for the proxy that rewrites the host and for the certificate check of the front server). Only a verified domain of an ACTIVE shop. */
  async hostLookup(host: string): Promise<{ slug: string }> {
    const [o] = await this.db.select({ slug: organizations.slug, status: organizations.status, verifiedAt: organizations.customDomainVerifiedAt }).from(organizations).where(eq(organizations.customDomain, host.trim().toLowerCase())).limit(1);
    if (!o || o.status !== "ACTIVE" || !o.verifiedAt) throw new NotFoundException({ code: "NOT_FOUND", message: "Unknown host." });
    return { slug: o.slug };
  }
}
