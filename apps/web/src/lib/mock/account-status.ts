// SERVER-ONLY: whether an account is active, until apps/api exists. An administrator deactivates an account (it cannot log in or use its area), and a reset of
// the password deactivates it until the person has chosen a new password. No imports: the booking store reads it. Lives on globalThis like the other mock stores.
export type AccountStatus = "ACTIVE" | "DEACTIVATED";
export type DeactivationReason = "ADMIN" | "PASSWORD_RESET";

interface Entry { status: AccountStatus; reason?: DeactivationReason; changedAt: string }
const g = globalThis as unknown as { __accountStatus?: Map<string, Entry> };
const map = () => (g.__accountStatus ??= new Map());

/** Test helper: every account is active again. */
export function resetAccountStatus(): void {
  g.__accountStatus = undefined;
}

export function accountStatus(id: string): { status: AccountStatus; reason?: DeactivationReason; changedAt?: string } {
  return map().get(id) ?? { status: "ACTIVE" };
}

export const isAccountActive = (id: string): boolean => accountStatus(id).status === "ACTIVE";

export function setAccountStatus(id: string, status: AccountStatus, reason?: DeactivationReason): void {
  if (status === "ACTIVE") map().delete(id);
  else map().set(id, { status, reason: reason ?? "ADMIN", changedAt: new Date().toISOString() });
}
