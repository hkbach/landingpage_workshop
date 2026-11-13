// SERVER-ONLY: the accounts of the platform (shop owners and customers), their passwords and the reset of a password, until apps/api exists. Everybody logs in
// with email + password. The demo accounts all start with DEMO_PASSWORD (demo data, not a secret); a password a person chose or an administrator reset replaces
// it. Lives on globalThis like the other mock stores. TODO(api): the identity provider; the audit log of the administrator's actions.
import { checkPassword } from "@workshop/shared";
import { liveCustomers, adminUpdateGuestProfile } from "./booking-store";
import { everyShop } from "./registered-shops-store";
import { accountStatus, setAccountStatus, type AccountStatus, type DeactivationReason } from "./account-status";
import { hashPassword, hashToken, generateTempPassword, newToken, verifyPassword } from "./passwords";
import { queuePasswordReset } from "./outbox-store";
import { getPlatformSettings } from "./app-settings-store";

/** The password of every demo account until its owner chooses another one (mock only). */
export const DEMO_PASSWORD = "Workshop#2026";
/** How long the link of a reset works: 24 hours by default (see Settings of the admin area). */
export const resetValidMs = (): number => getPlatformSettings().resetLinkHours * 3_600_000;
const MAX_RESET_ATTEMPTS = 5;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60_000;

export type AccountType = "CUSTOMER" | "SHOP_OWNER";
export interface Account {
  /** `owner-{orgId}` for a shop owner, the customer id otherwise. */
  id: string;
  type: AccountType;
  email: string;
  fullName: string;
  phone?: string;
  status: AccountStatus;
  deactivationReason?: DeactivationReason;
  /** Shop owner: the shop. */
  shop?: { id: string; name: string; slug: string };
  /** Customer: the profile of the account. */
  country?: string;
  birthDate?: string;
  favoriteCategories?: string[];
  createdAt?: string;
}

interface Reset { accountId: string; tokenHash: string; tempHash: string; expiresAt: number; attempts: number }
interface Store {
  passwords: Map<string, string>;
  owners: Map<string, { fullName: string; phone?: string }>;
  resets: Map<string, Reset>; // by token hash
  failures: Map<string, { count: number; until: number }>; // by email
}
const g = globalThis as unknown as { __accountsStore?: Store };
const store = (): Store => (g.__accountsStore ??= { passwords: new Map(), owners: new Map(), resets: new Map(), failures: new Map() });

/** Test helper: back to the demo passwords, no pending reset. */
export function resetAccountsStore(): void {
  g.__accountsStore = undefined;
}

const norm = (email: string) => email.trim().toLowerCase();
const ownerId = (orgId: string) => `owner-${orgId}`;

function ownerAccounts(): Account[] {
  return everyShop().map((s) => {
    const id = ownerId(s.id);
    const edit = store().owners.get(id);
    const st = accountStatus(id);
    return {
      id, type: "SHOP_OWNER", email: norm(s.ownerEmail), fullName: edit?.fullName ?? s.ownerName, ...((edit ? edit.phone : s.contactPhone) ? { phone: edit ? edit.phone : s.contactPhone } : {}),
      status: st.status, ...(st.reason ? { deactivationReason: st.reason } : {}), shop: { id: s.id, name: s.name, slug: s.slug }, createdAt: s.createdAt,
    };
  });
}

function customerAccounts(): Account[] {
  return liveCustomers().filter((c) => c.account && c.email).map((c) => {
    const st = accountStatus(c.id);
    return {
      id: c.id, type: "CUSTOMER", email: norm(c.email!), fullName: c.fullName, ...(c.phone ? { phone: c.phone } : {}), status: st.status, ...(st.reason ? { deactivationReason: st.reason } : {}),
      country: c.account!.country, birthDate: c.account!.birthDate, favoriteCategories: c.account!.favoriteCategories, ...(c.account!.consentAt ? { createdAt: c.account!.consentAt } : {}),
    };
  });
}

/** Every account: the shop owners first, then the customers who have an account. */
export const listAccounts = (): Account[] => [...ownerAccounts(), ...customerAccounts()];
export const findAccount = (id: string): Account | undefined => listAccounts().find((a) => a.id === id);
export const findAccountByEmail = (email: string): Account | undefined => listAccounts().find((a) => a.email === norm(email));

/** The person chooses (or registers with) a password. False for an unknown account. */
export function setPassword(accountId: string, password: string): boolean {
  if (!findAccount(accountId) || checkPassword(password) !== "OK") return false;
  store().passwords.set(accountId, hashPassword(password));
  return true;
}

let dummyHash: string | undefined;

export type LoginResult =
  | { ok: true; account: Account }
  | { ok: false; code: "INVALID_CREDENTIALS" | "DEACTIVATED" | "TOO_MANY_ATTEMPTS" };

/**
 * The same answer for an unknown email and a wrong password; a deactivated account is only told after the right password; 5 failures of one client (IP) for one email
 * lock that client out of that email for 15 minutes (someone failing elsewhere does not lock the owner out).
 */
