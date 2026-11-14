import { Pool } from "pg";
import { loadDotEnv, parseEnv } from "../config/env";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MediaService, type MediaPurpose } from "./media.service";

// `pnpm --filter api media:mirror`: copies every image of the system that lives on ANOTHER website (the demo data points at Unsplash) to our own Cloudflare R2 bucket, and writes the new address in its
// place: the cover and gallery of the workshops, the picture of a session and of a promotion, the photo of a customer, and the images of the landing pages (the draft, the live page and every kept
// version). Each shop's images go to the folder of that shop (`shops/{shop id}/...`), a customer's photo to `avatars/{account id}/...`, so the Images page of the administrator shows who owns what.
//
// Safe to run again: an address that already points at our bucket is left alone, and a picture that cannot be fetched is reported and left as it was. Nothing is printed that carries a signature.
// `--dry-run` only lists what would be copied. It needs R2_* in apps/api/.env (see `pnpm --filter api r2:check`).

/** A string is a link to an image of another website: https, and not already in our bucket. */
export function isExternalImage(value: unknown, publicBase: string): value is string {
  if (typeof value !== "string" || !/^https:\/\//i.test(value)) return false;
  return !value.startsWith(`${publicBase.replace(/\/+$/, "")}/`);
}

/** A field of a landing page or of its theme that holds an image: `imageUrl`, `imageUrls`, or anything named like an image. Other links (maps, social networks) are NOT images. */
const isImageKey = (key: string): boolean => /image/i.test(key);

/** Every image address of another website inside a piece of JSON (a page, a theme). */
export function collectImages(value: unknown, publicBase: string, found = new Set<string>(), key = ""): Set<string> {
  if (Array.isArray(value)) for (const v of value) collectImages(v, publicBase, found, key);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collectImages(v, publicBase, found, k);
  else if (isImageKey(key) && isExternalImage(value, publicBase)) found.add(value);
  return found;
}

/** The same JSON with each image address replaced by its new one (a copy: the input is not changed). */
export function rewriteImages<T>(value: T, map: ReadonlyMap<string, string>, key = ""): T {
  if (Array.isArray(value)) return value.map((v) => rewriteImages(v, map, key)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteImages(v, map, k)])) as T;
  if (isImageKey(key) && typeof value === "string" && map.has(value)) return map.get(value) as T;
  return value;
}

type Owner = { kind: "shop"; id: string; purpose: MediaPurpose } | { kind: "account"; id: string };
interface Work { owner: Owner; url: string }
export interface MirrorReport { found: number; copied: number; failed: string[]; rows: number }

const typeOf = (contentType: string | null): keyof typeof IMAGE_TYPES | null => {
  const t = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  return t in IMAGE_TYPES ? (t as keyof typeof IMAGE_TYPES) : null;
};

/** What the upload and download use (the tests put their own). */
export interface Io { download: (url: string) => Promise<{ body: Uint8Array; contentType: string | null } | null>; upload: (url: string, headers: Record<string, string>, body: Uint8Array) => Promise<boolean> }

