// What a customer who registered an account has told the shop about themselves (besides the country and the birth date): the gender and the chat
// and social accounts. Everything here is optional: what is not given is shown as "-".

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

/** Messaging apps and social networks, in the order they are listed. */
export const SOCIAL_PLATFORMS = ["ZALO", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "LINE", "KAKAOTALK", "WECHAT", "TELEGRAM", "X"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type Socials = Partial<Record<SocialPlatform, string>>;

/** The accounts a customer gave, as [platform, handle] in the order of SOCIAL_PLATFORMS; empty or blank handles are left out. */
export function socialEntries(socials: Socials | undefined): [SocialPlatform, string][] {
  return SOCIAL_PLATFORMS.flatMap((p): [SocialPlatform, string][] => {
    const handle = socials?.[p]?.trim();
    return handle ? [[p, handle]] : [];
  });
}