export function login(email: string, password: string, now = Date.now(), client = "local"): LoginResult {
  const key = `${client}|${norm(email)}`;
  const fail = store().failures.get(key);
  if (fail && fail.until > now) return { ok: false, code: "TOO_MANY_ATTEMPTS" };
  const account = findAccountByEmail(norm(email));
  const stored = account ? store().passwords.get(account.id) : undefined;
  const good = account ? (stored ? verifyPassword(password, stored) : password === DEMO_PASSWORD) : (verifyPassword(password, (dummyHash ??= hashPassword("not-an-account"))), false); // a work factor is spent either way
  if (!account || !good) {
    const count = (fail && fail.until === 0 ? fail.count : 0) + 1; // a lock that has run out starts counting again
    store().failures.set(key, { count, until: count >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : 0 });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  store().failures.delete(key);
  if (account.status !== "ACTIVE") return { ok: false, code: "DEACTIVATED" };
  return { ok: true, account };
}

/** An administrator edits the name and the phone of an account (never the email). */
export function updateAccount(id: string, patch: { fullName: string; phone?: string }): boolean {
  const a = findAccount(id);
  if (!a) return false;
  if (a.type === "CUSTOMER") return adminUpdateGuestProfile(id, patch);
  store().owners.set(id, { fullName: patch.fullName, ...(patch.phone ? { phone: patch.phone } : {}) });
  return true;
}

/** An administrator activates or deactivates an account. A pending reset of the password is dropped (the link would not work on an account the administrator closed). */
export function setStatusByAdmin(id: string, status: AccountStatus): boolean {
  if (!findAccount(id)) return false;
  setAccountStatus(id, status, "ADMIN");
  for (const [k, r] of store().resets) if (r.accountId === id) store().resets.delete(k);
  return true;
}

export type StartResetResult = { ok: true; expiresAt: string } | { ok: false; code: "NOT_FOUND" };

/**
 * An administrator resets the password: the account is deactivated, and an email with a temporary password and the link of the page where a new password is
 * chosen goes to the person. A reset replaces an earlier pending one. The temporary password and the token are never returned: they exist only in the email.
 */
export function startPasswordReset(id: string, resetUrlFor: (token: string) => string, now = Date.now()): StartResetResult {
  const a = findAccount(id);
  if (!a) return { ok: false, code: "NOT_FOUND" };
  for (const [k, r] of store().resets) if (r.accountId === id) store().resets.delete(k);
  const temp = generateTempPassword();
  const token = newToken();
  const expiresAt = now + resetValidMs();
  store().resets.set(hashToken(token), { accountId: id, tokenHash: hashToken(token), tempHash: hashPassword(temp), expiresAt, attempts: 0 });
  setAccountStatus(id, "DEACTIVATED", "PASSWORD_RESET");
  const customer = a.type === "CUSTOMER" ? liveCustomers().find((c) => c.id === id) : undefined;
  const locale = customer?.preferredLocale ?? everyShop().find((s) => ownerId(s.id) === id)?.defaultLocale ?? "en";
  queuePasswordReset({ to: a.email, locale, accountName: a.fullName, accountEmail: a.email, tempPassword: temp, resetUrl: resetUrlFor(token), expiresAt: new Date(expiresAt).toISOString() });
  return { ok: true, expiresAt: new Date(expiresAt).toISOString() };
}

export type CompleteResetResult =
  | { ok: true }
  | { ok: false; code: "INVALID_LINK" | "WRONG_TEMP_PASSWORD" | "WEAK_PASSWORD" | "SAME_PASSWORD" };

/** The person opens the link: the temporary password of the email plus a new password. The link works once; 5 wrong temporary passwords burn it. */
export function completePasswordReset(token: string, tempPassword: string | null, newPassword: string, now = Date.now()): CompleteResetResult {
  const reset = store().resets.get(hashToken(token));
  if (!reset || reset.expiresAt <= now) {
    if (reset) store().resets.delete(reset.tokenHash);
    return { ok: false, code: "INVALID_LINK" };
  }
  if (tempPassword !== null && !verifyPassword(tempPassword, reset.tempHash)) { // (null: the link alone is the proof, as in the real API)
    reset.attempts += 1;
    if (reset.attempts >= MAX_RESET_ATTEMPTS) store().resets.delete(reset.tokenHash);
    return { ok: false, code: reset.attempts >= MAX_RESET_ATTEMPTS ? "INVALID_LINK" : "WRONG_TEMP_PASSWORD" };
  }
  if (checkPassword(newPassword) !== "OK") return { ok: false, code: "WEAK_PASSWORD" };
  if (tempPassword !== null && newPassword === tempPassword) return { ok: false, code: "SAME_PASSWORD" };
  store().passwords.set(reset.accountId, hashPassword(newPassword));
  store().resets.delete(reset.tokenHash);
  setAccountStatus(reset.accountId, "ACTIVE");
  return { ok: true };
}

/** The account a reset link belongs to (for the audit log, read before the link is used up); undefined for an unknown link. */
export function resetTokenAccount(token: string): Account | undefined {
  const r = store().resets.get(hashToken(token));
  return r ? findAccount(r.accountId) : undefined;
}

/** Whether a link of a reset can still be used (the page tells the person at once when it is not). */
export function resetLinkValid(token: string, now = Date.now()): boolean {
  const r = store().resets.get(hashToken(token));
  return Boolean(r && r.expiresAt > now);
}
