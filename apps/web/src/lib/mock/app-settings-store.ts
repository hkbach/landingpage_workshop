// SERVER-ONLY: the settings of the whole platform that a system administrator can change (Settings of the admin area), until apps/api exists: the smallest and the largest amount a customer
// can withdraw at once, how long the link of a password reset works, and how many messages one visitor can send with the Contact form in an hour. Lives on globalThis like the other mock
// stores. TODO(api): `platform_settings`, SUPER_ADMIN only, audited.

export interface PlatformSettings {
  /** The smallest amount of one withdrawal, in minor units of the currency of the platform (0 = no minimum). */
  withdrawalMin: number;
  /** The largest amount of one withdrawal (0 = no maximum). */
  withdrawalMax: number;
  /** Hours the link of a password reset works, counted from the moment it was sent. */
  resetLinkHours: number;
  /** Messages one visitor can send with the Contact form in an hour. */
  contactPerHour: number;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = { withdrawalMin: 0, withdrawalMax: 0, resetLinkHours: 24, contactPerHour: 5 };
export const SETTING_BOUNDS = { resetLinkHours: { min: 1, max: 168 }, contactPerHour: { min: 1, max: 100 } } as const;

const g = globalThis as unknown as { __platformSettings?: PlatformSettings };

export const getPlatformSettings = (): PlatformSettings => ({ ...DEFAULT_PLATFORM_SETTINGS, ...(g.__platformSettings ?? {}) });

/** Test helper: back to the defaults. */
export function resetPlatformSettings(): void {
  g.__platformSettings = undefined;
}

export type SettingsCheck = "OK" | "WITHDRAWAL_INVALID" | "WITHDRAWAL_ORDER" | "RESET_INVALID" | "CONTACT_INVALID";

/** Whether the values are acceptable: whole numbers, a withdrawal minimum that is not more than the maximum (when there is one), the hours and the number of messages within their bounds. */
export function checkPlatformSettings(s: PlatformSettings): SettingsCheck {
  const whole = (n: number) => Number.isSafeInteger(n);
  if (!whole(s.withdrawalMin) || !whole(s.withdrawalMax) || s.withdrawalMin < 0 || s.withdrawalMax < 0) return "WITHDRAWAL_INVALID";
  if (s.withdrawalMax > 0 && s.withdrawalMin > s.withdrawalMax) return "WITHDRAWAL_ORDER";
  if (!whole(s.resetLinkHours) || s.resetLinkHours < SETTING_BOUNDS.resetLinkHours.min || s.resetLinkHours > SETTING_BOUNDS.resetLinkHours.max) return "RESET_INVALID";
  if (!whole(s.contactPerHour) || s.contactPerHour < SETTING_BOUNDS.contactPerHour.min || s.contactPerHour > SETTING_BOUNDS.contactPerHour.max) return "CONTACT_INVALID";
  return "OK";
}

export function setPlatformSettings(s: PlatformSettings): SettingsCheck {
  const check = checkPlatformSettings(s);
  if (check === "OK") g.__platformSettings = { ...s };
  return check;
}
