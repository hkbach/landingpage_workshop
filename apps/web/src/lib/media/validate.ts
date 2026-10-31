// Client-side image validation (FR-MEDIA-01): jpeg/png/webp only, max 5 MB, real type from magic bytes.
// The backend repeats these checks on `complete` (never trust the client).

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageErrorCode = "empty" | "tooLarge" | "unsupportedType" | "typeMismatch";

/** Detect the real image type from the first bytes of a file. */
export function detectImageType(b: Uint8Array): AllowedImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  // WebP: "RIFF" <size> "WEBP"
  if (b.length >= 12 && [0x52, 0x49, 0x46, 0x46].every((v, i) => b[i] === v) && [0x57, 0x45, 0x42, 0x50].every((v, i) => b[8 + i] === v)) return "image/webp";
  return null;
}

export type ImageCheck = { ok: true; type: AllowedImageType } | { ok: false; error: ImageErrorCode };

/** Validate size, declared type and magic bytes. */
export async function validateImageFile(file: Blob & { type: string }): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "tooLarge" };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const real = detectImageType(head);
  if (!real) return { ok: false, error: "unsupportedType" };
  if (file.type && file.type !== real) {
    return { ok: false, error: (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type) ? "typeMismatch" : "unsupportedType" };
  }
  return { ok: true, type: real };
}
