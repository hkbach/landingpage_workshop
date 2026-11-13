import { Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database, type Executor } from "../db/db.module";
import { platformSettings } from "../db/schema";

const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });

export interface PlatformValues { resetLinkHours: number; contactPerHour: number; /** How long a message of the Contact form is kept (D18). */ contactRetentionMonths: number; /** How long an email that was sent stays in the list of the administrator (D18). */ emailRetentionDays: number }
export const DEFAULT_VALUES: PlatformValues = { resetLinkHours: 24, contactPerHour: 5, contactRetentionMonths: 12, emailRetentionDays: 90 };
const RANGES: Record<keyof PlatformValues, [number, number]> = { resetLinkHours: [1, 168], contactPerHour: [1, 100], contactRetentionMonths: [1, 120], emailRetentionDays: [7, 730] };

export const SUPPORT_CHANNELS = ["whatsapp", "phone", "zalo", "email"] as const;
export type SupportContact = Record<(typeof SUPPORT_CHANNELS)[number], string>;

/** The value of a platform setting that an environment variable used to hold: read from the table, the default when the administrator never set it. */
export async function readPlatformValues(executor: Executor): Promise<PlatformValues> {
  const [row] = await executor.select().from(platformSettings).where(eq(platformSettings.key, "settings")).limit(1);
  const v = (row?.value ?? {}) as Partial<PlatformValues>;
  const pick = (k: keyof PlatformValues): number => (Number.isInteger(v[k]) ? v[k]! : DEFAULT_VALUES[k]);
  return { resetLinkHours: pick("resetLinkHours"), contactPerHour: pick("contactPerHour"), contactRetentionMonths: pick("contactRetentionMonths"), emailRetentionDays: pick("emailRetentionDays") };
}

const phoneOk = (v: string): boolean => /^[0-9\s+().-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15;
const emailOk = (v: string): boolean => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * What the platform administrator sets for the whole platform (FR-ADM-20 numbers, FR-ADM-07 support channels) (the Terms and Privacy are in LegalService). Every change is audited with the
 * names of the values and the old and the new ones (never a phone number or an email).
 */
@Injectable()
export class PlatformService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  // ---- settings -----------------------------------------------------------------------------------------------------------------------------------------------

  settings(): Promise<PlatformValues> {
    return readPlatformValues(this.db);
  }

  /**
   * `PUT /admin/settings`: the link of a password reset sent by an administrator lives 1 to 168 hours, the Contact form takes 1 to 100 messages an hour from one client, a Contact message is kept
   * 1 to 120 months and a sent email 7 to 730 days. A value that is left out keeps what it was. Takes effect at once.
   */
  async putSettings(input: Pick<PlatformValues, "resetLinkHours" | "contactPerHour"> & Partial<PlatformValues>, actor: Actor): Promise<PlatformValues> {
    const fields: Record<string, string> = {};
    for (const k of Object.keys(RANGES) as (keyof PlatformValues)[]) {
      const v = input[k];
      if (v !== undefined && (!Number.isInteger(v) || v < RANGES[k][0] || v > RANGES[k][1])) fields[k] = "range";
    }
    if (Object.keys(fields).length > 0) throw invalid(fields);
    return this.db.transaction(async (tx) => {
      const before = await readPlatformValues(tx);
      const next: PlatformValues = { resetLinkHours: input.resetLinkHours, contactPerHour: input.contactPerHour, contactRetentionMonths: input.contactRetentionMonths ?? before.contactRetentionMonths, emailRetentionDays: input.emailRetentionDays ?? before.emailRetentionDays };
      const changes = (Object.keys(DEFAULT_VALUES) as (keyof PlatformValues)[]).filter((k) => before[k] !== next[k]).map((k) => ({ name: k, from: before[k], to: next[k] }));
      await tx.insert(platformSettings).values({ key: "settings", value: { ...next }, updatedBy: actor.userId }).onConflictDoUpdate({ target: platformSettings.key, set: { value: { ...next }, updatedAt: new Date(), updatedBy: actor.userId } });
      if (changes.length > 0) await this.audit.record({ actorUserId: actor.userId, action: "platform.settings_update", entityType: "platform_settings", entityId: "settings", after: { changes }, ip: actor.ip }, tx);
      return next;
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
}
