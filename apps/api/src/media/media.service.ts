import { randomUUID } from "node:crypto";
import { BadGatewayException, Inject, Injectable, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { presignUrl } from "./sigv4";

/** What an image may be: the same rules as the browser checks (and the browser checks the real type from the first bytes). */
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** What an image is for; it names the folder of the shop it goes to. */
export const MEDIA_PURPOSES = ["site", "workshop", "branding", "session", "promotion"] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/** A file in the bucket, as the bucket lists it. */
export interface StoredObject { key: string; size: number; lastModified: string }
/** The most files one listing reads (the administrator sees that there are more). */
export const MAX_LISTED = 10_000;

const unescapeXml = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (xml: string, name: string): string | null => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml); return m ? unescapeXml(m[1]!) : null; };

/** One page of the answer of ListObjectsV2 (XML): the files, and the token of the next page (null on the last). */
export function parseListing(xml: string): { objects: StoredObject[]; next: string | null } {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].flatMap((m) => {
    const key = tag(m[1]!, "Key");
    if (!key) return [];
    return [{ key, size: Number(tag(m[1]!, "Size") ?? 0), lastModified: tag(m[1]!, "LastModified") ?? "" }];
  });
  return { objects, next: tag(xml, "IsTruncated") === "true" ? tag(xml, "NextContinuationToken") : null };
}

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

  /** How the requests to R2 are sent (the tests put their own here). */
  http: typeof fetch = (input, init) => fetch(input, init);

  /** The public address an object is read at. */
  publicUrl(key: string): string {
    return `${this.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "")}/${key}`;
  }

  private signed(method: "GET" | "DELETE", path: string, query?: Record<string, string>, now = new Date()): string {
    const e = this.env;
    return presignUrl({ method, host: `${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, path, accessKeyId: e.R2_ACCESS_KEY_ID!, secretAccessKey: e.R2_SECRET_ACCESS_KEY!, region: "auto", expiresSeconds: 60, now, ...(query ? { query } : {}) });
  }

  /**
   * Every file the platform keeps (everything under `shops/`), found by asking the bucket page by page. At most `MAX_LISTED`: `truncated` says there were more. A failed request says so without
   * the URL (it carries a signature).
   */
  async listObjects(): Promise<{ objects: StoredObject[]; truncated: boolean }> {
    if (!this.configured()) throw new ServiceUnavailableException({ code: "MEDIA_NOT_CONFIGURED", message: "Image storage is not set up yet." });
    const objects: StoredObject[] = [];
    let token: string | undefined;
    for (;;) {
      const url = this.signed("GET", `/${this.env.R2_BUCKET}`, { "list-type": "2", prefix: "shops/", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) });
      const res = await this.http(url, { method: "GET" }).catch(() => null);
      if (!res || !res.ok) throw new BadGatewayException({ code: "MEDIA_STORAGE_ERROR", message: "The image storage did not answer." });
      const page = parseListing(await res.text());
      objects.push(...page.objects);
      if (objects.length >= MAX_LISTED) return { objects: objects.slice(0, MAX_LISTED), truncated: objects.length > MAX_LISTED || page.next !== null };
      if (page.next === null) return { objects, truncated: false };
      token = page.next;
    }
  }

  /** Removes one file from the bucket (the bucket answers 204 also for a file that is not there). */
  async deleteObject(key: string): Promise<boolean> {
    const res = await this.http(this.signed("DELETE", `/${this.env.R2_BUCKET}/${key}`), { method: "DELETE" }).catch(() => null);
    return res !== null && (res.ok || res.status === 404);
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
