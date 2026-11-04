import { SOCIAL_PLATFORMS, type Gender, type Locale, type SocialPlatform, type Socials } from "@workshop/shared";
import { COUNTRY_CODES } from "@/components/booking/countries";
import { isHttpsUrl } from "@/components/sections/safe-url";
import type { CustomerProfile, CustomerProfileInput } from "./customer-api";

// The form of My Profile: what the guest types, what is sent, and what is refused. Pure, so it can be tested (BR-16: every text is trimmed).

export interface ProfileDraft {
  fullName: string; phone: string; preferredLocale: Locale; country: string; birthDate: string; gender: Gender | "";
  socials: Record<SocialPlatform, string>; avatarUrl: string;
}

export const NAME_MAX = 120;
export const PHONE_MAX = 40;
export const SOCIAL_MAX = 100;
export const AVATAR_MAX = 500;

/** The form as the profile fills it in (empty texts for what the guest never gave). */
export function toDraft(p: CustomerProfile): ProfileDraft {
  return {
    fullName: p.fullName, phone: p.phone ?? "", preferredLocale: p.preferredLocale, country: p.account.country, birthDate: p.account.birthDate, gender: p.account.gender ?? "",
    socials: Object.fromEntries(SOCIAL_PLATFORMS.map((s) => [s, p.account.socials?.[s] ?? ""])) as Record<SocialPlatform, string>, avatarUrl: p.account.avatarUrl ?? "",
  };
}

/** The draft with every text trimmed (what the form shows once it is saved). */
export function trimDraft(d: ProfileDraft): ProfileDraft {
  return {
    ...d, fullName: d.fullName.trim(), phone: d.phone.trim(), avatarUrl: d.avatarUrl.trim(),
    socials: Object.fromEntries(SOCIAL_PLATFORMS.map((s) => [s, d.socials[s].trim()])) as Record<SocialPlatform, string>,
  };
}

/** What is sent: trimmed, and what is empty is left out (so it is removed from the profile). */
export function toInput(d: ProfileDraft): CustomerProfileInput {
  const t = trimDraft(d);
  const socials = Object.fromEntries(SOCIAL_PLATFORMS.flatMap((s): [SocialPlatform, string][] => (t.socials[s] ? [[s, t.socials[s]]] : []))) as Socials;
  return {
    fullName: t.fullName, preferredLocale: t.preferredLocale, country: t.country, birthDate: t.birthDate,
    ...(t.phone ? { phone: t.phone } : {}), ...(t.gender ? { gender: t.gender } : {}), ...(Object.keys(socials).length ? { socials } : {}), ...(t.avatarUrl ? { avatarUrl: t.avatarUrl } : {}),
  };
}

/** The error code of each field that is wrong ("required", "tooLong", "invalid", "urlInvalid"); empty when the draft can be saved. `today` is "YYYY-MM-DD". */
export function validateDraft(d: ProfileDraft, today: string): Record<string, string> {
  const t = trimDraft(d);
  const errors: Record<string, string> = {};
  if (!t.fullName) errors.fullName = "required";
  else if (t.fullName.length > NAME_MAX) errors.fullName = "tooLong";
  if (t.phone.length > PHONE_MAX) errors.phone = "tooLong";
  if (!COUNTRY_CODES.includes(t.country)) errors.country = "required";
  if (!t.birthDate) errors.birthDate = "required";
  else if (t.birthDate < "1900-01-01" || t.birthDate > today) errors.birthDate = "invalid";
  if (SOCIAL_PLATFORMS.some((s) => t.socials[s].length > SOCIAL_MAX)) errors.socials = "tooLong";
  if (t.avatarUrl.length > AVATAR_MAX) errors.avatarUrl = "tooLong";
  else if (t.avatarUrl && !isHttpsUrl(t.avatarUrl)) errors.avatarUrl = "urlInvalid";
  return errors;
}