export const defaultIo: Io = {
  async download(url) {
    // Only the image types we store are asked for, so a site that picks a format by the Accept header (Unsplash does) sends one we accept.
    const res = await fetch(url, { headers: { accept: "image/jpeg,image/png,image/webp" }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res || !res.ok) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    return { body, contentType: res.headers.get("content-type") };
  },
  async upload(url, headers, body) {
    const res = await fetch(url, { method: "PUT", headers, body: Buffer.from(body), signal: AbortSignal.timeout(60_000) }).catch(() => null);
    return res !== null && res.ok;
  },
};

/** Copies one image to the bucket; the new public address, or null when it could not be fetched, is too large, or is not an image we store. */
export async function copyImage(media: MediaService, io: Io, work: Work): Promise<string | null> {
  const got = await io.download(work.url);
  const type = got ? typeOf(got.contentType) : null;
  if (!got || !type || got.body.byteLength === 0 || got.body.byteLength > MAX_IMAGE_BYTES) return null;
  const input = { contentType: type, size: got.body.byteLength };
  const target = work.owner.kind === "shop" ? media.presign(work.owner.id, { ...input, purpose: work.owner.purpose }) : media.presignAvatar(work.owner.id, input);
  return (await io.upload(target.uploadUrl, target.headers, got.body)) ? target.publicUrl : null;
}

export async function mirrorImages(pool: Pool, media: MediaService, opts: { dryRun?: boolean; io?: Io } = {}): Promise<MirrorReport> {
  const io = opts.io ?? defaultIo;
  const base = media.publicUrl("").replace(/\/$/, "");
  const client = await pool.connect();
  const report: MirrorReport = { found: 0, copied: 0, failed: [], rows: 0 };
  try {
    const q = async <T extends Record<string, unknown>>(sql: string): Promise<T[]> => (await client.query(sql)).rows as T[];
    const shop = (id: unknown, purpose: MediaPurpose): Owner => ({ kind: "shop", id: String(id), purpose });
    const ext = (v: unknown) => (isExternalImage(v, base) ? [v] : []);
    const jsonImages = (...values: unknown[]) => [...new Set(values.flatMap((v) => [...collectImages(v, base)]))];

    // --- find the work ------------------------------------------------------------------------------------------------------------------------------
    const work = new Map<string, Work>(); // (one copy for each shop and address)
    const need = (owner: Owner, url: string) => { work.set(`${owner.kind}:${owner.id}:${owner.kind === "shop" ? owner.purpose : ""}:${url}`, { owner, url }); };

    const workshops = await q<{ id: string; organization_id: string; cover_url: string; gallery_urls: string[] }>("select id, organization_id, cover_url, gallery_urls from workshops");
    for (const w of workshops) for (const u of [...ext(w.cover_url), ...w.gallery_urls.flatMap(ext)]) need(shop(w.organization_id, "workshop"), u);
    const sessions = await q<{ id: string; organization_id: string; image_url: string | null }>("select id, organization_id, image_url from workshop_sessions where image_url is not null");
    for (const s of sessions) for (const u of ext(s.image_url)) need(shop(s.organization_id, "session"), u);
    const promotions = await q<{ id: string; organization_id: string; image_url: string | null }>("select id, organization_id, image_url from promotions where image_url is not null");
    for (const p of promotions) for (const u of ext(p.image_url)) need(shop(p.organization_id, "promotion"), u);
    const profiles = await q<{ user_id: string; avatar_url: string | null }>("select user_id, avatar_url from customer_profiles where avatar_url is not null");
    for (const p of profiles) for (const u of ext(p.avatar_url)) need({ kind: "account", id: p.user_id }, u);
    const pages = await q<{ id: string; organization_id: string; theme: unknown; draft_content: unknown; published_content: unknown; published_theme: unknown }>("select id, organization_id, theme, draft_content, published_content, published_theme from site_pages");
    for (const p of pages) for (const u of jsonImages(p.theme, p.draft_content, p.published_content, p.published_theme)) need(shop(p.organization_id, "site"), u);
    const versions = await q<{ id: string; organization_id: string; content: unknown; theme: unknown }>("select id, organization_id, content, theme from site_page_versions");
    for (const v of versions) for (const u of jsonImages(v.content, v.theme)) need(shop(v.organization_id, "site"), u);

    report.found = new Set([...work.values()].map((w) => w.url)).size;
    console.log(`Images of other websites: ${report.found} address(es), ${work.size} copy(ies) to make (${workshops.length} workshops, ${sessions.length} sessions, ${promotions.length} promotions, ${profiles.length} photos, ${pages.length} pages, ${versions.length} versions looked at).`);
    if (opts.dryRun || work.size === 0) return report;

    // --- copy (a few at a time) ---------------------------------------------------------------------------------------------------------------------
    const done = new Map<string, string>(); // work key -> new address
    const list = [...work.entries()];
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async ([key, w]) => {
        const url = await copyImage(media, io, w);
        if (url) done.set(key, url);
        else report.failed.push(w.url);
      }));
      if ((i / 6) % 5 === 4) console.log(`  copied ${done.size} of ${list.length}...`);
    }
    report.copied = done.size;
    const mapFor = (owner: Owner): Map<string, string> => {
      const m = new Map<string, string>();
      for (const [key, w] of work) if (done.has(key) && w.owner.kind === owner.kind && w.owner.id === owner.id && (owner.kind === "account" || (w.owner.kind === "shop" && w.owner.purpose === owner.purpose))) m.set(w.url, done.get(key)!);
      return m;
    };

    // --- write the new addresses, all or nothing ------------------------------------------------------------------------------------------------------
    await client.query("begin");
    try {
      const touch = async (sql: string, params: unknown[]) => { report.rows += (await client.query(sql, params)).rowCount ?? 0; };
      for (const w of workshops) {
        const m = mapFor(shop(w.organization_id, "workshop"));
        const cover = m.get(w.cover_url) ?? w.cover_url;
        const gallery = w.gallery_urls.map((u) => m.get(u) ?? u);
        if (cover !== w.cover_url || gallery.some((u, i) => u !== w.gallery_urls[i])) await touch("update workshops set cover_url = $2, gallery_urls = $3 where id = $1", [w.id, cover, gallery]);
      }
      for (const s of sessions) { const u = mapFor(shop(s.organization_id, "session")).get(s.image_url!); if (u) await touch("update workshop_sessions set image_url = $2 where id = $1", [s.id, u]); }
      for (const p of promotions) { const u = mapFor(shop(p.organization_id, "promotion")).get(p.image_url!); if (u) await touch("update promotions set image_url = $2 where id = $1", [p.id, u]); }
      for (const p of profiles) { const u = mapFor({ kind: "account", id: p.user_id }).get(p.avatar_url!); if (u) await touch("update customer_profiles set avatar_url = $2 where user_id = $1", [p.user_id, u]); }
      for (const p of pages) {
        const m = mapFor(shop(p.organization_id, "site"));
        if (m.size === 0) continue;
        await touch("update site_pages set theme = $2::jsonb, draft_content = $3::jsonb, published_content = $4::jsonb, published_theme = $5::jsonb where id = $1", [p.id, ...[p.theme, p.draft_content, p.published_content, p.published_theme].map((v) => (v === null ? null : JSON.stringify(rewriteImages(v, m))))]);
      }
      for (const v of versions) {
        const m = mapFor(shop(v.organization_id, "site"));
        if (m.size === 0) continue;
        await touch("update site_page_versions set content = $2::jsonb, theme = $3::jsonb where id = $1", [v.id, JSON.stringify(rewriteImages(v.content, m)), JSON.stringify(rewriteImages(v.theme, m))]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    return report;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  const media = new MediaService(env);
  if (!media.configured()) {
    console.log("R2 is not set up (R2_* in apps/api/.env): nothing was copied. Run pnpm --filter api r2:check once it is.");
    return;
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const report = await mirrorImages(pool, media, { dryRun: process.argv.includes("--dry-run") });
    console.log(`Done: ${report.copied} image(s) copied to R2, ${report.rows} row(s) updated, ${report.failed.length} could not be copied.`);
    for (const url of report.failed) console.log(`  not copied: ${url}`);
    if (report.failed.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("mirror-images.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "The copy failed.");
    process.exit(1);
  });
}
