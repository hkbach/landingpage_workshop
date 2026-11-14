import { Inject, Injectable } from "@nestjs/common";
import { inArray, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database } from "../db/db.module";
import { organizations } from "../db/schema";
import { MediaService, type StoredObject } from "./media.service";

/** The name of a file of the platform: `shops/{shop id}/{purpose}/{id}.{ext}` (what `presign` makes). Nothing else is ever removed. */
export const MEDIA_KEY = /^shops\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(site|workshop|branding|session|promotion)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;
/** The same name as a pattern that finds it inside a text (a column, a page of the builder), for PostgreSQL. */
const KEY_IN_TEXT = "(shops/[0-9a-f-]{36}/(?:site|workshop|branding|session|promotion)/[0-9a-f-]{36}[.](?:jpg|png|webp))";
export const MAX_DELETE = 100;

export type UsedBy = "workshop" | "session" | "promotion" | "profile" | "landingPage";
export interface MediaItem {
  key: string; url: string; shopId: string; shopName: string; purpose: string; size: number; uploadedAt: string | null; status: "USED" | "UNUSED"; usedBy: UsedBy[];
}
export interface DeleteResult { deleted: string[]; inUse: string[]; failed: string[] }

/**
 * The images in Cloudflare R2 and whether anything in the system still shows them (REQUIREMENTS 5.8, the Images page of the platform administrator).
 *
 * "Used" means the address of the file is written in one of the places that show an image: the cover and gallery of a workshop, the picture of a session, of a promotion, the avatar of a customer, and
 * the landing pages (the draft, the live page and every kept version, because putting a version back shows its images again). History that only records what happened (the audit log, a booking
 * snapshot) does not count, or no file would ever be unused. A file that is in none of them is unused and may be removed.
 */
@Injectable()
export class AdminMediaService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(MediaService) private readonly media: MediaService, @Inject(AuditService) private readonly audit: AuditService) {}

  /** Every key written in a place that shows an image, with what shows it. */
  async usage(): Promise<Map<string, Set<UsedBy>>> {
    const result = await this.db.execute(sql`
      select distinct m[1] as key, s.kind
      from (
        select 'workshop' as kind, cover_url as v from workshops
        union all select 'workshop', array_to_string(gallery_urls, ' ') from workshops
        union all select 'session', image_url from workshop_sessions
        union all select 'promotion', image_url from promotions
        union all select 'profile', avatar_url from customer_profiles
        union all select 'landingPage', theme::text from site_pages
        union all select 'landingPage', draft_content::text from site_pages
        union all select 'landingPage', published_content::text from site_pages
        union all select 'landingPage', published_theme::text from site_pages
        union all select 'landingPage', content::text from site_page_versions
        union all select 'landingPage', theme::text from site_page_versions
      ) s, lateral regexp_matches(s.v, ${KEY_IN_TEXT}, 'g') as m`);
    const used = new Map<string, Set<UsedBy>>();
    for (const row of result.rows as Array<{ key: string; kind: UsedBy }>) {
      const set = used.get(row.key) ?? new Set<UsedBy>();
      set.add(row.kind);
      used.set(row.key, set);
    }
    return used;
  }

  /** All the files of the bucket, newest first, each with its state. */
  async list(): Promise<{ items: MediaItem[]; total: number; truncated: boolean }> {
    const [{ objects, truncated }, used] = await Promise.all([this.media.listObjects(), this.usage()]);
    const files = objects.flatMap((o) => { const m = MEDIA_KEY.exec(o.key); return m ? [{ o, shopId: m[1]!, purpose: m[2]! }] : []; }); // (a file that is not named like ours is not ours to show or remove)
    const shopIds = [...new Set(files.map((f) => f.shopId))];
    const shops = shopIds.length === 0 ? [] : await this.db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, shopIds));
    const names = new Map(shops.map((s) => [s.id, s.name]));
    const items = files.map(({ o, shopId, purpose }): MediaItem => this.item(o, shopId, purpose, names.get(shopId) ?? "", used.get(o.key)));
    items.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? "") || a.key.localeCompare(b.key));
    return { items, total: items.length, truncated };
  }

  private item(o: StoredObject, shopId: string, purpose: string, shopName: string, usedBy: Set<UsedBy> | undefined): MediaItem {
    return { key: o.key, url: this.media.publicUrl(o.key), shopId, shopName, purpose, size: o.size, uploadedAt: o.lastModified || null, status: usedBy ? "USED" : "UNUSED", usedBy: usedBy ? [...usedBy].sort() : [] };
  }

  /**
   * Removes files from the bucket for good. The list the administrator saw is not trusted: what is used is worked out again now, and a file that something shows is NOT removed (`inUse`), so an
   * image used a moment ago by a shop owner who was uploading while the administrator was clicking stays. Each removal is audited.
   */
  async deleteUnused(keys: string[], reason: string | undefined, actor: Actor): Promise<DeleteResult> {
    const unique = [...new Set(keys)];
    const result: DeleteResult = { deleted: [], inUse: [], failed: [] };
    const used = await this.usage();
    const candidates: string[] = [];
    for (const key of unique) (used.has(key) ? result.inUse : candidates).push(key);
    for (let i = 0; i < candidates.length; i += 5) {
      await Promise.all(candidates.slice(i, i + 5).map(async (key) => {
        const removed = await this.media.deleteObject(key);
        (removed ? result.deleted : result.failed).push(key);
      }));
    }
    if (result.deleted.length > 0) {
      const shops = await this.db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.id, [...new Set(result.deleted.map((k) => MEDIA_KEY.exec(k)![1]!))]));
      const known = new Set(shops.map((s) => s.id));
      for (const key of result.deleted) {
        const shopId = MEDIA_KEY.exec(key)![1]!;
        await this.audit.record({ organizationId: known.has(shopId) ? shopId : null, actorUserId: actor.userId, action: "media.delete", entityType: "media", entityId: key, before: { key }, after: reason ? { reason } : {}, ip: actor.ip });
      }
    }
    return result;
  }
}
