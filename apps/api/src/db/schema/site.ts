import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

// The landing pages of a shop (REQUIREMENTS 8.2, FR-SITE-07: at most 2 pages, 1 of them public). The owner edits `draft_content` (autosaved); Publish copies it to `published_content`, which is
// what the public page shows. A draft never touches the live page. Every publish is a row of site_page_versions, so a page can be put back.
export interface PageContent {
  schemaVersion: 1;
  sections: { id: string; type: string; enabled: boolean; props: Record<string, unknown>; style?: Record<string, string> }[];
  seo: { title: Record<string, string>; description: Record<string, string> };
}

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const sitePages = pgTable(
  "site_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    templateKey: text("template_key").notNull().default("classic"),
    theme: jsonb("theme").notNull().default({}).$type<Record<string, unknown>>(),
    draftContent: jsonb("draft_content").$type<PageContent>(),
    publishedContent: jsonb("published_content").$type<PageContent>(),
    publishedTheme: jsonb("published_theme").$type<Record<string, unknown>>(),
    publishedTemplateKey: text("published_template_key"),
    /** 0 until the first publish; +1 at every publish. */
    version: integer("version").notNull().default(0),
    /** The page the public sees: at most one per shop (a partial unique index). */
    isLive: boolean("is_live").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("site_pages_org_id_unique").on(t.organizationId, t.id),
    uniqueIndex("site_pages_one_live_per_org").on(t.organizationId).where(sql`${t.isLive}`),
    check("site_pages_name", sql`char_length(btrim(${t.name})) BETWEEN 1 AND 60`),
    check("site_pages_live_needs_content", sql`NOT ${t.isLive} OR ${t.publishedContent} IS NOT NULL`),
    index("site_pages_org_idx").on(t.organizationId, t.createdAt),
  ],
);

export const sitePageVersions = pgTable(
  "site_page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    pageId: uuid("page_id").notNull(),
    version: integer("version").notNull(),
    templateKey: text("template_key").notNull(),
    content: jsonb("content").notNull().$type<PageContent>(),
    theme: jsonb("theme").notNull().$type<Record<string, unknown>>(),
    publishedBy: uuid("published_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.pageId], foreignColumns: [sitePages.organizationId, sitePages.id], name: "site_page_versions_page_fk" }),
    unique("site_page_versions_page_version_unique").on(t.pageId, t.version),
  ],
);
