import { randomUUID } from "node:crypto";
import { Inject, Injectable, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { presignUrl } from "./sigv4";

/** What an image may be: the same rules as the browser checks (and the browser checks the real type from the first bytes). */
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** What an image is for; it names the folder of the shop it goes to. */
export const MEDIA_PURPOSES = ["site", "workshop", "branding", "session", "promotion"] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

const UPLOAD_SECONDS = 300;
const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });

/**
 * Images are kept in Cloudflare R2, in a bucket that is public to read. The browser never gets a key: it gets a URL that lets it PUT one file of one type for five minutes, into the folder of its
 * own shop. The address the image is read at is `R2_PUBLIC_BASE_URL/{key}`.
 */
@Injectable()
export class MediaService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Whether the settings of R2 are all there. */
  configured(): boolean {
    const e = this.env;
    return Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET && e.R2_PUBLIC_BASE_URL);
  }

  presign(organizationId: string, input: { purpose: MediaPurpose; contentType: keyof typeof IMAGE_TYPES; size: number }, now = new Date()) {
    if (!this.configured()) throw new ServiceUnavailableException({ code: "MEDIA_NOT_CONFIGURED", message: "Image storage is not set up yet." });
    if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_IMAGE_BYTES) throw invalid({ size: input.size > MAX_IMAGE_BYTES ? "tooLarge" : "invalid" });
    const e = this.env;
    const key = `shops/${organizationId}/${input.purpose}/${randomUUID()}.${IMAGE_TYPES[input.contentType]}`;
    const host = `${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const uploadUrl = presignUrl({
      method: "PUT", host, path: `/${e.R2_BUCKET}/${key}`, accessKeyId: e.R2_ACCESS_KEY_ID!, secretAccessKey: e.R2_SECRET_ACCESS_KEY!, region: "auto", expiresSeconds: UPLOAD_SECONDS, now,
      signedHeaders: { "content-type": input.contentType },
    });
    return {
      key, uploadUrl, method: "PUT" as const, headers: { "content-type": input.contentType }, publicUrl: `${e.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "")}/${key}`, expiresInSeconds: UPLOAD_SECONDS,
    };
  }
}
