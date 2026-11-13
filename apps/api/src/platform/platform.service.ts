import { Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { LOCALES } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database, type Executor } from "../db/db.module";
import { legalDocuments, platformSettings, users } from "../db/schema";

const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });

export interface PlatformValues { resetLinkHours: number; contactPerHour: number }
export const DEFAULT_VALUES: PlatformValues = { resetLinkHours: 24, contactPerHour: 5 };

export const SUPPORT_CHANNELS = ["whatsapp", "phone", "zalo", "email"] as const;
export type SupportContact = Record<(typeof SUPPORT_CHANNELS)[number], string>;

/** The value of a platform setting that an environment variable used to hold: read from the table, the default when the administrator never set it. */
export async function readPlatformValues(executor: Executor): Promise<PlatformValues> {
  const [row] = await executor.select().from(platformSettings).where(eq(platformSettings.key, "settings")).limit(1);
  const v = (row?.value ?? {}) as Partial<PlatformValues>;
  return { resetLinkHours: Number.isInteger(v.resetLinkHours) ? v.resetLinkHours! : DEFAULT_VALUES.resetLinkHours, contactPerHour: Number.isInteger(v.contactPerHour) ? v.contactPerHour! : DEFAULT_VALUES.contactPerHour };
}

const phoneOk = (v: string): boolean => /^[0-9\s+().-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15;
const emailOk = (v: string): boolean => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * What the platform administrator sets for the whole platform (FR-ADM-20 numbers, FR-ADM-07 support channels) and writes for it (FR-ADM-23 Terms and Privacy). Every change is audited with the
 * names of the values and the old and the new ones (never a phone number or an email, never the text of a legal document).
 */
@Injectable()
export class PlatformService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  // ---- settings -----------------------------------------------------------------------------------------------------------------------------------------------

  settings(): Promise<PlatformValues> {
    return readPlatformValues(this.db);
  }

  /** `PUT /admin/settings`: the link of a password reset sent by an administrator lives 1 to 168 hours, the Contact form takes 1 to 100 messages an hour from one client. Takes effect at once. */
  async putSettings(input: PlatformValues, actor: Actor): Promise<PlatformValues> {
    const fields: Record<string, string> = {};
    if (!Number.isInteger(input.resetLinkHours) || input.resetLinkHours < 1 || input.resetLinkHours > 168) fields.resetLinkHours = "range";
    if (!Number.isInteger(input.contactPerHour) || input.contactPerHour < 1 || input.contactPerHour > 100) fields.contactPerHour = "range";
    if (Object.keys(fields).length > 0) throw invalid(fields);
    return this.db.transaction(async (tx) => {
      const before = await readPlatformValues(tx);
      const changes = (Object.keys(DEFAULT_VALUES) as (keyof PlatformValues)[]).filter((k) => before[k] !== input[k]).map((k) => ({ name: k, from: before[k], to: input[k] }));
      await tx.insert(platformSettings).values({ key: "settings", value: { ...input }, updatedBy: actor.userId }).onConflictDoUpdate({ target: platformSettings.key, set: { value: { ...input }, updatedAt: new Date(), updatedBy: actor.userId } });
      if (changes.length > 0) await this.audit.record({ actorUserId: actor.userId, action: "platform.settings_update", entityType: "platform_settings", entityId: "settings", after: { changes }, ip: actor.ip }, tx);
      return { resetLinkHours: input.resetLinkHours, contactPerHour: input.contactPerHour };
    });
  }

  // ---- support contact ----------------------------------------------------------------------------------------------------------------------------------------

  async supportContact(): Promise<SupportContact> {
    const [row] = await this.db.select().from(platformSettings).where(eq(platformSettings.key, "support_contact")).limit(1);
    const v = (row?.value ?? {}) as Partial<SupportContact>;
    return { whatsapp: v.whatsapp ?? "", phone: v.phone ?? "", zalo: v.zalo ?? "", email: v.email ?? "" };
  }

  /** `PUT /admin/support-contact`: the four channels (an empty one is removed). A phone is 7 to 15 digits (digits, spaces and `+ ( ) . -`), the email must be one. The audit lists the channels that changed, not their values. */
  async putSupportContact(input: SupportContact, actor: Actor): Promise<SupportContact> {
    const next = Object.fromEntries(SUPPORT_CHANNELS.map((c) => [c, (input[c] ?? "").trim()])) as SupportContact;
    const fields: Record<string, string> = {};
    for (const c of ["whatsapp", "phone", "zalo"] as const) if (next[c] && !phoneOk(next[c])) fields[c] = "invalid";
    if (next.email && !emailOk(next.email)) fields.email = "invalid";
    if (Object.keys(fields).length > 0) throw invalid(fields);
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, "support_contact")).limit(1).for("update");
      const before = (row?.value ?? {}) as Partial<SupportContact>;
      const changed = SUPPORT_CHANNELS.filter((c) => (before[c] ?? "") !== next[c]);
      await tx.insert(platformSettings).values({ key: "support_contact", value: { ...next }, updatedBy: actor.userId }).onConflictDoUpdate({ target: platformSettings.key, set: { value: { ...next }, updatedAt: new Date(), updatedBy: actor.userId } });
      if (changed.length > 0) await this.audit.record({ actorUserId: actor.userId, action: "platform.support_contact_update", entityType: "platform_settings", entityId: "support_contact", after: { channels: changed }, ip: actor.ip }, tx);
      return next;
    });
  }

  // ---- Terms and Privacy ----------------------------------------------------------------------------------------------------------------------------------------

  /** `GET /admin/legal/{kind}`: the document in every language that has text, with its version, when it was saved and by whom. */
  async legal(kind: "terms" | "privacy") {
    const rows = await this.db.select({ d: legalDocuments, by: users.email }).from(legalDocuments).leftJoin(users, eq(users.id, legalDocuments.updatedBy)).where(eq(legalDocuments.kind, kind));
    return { kind, documents: Object.fromEntries(rows.map(({ d, by }) => [d.locale, { content: d.content, version: d.version, updatedAt: d.updatedAt.toISOString(), updatedBy: by }])) };
  }

  /**
   * `PUT /admin/legal/{kind} {locale, content}`: saves the text of one language (plain text: a blank line is a new paragraph, `# ` a heading, `- ` a list item; no HTML, everything shows as text). The
   * version goes up by one at every change; an empty text removes the language. Audited with the language and the version, never the text.
   */
  async putLegal(kind: "terms" | "privacy", input: { locale: string; content: string }, actor: Actor) {
    const content = input.content.trim();
    if (!(LOCALES as readonly string[]).includes(input.locale)) throw invalid({ locale: "invalid" });
    if (content.length > 50_000) throw invalid({ content: "tooLong" });
    await this.db.transaction(async (tx) => {
      const [prev] = await tx.select().from(legalDocuments).where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.locale, input.locale))).limit(1).for("update");
      if (content === "") {
        if (prev) {
          await tx.delete(legalDocuments).where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.locale, input.locale)));
          await this.audit.record({ actorUserId: actor.userId, action: "legal.update", entityType: "legal_document", entityId: `${kind}:${input.locale}`, after: { removed: true }, ip: actor.ip }, tx);
        }
        return;
      }
      if (prev && prev.content === content) return; // nothing changed: no new version
      const version = (prev?.version ?? 0) + 1;
      await tx.insert(legalDocuments).values({ kind, locale: input.locale, content, version, updatedBy: actor.userId }).onConflictDoUpdate({ target: [legalDocuments.kind, legalDocuments.locale], set: { content, version, updatedAt: new Date(), updatedBy: actor.userId } });
      await this.audit.record({ actorUserId: actor.userId, action: "legal.update", entityType: "legal_document", entityId: `${kind}:${input.locale}`, after: { version }, ip: actor.ip }, tx);
    });
    return this.legal(kind);
  }

  /** `GET /public/legal/{kind}?locale=`: the text a visitor reads. A language with no text falls back to English (`fallback: true`); with none at all, `available: false`. */
  async publicLegal(kind: "terms" | "privacy", locale: string) {
    const rows = await this.db.select().from(legalDocuments).where(eq(legalDocuments.kind, kind));
    const wanted = rows.find((r) => r.locale === locale);
    const shown = wanted ?? rows.find((r) => r.locale === "en");
    if (!shown) return { kind, available: false as const };
    return { kind, available: true as const, locale: shown.locale, fallback: shown.locale !== locale, version: shown.version, updatedAt: shown.updatedAt.toISOString(), content: shown.content };
  }
}
