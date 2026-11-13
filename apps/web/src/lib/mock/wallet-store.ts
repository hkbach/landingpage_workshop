// SERVER-ONLY: what a customer earns from the two programs and the withdrawals of it, until apps/api exists.
//  - Two programs, each with its own balance: AFFILIATE (the fee of the links of a workshop) and REFERRAL (the bonus for the friends invited to register).
//  - total earned = what the program gave the customer so far (affiliate fee / referral bonus, worked out from the bookings as they are now).
//  - A withdrawal is an invoice (WD-0001...) of an amount, asked by the customer: PENDING until a system admin processes it, then PAID (the money was sent) or REJECTED (with a reason;
//    the amount goes back to the balance).
//  - pending = the amount of the PENDING invoices, withdrawn = the amount of the PAID ones, available = earned - pending - withdrawn (never below 0).
// The mock keeps fees in the currency of the demo shop (the only shop with bookings). Lives on globalThis like the other mock stores.
// TODO(api): `withdrawals` (account_id, source, amount, status, processed_by/at, reason) with the balance checked in the SAME transaction (SELECT ... FOR UPDATE on the account), the
// payout itself, and the audit log.
import { getPlatformSettings } from "./app-settings-store";
import { referralEarnings } from "./admin-income";
import { listAccounts } from "./accounts-store";
import { currentShop } from "./data";
import { inviteBonuses } from "./invite-store";
import { listReferrals } from "./referral-store";
import { newUuid } from "../uuid";

export const WALLET_SOURCES = ["AFFILIATE", "REFERRAL"] as const;
export type WalletSource = (typeof WALLET_SOURCES)[number];
export type WithdrawalStatus = "PENDING" | "PAID" | "REJECTED";

export interface Withdrawal {
  id: string;
  /** The invoice number shown to the customer and the admin: WD-0001. */
  code: string;
  accountId: string;
  source: WalletSource;
  /** Minor units of `currency`. */
  amount: number;
  currency: string;
  /** Where the admin pays the invoice (outside the system): personal data, kept tidy (`normalizeBankName`, `normalizeAccountNumber`). */
  bankName: string;
  accountNumber: string;
  /** The name of the owner of the account. */
  accountHolder: string;
  status: WithdrawalStatus;
  requestedAt: string;
  processedAt?: string;
  /** Why it was rejected. */
  reason?: string;
}

export interface Wallet { source: WalletSource; currency: string; earned: number; pending: number; withdrawn: number; available: number }

const DAY = 86_400_000;
const g = globalThis as unknown as { __withdrawals?: Withdrawal[] };

/**
 * Invoices to look at, in every state: PAID, PENDING and REJECTED (with a reason), for each program. cu-4 has one of each kind; cu-1 has a long history; cu-5 has a pending
 * affiliate invoice and a referral balance that is withdrawn in full (nothing left to withdraw); cu-6 and the others have none (the empty History).
 */
function seed(): Withdrawal[] {
  const at = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const cur = currentShop.currency;
  const row = (n: number, accountId: string, source: WalletSource, amount: number, status: WithdrawalStatus, requestedDaysAgo: number, processedDaysAgo?: number, reason?: string): Withdrawal => ({
    id: `wd-${n}`, code: `WD-${String(n).padStart(4, "0")}`, accountId, source, amount, currency: cur, bankName: "Demo Bank", accountNumber: "000011112222", accountHolder: "Demo Customer", status, requestedAt: at(requestedDaysAgo),
    ...(processedDaysAgo === undefined ? {} : { processedAt: at(processedDaysAgo) }), ...(reason ? { reason } : {}),
  });
  return [
    row(1, "cu-4", "AFFILIATE", 200_000, "PAID", 12, 10),
    row(2, "cu-4", "AFFILIATE", 100_000, "PENDING", 2),
    row(3, "cu-4", "REFERRAL", 50_000, "REJECTED", 8, 6, "Bank account details do not match the name of the account."),
    row(4, "cu-1", "AFFILIATE", 100_000, "PAID", 30, 28),
    row(5, "cu-1", "AFFILIATE", 50_000, "PAID", 18, 16),
    row(6, "cu-1", "AFFILIATE", 50_000, "REJECTED", 11, 9, "The payout details are incomplete."),
    row(7, "cu-1", "AFFILIATE", 100_000, "PENDING", 1),
    row(8, "cu-1", "REFERRAL", 70_000, "PAID", 10, 8),
    row(9, "cu-1", "REFERRAL", 40_000, "PENDING", 3),
    row(10, "cu-5", "AFFILIATE", 20_000, "PENDING", 1),
    row(11, "cu-5", "REFERRAL", 65_000, "PAID", 5, 3), // the whole referral balance: nothing left to withdraw
  ];
}
const store = (): Withdrawal[] => (g.__withdrawals ??= seed());

