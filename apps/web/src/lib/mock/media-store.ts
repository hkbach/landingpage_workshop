// SERVER-ONLY stand-in for the media service (FR-MEDIA-01: presigned upload to R2) until apps/api exists. An uploaded image is
// checked, kept in memory and served at /api/v1/media/promotions/{id}; the promotion keeps that path as its image URL.
// It lives on globalThis so it survives hot reloads and is lost when the server restarts (demo data).
import { newUuid } from "@/lib/uuid";

export const MAX_IMAGE_BYTES = 1_000_000;

export interface StoredImage { mime: "image/jpeg" | "image/png" | "image/webp"; bytes: Buffer }

const g = globalThis as unknown as { __mediaStore?: Map<string, StoredImage> };
const store = () => (g.__mediaStore ??= new Map());

/** Test helper. */
export function resetMediaStore(): void {
  g.__mediaStore = new Map();
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** The image is only kept when its bytes really start like the type it claims (jpeg, png or webp). */
function looksLike(mime: StoredImage["mime"], b: Buffer): boolean {
  if (mime === "image/png") return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
}

export type SaveImageResult = { ok: true; id: string } | { ok: false; code: "INVALID" | "TOO_LARGE" };

export function saveImage(dataUrl: unknown): SaveImageResult {
  if (typeof dataUrl !== "string") return { ok: false, code: "INVALID" };
  const m = DATA_URL.exec(dataUrl);
  if (!m) return { ok: false, code: "INVALID" };
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: "TOO_LARGE" };
  const mime = m[1] as StoredImage["mime"];
  if (!looksLike(mime, bytes)) return { ok: false, code: "INVALID" };
  const id = newUuid();
  store().set(id, { mime, bytes });
  return { ok: true, id };
}

export const getImage = (id: string): StoredImage | undefined => store().get(id);
export const hasImage = (id: string): boolean => store().has(id);
export const deleteImage = (id: string | null): void => { if (id) store().delete(id); };
