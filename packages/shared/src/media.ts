/**
 * Images the platform serves itself. Until the real media service (R2 + CDN) exists, the mock backend serves uploaded images from
 * /api/v1/media/{kind}/{id}; such a path is as safe to render as an https URL (it only ever returns a validated image).
 */
const PLATFORM_MEDIA_RE = /^\/api\/v1\/media\/[a-z]+\/[a-z0-9-]{8,64}$/;

export const isPlatformMediaPath = (value: string): boolean => PLATFORM_MEDIA_RE.test(value);

/** The id at the end of a platform media path, or null for any other value. */
export const platformMediaId = (value: string | undefined): string | null => (value && isPlatformMediaPath(value) ? value.slice(value.lastIndexOf("/") + 1) : null);