/** Test helper: back to the demo invoices. */
export function resetWalletStore(): void {
  g.__withdrawals = undefined;
}

export const listWithdrawals = (): Withdrawal[] => store().map((w) => ({ ...w }));

/** What the program gave the customer so far. */
export function earnedBy(accountId: string, source: WalletSource): number {
  if (source === "REFERRAL") return inviteBonuses().filter((b) => b.inviterId === accountId).reduce((n, b) => n + b.amount, 0);
  const fees = referralEarnings();
  return listReferrals().filter((r) => r.accountId === accountId).reduce((n, r) => n + (fees.get(r.id)?.fee ?? 0), 0);
}

export function walletOf(accountId: string, source: WalletSource): Wallet {
  const mine = store().filter((w) => w.accountId === accountId && w.source === source);
  const sum = (status: WithdrawalStatus) => mine.filter((w) => w.status === status).reduce((n, w) => n + w.amount, 0);
  const earned = earnedBy(accountId, source);
  const pending = sum("PENDING");
  const withdrawn = sum("PAID");
  return { source, currency: currentShop.currency, earned, pending, withdrawn, available: Math.max(0, earned - pending - withdrawn) };
}

/** The invoices of a customer for a program, newest first. */
export const withdrawalsOf = (accountId: string, source: WalletSource): Withdrawal[] =>
  listWithdrawals().filter((w) => w.accountId === accountId && w.source === source).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || b.code.localeCompare(a.code));

export type RequestResult = { ok: true; withdrawal: Withdrawal } | { ok: false; code: "NO_ACCOUNT" | "AMOUNT_INVALID" | "EXCEEDS_AVAILABLE" | "BELOW_MIN" | "ABOVE_MAX" };

/** The customer asks to withdraw `amount` (minor units, a whole positive number) from one program: it must not be more than what is available. `bank` is already checked and tidy (the route does it). */
export function requestWithdrawal(accountId: string, source: WalletSource, amount: number, bank: { bankName: string; accountNumber: string; accountHolder: string }, now: Date = new Date()): RequestResult {
  if (!listAccounts().some((a) => a.id === accountId && a.type === "CUSTOMER")) return { ok: false, code: "NO_ACCOUNT" };
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, code: "AMOUNT_INVALID" };
  if (amount > walletOf(accountId, source).available) return { ok: false, code: "EXCEEDS_AVAILABLE" };
  const { withdrawalMin, withdrawalMax } = getPlatformSettings(); // the limits an administrator set (0 = none)
  if (withdrawalMin > 0 && amount < withdrawalMin) return { ok: false, code: "BELOW_MIN" };
  if (withdrawalMax > 0 && amount > withdrawalMax) return { ok: false, code: "ABOVE_MAX" };
  const n = store().length + 1;
  const withdrawal: Withdrawal = { id: `wd-${newUuid().slice(0, 8)}`, code: `WD-${String(n).padStart(4, "0")}`, accountId, source, amount, currency: currentShop.currency, bankName: bank.bankName, accountNumber: bank.accountNumber, accountHolder: bank.accountHolder, status: "PENDING", requestedAt: now.toISOString() };
  store().push(withdrawal);
  return { ok: true, withdrawal: { ...withdrawal } };
}

export type ProcessResult = { ok: true; withdrawal: Withdrawal } | { ok: false; code: "NOT_FOUND" | "NOT_PENDING" | "REASON_REQUIRED" };

/** A system admin pays (the money was sent) or rejects (with a reason) a pending invoice. An invoice that was processed stays as it is. */
export function processWithdrawal(id: string, decision: "PAID" | "REJECTED", reason = "", now: Date = new Date()): ProcessResult {
  const w = store().find((x) => x.id === id);
  if (!w) return { ok: false, code: "NOT_FOUND" };
  if (w.status !== "PENDING") return { ok: false, code: "NOT_PENDING" };
  const why = reason.trim().slice(0, 300);
  if (decision === "REJECTED" && !why) return { ok: false, code: "REASON_REQUIRED" };
  w.status = decision;
  w.processedAt = now.toISOString();
  if (decision === "REJECTED") w.reason = why;
  return { ok: true, withdrawal: { ...w } };
}
