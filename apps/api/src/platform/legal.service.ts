import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { LOCALES } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database, type Executor } from "../db/db.module";
import { legalConsents, legalDocuments, legalVersions, platformSettings, users } from "../db/schema";

export type LegalKind = "terms" | "privacy";
const KINDS: LegalKind[] = ["terms", "privacy"];
const MAX_LENGTH = 50_000;

const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const notFound = (what: string) => new NotFoundException({ code: "NOT_FOUND", message: `${what} not found.` });
const isLocale = (v: string): boolean => (LOCALES as readonly string[]).includes(v);

type Epochs = Record<LegalKind, number>;
const EPOCH_KEY = "legal_epoch";

/**
 * The Terms of Service and the Privacy Policy (FR-ADM-23, D17). A text is written as a DRAFT and goes live only when somebody PUBLISHES it (a step of its own: whoever has the authority, a lawyer
 * for example, checks the draft first). Every version stays for ever and can be read again or put back as a new draft. A publish can be marked MAJOR: from then on every user has to agree again
 * (`mustAccept`); what each user agreed to, with the version, the language and the time, is kept. Plain text only: a blank line is a new paragraph, `# ` a heading, `- ` a list item, no HTML.
 * The audit lines name the document, the language and the version, never the text.
 */
@Injectable()
export class LegalService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  private async epochs(executor: Executor, lock = false): Promise<Epochs> {
    const query = executor.select().from(platformSettings).where(eq(platformSettings.key, EPOCH_KEY)).limit(1);
    const [row] = lock ? await query.for("update") : await query;
    const v = (row?.value ?? {}) as Partial<Epochs>;
    return { terms: Number.isInteger(v.terms) ? v.terms! : 0, privacy: Number.isInteger(v.privacy) ? v.privacy! : 0 };
  }

  private checkInput(locale: string, content?: string): void {
    if (!isLocale(locale)) throw invalid({ locale: "invalid" });
    if (content !== undefined && content.length > MAX_LENGTH) throw invalid({ content: "tooLong" });
  }

  // ---- the administrator -------------------------------------------------------------------------------------------------------------------------------------

  /** `GET /admin/legal/{kind}`: what is live, the drafts, how many major publishes there were, and how many active users agreed to the current version. */
  async overview(kind: LegalKind) {
    const live = await this.db.select({ d: legalDocuments, by: users.email }).from(legalDocuments).leftJoin(users, eq(users.id, legalDocuments.updatedBy)).where(eq(legalDocuments.kind, kind));
    const drafts = await this.db.select({ v: legalVersions, by: users.email }).from(legalVersions).leftJoin(users, eq(users.id, legalVersions.createdBy)).where(and(eq(legalVersions.kind, kind), eq(legalVersions.status, "DRAFT")));
    const epoch = (await this.epochs(this.db))[kind];
    const [stats] = (await this.db.execute(sql`
      select (select count(*)::int from users where status = 'ACTIVE') as active,
             (select count(*)::int from legal_consents c join users u on u.id = c.user_id where c.kind = ${kind} and c.epoch = ${epoch} and u.status = 'ACTIVE') as agreed`)).rows as { active: number; agreed: number }[];
    return {
      kind, epoch, consents: { agreed: Number(stats?.agreed ?? 0), activeUsers: Number(stats?.active ?? 0) },
      documents: Object.fromEntries(live.map(({ d, by }) => [d.locale, { content: d.content, version: d.version, updatedAt: d.updatedAt.toISOString(), updatedBy: by }])),
      drafts: Object.fromEntries(drafts.map(({ v, by }) => [v.locale, { content: v.content, version: v.version, updatedAt: v.updatedAt.toISOString(), updatedBy: by }])),
    };
  }

  /** `PUT /admin/legal/{kind} {locale, content}`: saves the DRAFT of one language (it is not live). An empty text throws the draft away. */
  async saveDraft(kind: LegalKind, input: { locale: string; content: string }, actor: Actor) {
    const content = input.content.trim();
    this.checkInput(input.locale, content);
    await this.db.transaction(async (tx) => {
      const [draft] = await tx.select().from(legalVersions).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, input.locale), eq(legalVersions.status, "DRAFT"))).limit(1).for("update");
      if (content === "") {
        if (draft) {
          await tx.delete(legalVersions).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, input.locale), eq(legalVersions.status, "DRAFT")));
          await this.audit.record({ actorUserId: actor.userId, action: "legal.draft_delete", entityType: "legal_document", entityId: `${kind}:${input.locale}`, ip: actor.ip }, tx);
        }
        return;
      }
      if (draft) {
        if (draft.content === content) return;
        await tx.update(legalVersions).set({ content, updatedAt: new Date() }).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, input.locale), eq(legalVersions.version, draft.version)));
      } else {
        const [top] = await tx.select({ n: sql<number>`coalesce(max(${legalVersions.version}), 0)::int` }).from(legalVersions).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, input.locale)));
        await tx.insert(legalVersions).values({ kind, locale: input.locale, version: (top?.n ?? 0) + 1, content, status: "DRAFT", createdBy: actor.userId });
      }
      await this.audit.record({ actorUserId: actor.userId, action: "legal.draft_save", entityType: "legal_document", entityId: `${kind}:${input.locale}`, ip: actor.ip }, tx);
    });
    return this.overview(kind);
  }

  /**
   * `POST /admin/legal/{kind}/publish {locale, major?}`: the draft of that language goes live as the next version (`409 NO_DRAFT` when there is none). `major: true` makes every user agree again.
   * The publisher is recorded (a draft is checked by whoever has the authority before this step).
   */
  async publish(kind: LegalKind, input: { locale: string; major?: boolean | undefined }, actor: Actor) {
    this.checkInput(input.locale);
    await this.db.transaction(async (tx) => {
      const [draft] = await tx.select().from(legalVersions).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, input.locale), eq(legalVersions.status, "DRAFT"))).limit(1).for("update");
      if (!draft) throw new ConflictException({ code: "NO_DRAFT", message: "There is no draft of this language to publish." });
      const epochs = await this.epochs(tx, true);
      const major = input.major === true;
      if (major) {
        epochs[kind] += 1;
        await tx.insert(platformSettings).values({ key: EPOCH_KEY, value: { ...epochs }, updatedBy: actor.userId }).onConflictDoUpdate({ target: platformSettings.key, set: { value: { ...epochs }, updatedAt: new Date(), updatedBy: actor.userId } });
      }
      const now = new Date();
      await tx.update(legalVersions).set({ status: "PUBLISHED", major, epoch: epochs[kind], publishedBy: actor.userId, publishedAt: now, updatedAt: now }).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, input.locale), eq(legalVersions.version, draft.version)));
      await tx.insert(legalDocuments).values({ kind, locale: input.locale, content: draft.content, version: draft.version, updatedBy: actor.userId, updatedAt: now })
        .onConflictDoUpdate({ target: [legalDocuments.kind, legalDocuments.locale], set: { content: draft.content, version: draft.version, updatedBy: actor.userId, updatedAt: now } });
      await this.audit.record({ actorUserId: actor.userId, action: "legal.publish", entityType: "legal_document", entityId: `${kind}:${input.locale}`, after: { version: draft.version, major }, ip: actor.ip }, tx);
    });
    return this.overview(kind);
  }

  /** `DELETE /admin/legal/{kind}/{locale}`: takes a language off the public page (the history stays and the version can be put back as a draft). */
  async unpublish(kind: LegalKind, locale: string, actor: Actor) {
    this.checkInput(locale);
    await this.db.transaction(async (tx) => {
      const removed = await tx.delete(legalDocuments).where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.locale, locale))).returning({ version: legalDocuments.version });
      if (removed.length === 0) throw notFound("Document");
      await this.audit.record({ actorUserId: actor.userId, action: "legal.unpublish", entityType: "legal_document", entityId: `${kind}:${locale}`, after: { version: removed[0]!.version }, ip: actor.ip }, tx);
    });
    return this.overview(kind);
  }

  /** `GET /admin/legal/{kind}/versions?locale=`: the history of one language, newest first (the text of a version is read one at a time). */
  async versions(kind: LegalKind, locale: string) {
    this.checkInput(locale);
    const rows = await this.db.select({ v: legalVersions, author: sql<string | null>`(select email from users where id = ${legalVersions.createdBy})`, publisher: sql<string | null>`(select email from users where id = ${legalVersions.publishedBy})` })
      .from(legalVersions).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, locale))).orderBy(desc(legalVersions.version));
    return { kind, locale, items: rows.map(({ v, author, publisher }) => ({ version: v.version, status: v.status, major: v.major, epoch: v.epoch, length: v.content.length, createdAt: v.createdAt.toISOString(), createdBy: author, publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null, publishedBy: publisher })) };
  }

  async version(kind: LegalKind, locale: string, version: number) {
    this.checkInput(locale);
    const [v] = await this.db.select().from(legalVersions).where(and(eq(legalVersions.kind, kind), eq(legalVersions.locale, locale), eq(legalVersions.version, version))).limit(1);
    if (!v) throw notFound("Version");
    return { kind, locale, version: v.version, status: v.status, major: v.major, content: v.content, createdAt: v.createdAt.toISOString(), publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null };
  }

  /** `POST /admin/legal/{kind}/versions/{version}/restore {locale}`: a published version becomes the draft of its language (it replaces a draft that was there). Nothing goes live until it is published. */
  async restore(kind: LegalKind, locale: string, version: number, actor: Actor) {
    this.checkInput(locale);
    const old = await this.version(kind, locale, version);
    if (old.status !== "PUBLISHED") throw new ConflictException({ code: "NOT_PUBLISHED", message: "Only a published version can be put back." });
    await this.saveDraft(kind, { locale, content: old.content }, actor);
    await this.audit.record({ actorUserId: actor.userId, action: "legal.restore", entityType: "legal_document", entityId: `${kind}:${locale}`, after: { fromVersion: version }, ip: actor.ip });
    return this.overview(kind);
  }

  // ---- the public page --------------------------------------------------------------------------------------------------------------------------------------

  /** `GET /public/legal/{kind}?locale=`: the text that is live. A language with no text falls back to English (`fallback: true`); with none at all, `available: false`. */
  async publicDocument(kind: LegalKind, locale: string) {
    const rows = await this.db.select().from(legalDocuments).where(eq(legalDocuments.kind, kind));
    const shown = rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "en");
    if (!shown) return { kind, available: false as const };
    return { kind, available: true as const, locale: shown.locale, fallback: shown.locale !== locale, version: shown.version, epoch: (await this.epochs(this.db))[kind], updatedAt: shown.updatedAt.toISOString(), content: shown.content };
  }

  // ---- what the users agreed to ------------------------------------------------------------------------------------------------------------------------------

  /** `GET /legal/consent`: for each document, what is live, what the user agreed to, and whether they must agree again (a major version was published after what they agreed to, or they never agreed). */
  async consentStatus(userId: string, locale = "en") {
    const epochs = await this.epochs(this.db);
    const out = [];
    for (const kind of KINDS) {
      const docs = await this.db.select().from(legalDocuments).where(eq(legalDocuments.kind, kind));
      const shown = docs.find((d) => d.locale === locale) ?? docs.find((d) => d.locale === "en") ?? docs[0];
      const [last] = await this.db.select().from(legalConsents).where(and(eq(legalConsents.userId, userId), eq(legalConsents.kind, kind))).orderBy(desc(legalConsents.epoch)).limit(1);
      out.push({
        kind, published: shown ? { version: shown.version, locale: shown.locale } : null, epoch: epochs[kind],
        accepted: last ? { epoch: last.epoch, version: last.version, locale: last.locale, acceptedAt: last.acceptedAt.toISOString() } : null,
        mustAccept: Boolean(shown) && (!last || last.epoch < epochs[kind]),
      });
    }
    return { items: out, mustAcceptAny: out.some((o) => o.mustAccept) };
  }

  /** What a user agrees to is recorded for the epoch that is current (once: a second time changes nothing). A document that is not published cannot be agreed to (`409 NOT_PUBLISHED`). */
  async consent(userId: string, kinds: LegalKind[], locale: string, actor: Actor) {
    await this.db.transaction(async (tx) => {
      await this.record(tx, userId, kinds, locale, true);
      await this.audit.record({ actorUserId: userId, action: "legal.consent", entityType: "user", entityId: userId, after: { kinds }, ip: actor.ip }, tx);
    });
    return this.consentStatus(userId, locale);
  }

  /** Writes the consent rows (in the transaction of the caller). `strict`: a document that is not published is a `409`; otherwise it is skipped (a signup before any text exists). */
  async record(executor: Executor, userId: string, kinds: readonly LegalKind[], locale: string, strict: boolean): Promise<void> {
    const epochs = await this.epochs(executor);
    for (const kind of kinds) {
      const docs = await executor.select().from(legalDocuments).where(eq(legalDocuments.kind, kind));
      const shown = docs.find((d) => d.locale === locale) ?? docs.find((d) => d.locale === "en") ?? docs[0];
      if (!shown) {
        if (strict) throw new ConflictException({ code: "NOT_PUBLISHED", message: "This document is not published.", details: { kind } });
        continue;
      }
      await executor.insert(legalConsents).values({ userId, kind, epoch: epochs[kind], version: shown.version, locale: shown.locale }).onConflictDoNothing();
    }
  }
}
