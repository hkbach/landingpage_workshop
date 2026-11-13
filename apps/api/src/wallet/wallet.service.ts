import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { checkAccountHolder, checkAccountNumber, checkBankName, maskAccountNumber, normalizeAccountHolder, normalizeAccountNumber, normalizeBankName } from "@workshop/shared";
import { programEarnings } from "../affiliate/earnings";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database, type Executor } from "../db/db.module";
import { users, walletCredits, withdrawalLimits, withdrawals } from "../db/schema";

export type WalletSource = "AFFILIATE" | "REFERRAL";
type WithdrawalRow = typeof withdrawals.$inferSelect;

const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const num = (v: unknown): number => Number(v ?? 0);

export interface Limits { minAmount: number; maxAmount: number }

/**
 * The wallet of a customer account and the withdrawal requests (FR-CUST-04, FR-ADM-19, D6, D12). Available = earned - pending - paid (a rejected invoice gives its money back), never below 0,
 * for each source (Affiliate, Referrals) and each currency. A request is checked and written under a lock of the wallet, so two requests at once can never take out more than is there. The
 * system does not move money: an administrator pays the invoice outside it and marks it paid. The account always comes from the session, never from the request.
 */
@Injectable()
export class WalletService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  private async limits(executor: Executor, currency: string): Promise<Limits> {
    const [l] = await executor.select().from(withdrawalLimits).where(eq(withdrawalLimits.currency, currency)).limit(1);
    return { minAmount: l?.minAmount ?? 0, maxAmount: l?.maxAmount ?? 0 };
  }

  /** Earned, waiting and paid of one wallet (a source in a currency). */
  private async totals(executor: Executor, userId: string, source: WalletSource, currency: string) {
    const [earned] = await executor.select({ n: sql<string>`coalesce(sum(${walletCredits.amount}), 0)` }).from(walletCredits).where(and(eq(walletCredits.userId, userId), eq(walletCredits.source, source), eq(walletCredits.currency, currency)));
    const rows = await executor.select({ status: withdrawals.status, n: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` }).from(withdrawals)
      .where(and(eq(withdrawals.userId, userId), eq(withdrawals.source, source), eq(withdrawals.currency, currency))).groupBy(withdrawals.status);
    const by = (s: WithdrawalRow["status"]) => num(rows.find((r) => r.status === s)?.n);
    // what was written by hand (credits) plus what the two programs earned from the bookings as they are now
    const program = (await programEarnings(executor, userId)).find((x) => x.source === source && x.currency === currency)?.amount ?? 0;
    const e = num(earned?.n) + program;
    return { earned: e, pending: by("PENDING"), withdrawn: by("PAID"), available: Math.max(0, e - by("PENDING") - by("PAID")) };
  }

  private base(w: WithdrawalRow) {
    return { id: w.id, number: w.number, source: w.source, currency: w.currency, amount: w.amount, status: w.status, reason: w.reason, requestedAt: w.requestedAt.toISOString(), processedAt: w.processedAt ? w.processedAt.toISOString() : null, bankName: w.bankName, bankAccountHolder: w.bankAccountHolder };
  }

  /** An invoice as its owner sees it: the bank account number is masked (the last four characters). */
  private view(w: WithdrawalRow) {
    return { ...this.base(w), accountNumberMasked: w.bankAccountNumber ? maskAccountNumber(w.bankAccountNumber) : "" };
  }

  /** An invoice as the administrator who pays it sees it: the whole account number (without it the invoice cannot be paid). */
  private adminView(w: WithdrawalRow) {
    return { ...this.base(w), accountNumber: w.bankAccountNumber };
  }

  // ---- the customer -----------------------------------------------------------------------------------------------------------------------------------------

  /** `GET /customer/{id}/wallet?source=`: for each currency the customer earned in, what was earned, what waits, what was paid out and what can be asked now, with the limits; and the invoices. */
  async wallet(userId: string, source?: WalletSource) {
    const credited = await this.db.selectDistinct({ source: walletCredits.source, currency: walletCredits.currency }).from(walletCredits).where(and(eq(walletCredits.userId, userId), source ? eq(walletCredits.source, source) : undefined));
    const pairs = new Map(credited.map((c) => [`${c.source}|${c.currency}`, c]));
    for (const e of await programEarnings(this.db, userId)) if (!source || e.source === source) pairs.set(`${e.source}|${e.currency}`, { source: e.source, currency: e.currency });
    const earnedIn = [...pairs.values()];
    const balances = [];
    for (const w of earnedIn.sort((x, y) => x.source.localeCompare(y.source) || x.currency.localeCompare(y.currency))) {
      balances.push({ source: w.source, currency: w.currency, ...(await this.totals(this.db, userId, w.source, w.currency)), limits: await this.limits(this.db, w.currency) });
    }
    const invoices = await this.db.select().from(withdrawals).where(and(eq(withdrawals.userId, userId), source ? eq(withdrawals.source, source) : undefined)).orderBy(desc(withdrawals.requestedAt), desc(withdrawals.id)).limit(100);
    return { source: source ?? null, balances, invoices: invoices.map((w) => this.view(w)) };
  }

  /** `POST /customer/{id}/withdrawals`: an invoice WD-0001... in PENDING. 422 `fields.amount` = `invalid | exceeds | belowMin | aboveMax`. */
  async request(userId: string, input: { source: WalletSource; currency: string; amount: number; bankName: string; bankAccountNumber: string; bankAccountHolder: string }, actor: Actor) {
    // The bank details come first (nothing to look up): both fields are reported at once. They are kept normalized and are never logged or audited.
    const bankIssues: Record<string, string> = {};
    const nameIssue = checkBankName(input.bankName);
    const numberIssue = checkAccountNumber(input.bankAccountNumber);
    const holderIssue = checkAccountHolder(input.bankAccountHolder);
    if (nameIssue) bankIssues.bankName = nameIssue;
    if (holderIssue) bankIssues.bankAccountHolder = holderIssue;
    if (numberIssue) bankIssues.bankAccountNumber = numberIssue;
    if (Object.keys(bankIssues).length > 0) throw invalid(bankIssues);
    const bankName = normalizeBankName(input.bankName);
    const bankAccountNumber = normalizeAccountNumber(input.bankAccountNumber);
    const bankAccountHolder = normalizeAccountHolder(input.bankAccountHolder);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wallet:${userId}:${input.source}:${input.currency}`}))`);
      const t = await this.totals(tx, userId, input.source, input.currency);
      const limits = await this.limits(tx, input.currency);
      if (input.amount > t.available) throw invalid({ amount: "exceeds" });
      if (limits.minAmount > 0 && input.amount < limits.minAmount) throw invalid({ amount: "belowMin" });
      if (limits.maxAmount > 0 && input.amount > limits.maxAmount) throw invalid({ amount: "aboveMax" });
      const [row] = await tx.insert(withdrawals).values({ number: sql`'WD-' || lpad(nextval('withdrawal_number_seq')::text, 4, '0')`, userId, source: input.source, currency: input.currency, amount: input.amount, bankName, bankAccountNumber, bankAccountHolder }).returning();
      if (!row) throw new Error("The withdrawal was not recorded");
      await this.audit.record({ actorUserId: userId, action: "withdrawal.request", entityType: "withdrawal", entityId: row.id, after: { number: row.number, source: row.source, currency: row.currency, amount: row.amount }, ip: actor.ip }, tx);
      return this.view(row);
    });
  }

  // ---- the platform administrator -----------------------------------------------------------------------------------------------------------------------------

  /** `GET /admin/directory/withdrawals`: invoices of both programs, the waiting ones first, with the totals of all the invoices. */
  async list(q: { q?: string | undefined; status?: WithdrawalRow["status"] | undefined; source?: WalletSource | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    const conditions: (SQL | undefined)[] = [q.status ? eq(withdrawals.status, q.status) : undefined, q.source ? eq(withdrawals.source, q.source) : undefined];
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      conditions.push(sql`(${withdrawals.number} ilike ${like} escape '\\' or ${users.email} ilike ${like} escape '\\' or ${users.fullName} ilike ${like} escape '\\')`);
    }
    if (q.from) conditions.push(gte(withdrawals.requestedAt, new Date(`${q.from}T00:00:00Z`)));
    if (q.to) conditions.push(lt(withdrawals.requestedAt, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000)));
    const offset = q.cursor ? Math.max(0, Math.floor(num(decodeCursor<{ o: number }>(q.cursor, ["o"]).o))) : 0;
    const rows = await this.db.select({ w: withdrawals, email: users.email, fullName: users.fullName }).from(withdrawals).innerJoin(users, eq(users.id, withdrawals.userId))
      .where(and(...conditions)).orderBy(sql`(${withdrawals.status} = 'PENDING') desc`, desc(withdrawals.requestedAt), desc(withdrawals.id)).limit(q.limit + 1).offset(offset);
    const sums = await this.db.select({ status: withdrawals.status, currency: withdrawals.currency, n: sql<string>`sum(${withdrawals.amount})`, count: sql<string>`count(*)` }).from(withdrawals).groupBy(withdrawals.status, withdrawals.currency);
    const money = (s: WithdrawalRow["status"]) => sums.filter((r) => r.status === s).map((r) => ({ currency: r.currency, amount: num(r.n) }));
    return {
      items: rows.slice(0, q.limit).map((r) => ({ ...this.adminView(r.w), customer: { id: r.w.userId, email: r.email, fullName: r.fullName } })),
      nextCursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
      totals: { pending: money("PENDING"), paid: money("PAID"), rejectedCount: sums.filter((r) => r.status === "REJECTED").reduce((n, r) => n + num(r.count), 0) },
    };
  }

  /** `POST /admin/withdrawals/{id}`: Mark as paid or Reject (a reason is required and the customer sees it). An invoice is processed once: `409 NOT_PENDING`. */
  async process(id: string, input: { action: "pay" | "reject"; reason?: string | undefined }, actor: Actor) {
    if (input.action === "reject" && !input.reason) throw invalid({ reason: "required" });
    return this.db.transaction(async (tx) => {
      const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1).for("update");
      if (!w) throw new NotFoundException({ code: "NOT_FOUND", message: "Withdrawal not found." });
      if (w.status !== "PENDING") throw new ConflictException({ code: "NOT_PENDING", message: "This invoice was already processed.", details: { status: w.status } });
      const status = input.action === "pay" ? ("PAID" as const) : ("REJECTED" as const);
      const [row] = await tx.update(withdrawals).set({ status, reason: input.action === "reject" ? input.reason! : null, processedAt: new Date(), processedBy: actor.userId }).where(eq(withdrawals.id, id)).returning();
      await this.audit.record({ actorUserId: actor.userId, action: input.action === "pay" ? "withdrawal.pay" : "withdrawal.reject", entityType: "withdrawal", entityId: id, before: { status: "PENDING" }, after: { status, number: w.number }, ip: actor.ip }, tx);
      return this.adminView(row!);
    });
  }

  // ---- limits -----------------------------------------------------------------------------------------------------------------------------------------------------

  /** The limits of every currency that has some (a currency that is not here has no limit). */
  async listLimits() {
    const rows = await this.db.select().from(withdrawalLimits).orderBy(withdrawalLimits.currency);
    return { items: rows.map((l) => ({ currency: l.currency, minAmount: l.minAmount, maxAmount: l.maxAmount, updatedAt: l.updatedAt.toISOString() })) };
  }

  /** Sets the limits of one currency (0 = no limit). The maximum cannot be below the minimum. Audited as `platform.settings_update`. */
  async setLimits(input: { currency: string; minAmount: number; maxAmount: number }, actor: Actor) {
    if (input.maxAmount > 0 && input.maxAmount < input.minAmount) throw invalid({ maxAmount: "belowMin" });
    return this.db.transaction(async (tx) => {
      const before = await this.limits(tx, input.currency);
      await tx.insert(withdrawalLimits).values({ currency: input.currency, minAmount: input.minAmount, maxAmount: input.maxAmount, updatedBy: actor.userId })
        .onConflictDoUpdate({ target: withdrawalLimits.currency, set: { minAmount: input.minAmount, maxAmount: input.maxAmount, updatedAt: new Date(), updatedBy: actor.userId } });
      await this.audit.record({ actorUserId: actor.userId, action: "platform.settings_update", entityType: "withdrawal_limits", entityId: input.currency, before, after: { minAmount: input.minAmount, maxAmount: input.maxAmount }, ip: actor.ip }, tx);
      return { currency: input.currency, minAmount: input.minAmount, maxAmount: input.maxAmount };
    });
  }
}
