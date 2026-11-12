import { z } from "zod";
import { LANDING_PAGE_NAME_MAX, LOCALES, SECTION_TYPES } from "@workshop/shared";

// FR-SITE-02. The backend checks the STRUCTURE of a page (the section types, hero first and footer last, sizes, the languages) and refuses what is not text. The props of each section type are
// validated by the registry of the web app (apps/web/src/components/sections); TODO(shared): move that registry to packages/shared so this check can be as strict as the editor.
export const MAX_SECTIONS = 40;
export const MAX_CONTENT_BYTES = 200_000;
const MAX_TEXT = 5_000;
const MAX_DEPTH = 6;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype", "dangerouslySetInnerHTML", "innerHTML", "html", "script", "style_raw", "css"]);

const locale = z.enum(LOCALES);
const localized = z.partialRecord(locale, z.string().trim().max(MAX_TEXT, "tooLong")).transform((v) => Object.fromEntries(Object.entries(v).filter(([, t]) => t !== "")));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colorInvalid");

/** Props are plain data: strings (trimmed, bounded), numbers, booleans, arrays and objects up to a depth. No key can name HTML, CSS or script; no function can exist in JSON. */
function checkProps(value: unknown, depth: number, path: (string | number)[], ctx: z.RefinementCtx): void {
  if (value === null || typeof value === "number" || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > MAX_TEXT) ctx.addIssue({ code: "custom", path, message: "tooLong" });
    return;
  }
  if (depth > MAX_DEPTH) { ctx.addIssue({ code: "custom", path, message: "tooDeep" }); return; }
  if (Array.isArray(value)) {
    if (value.length > 100) ctx.addIssue({ code: "custom", path, message: "tooMany" });
    value.forEach((v, i) => checkProps(v, depth + 1, [...path, i], ctx));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) { ctx.addIssue({ code: "custom", path: [...path, k], message: "forbiddenKey" }); continue; }
      checkProps(v, depth + 1, [...path, k], ctx);
    }
    return;
  }
  ctx.addIssue({ code: "custom", path, message: "invalid" });
}

const section = z.object({
  id: z.string({ error: "required" }).trim().min(1, "required").max(64, "tooLong").regex(/^[A-Za-z0-9_-]+$/, "invalid"),
  type: z.enum(SECTION_TYPES, { error: "invalid" }),
  enabled: z.boolean({ error: "invalid" }),
  props: z.record(z.string(), z.unknown(), { error: "invalid" }).superRefine((v, ctx) => checkProps(v, 0, [], ctx)),
  /** A section may override its colours (background, text, accent): hex only, never CSS (REQUIREMENTS FR-SITE-02). */
  style: z.object({ background: hex.optional(), text: hex.optional(), accent: hex.optional() }).strict().optional(),
});

export const pageContentSchema = z
  .object({
    schemaVersion: z.literal(1, { error: "invalid" }),
    sections: z.array(section, { error: "invalid" }).max(MAX_SECTIONS, "tooMany"),
    seo: z.object({ title: localized.default({}), description: localized.default({}) }).default({ title: {}, description: {} }),
  })
  .superRefine((v, ctx) => {
    const ids = v.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["sections"], message: "duplicateId" });
    // Hero is always the first section and Footer the last, once each (FR-SITE-02).
    const types = v.sections.map((s) => s.type);
    if (types[0] !== "hero") ctx.addIssue({ code: "custom", path: ["sections", 0], message: "heroFirst" });
    if (types.at(-1) !== "footer") ctx.addIssue({ code: "custom", path: ["sections", Math.max(0, v.sections.length - 1)], message: "footerLast" });
    if (types.filter((t) => t === "hero").length > 1) ctx.addIssue({ code: "custom", path: ["sections"], message: "heroOnce" });
    if (types.filter((t) => t === "footer").length > 1) ctx.addIssue({ code: "custom", path: ["sections"], message: "footerOnce" });
    if (JSON.stringify(v).length > MAX_CONTENT_BYTES) ctx.addIssue({ code: "custom", path: ["sections"], message: "tooLarge" });
  });

/** The theme is a bag of tokens: hex colours, a font from the allowed list, a few switches. Plain data too. */
export const themeSchema = z.record(z.string().max(40), z.unknown()).superRefine((v, ctx) => {
  checkProps(v, 0, [], ctx);
  for (const k of ["primary", "background", "text", "button"]) {
    const c = v[k];
    if (c !== undefined && !(typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c))) ctx.addIssue({ code: "custom", path: [k], message: "colorInvalid" });
  }
});

const templateKey = z.string().trim().regex(/^[a-z][a-z0-9-]{1,30}$/, "invalid");

export const pageCreateSchema = z.object({ name: z.string({ error: "required" }).trim().min(1, "required").max(LANDING_PAGE_NAME_MAX, "tooLong"), templateKey: templateKey.optional() });
export const draftSchema = z.object({ content: pageContentSchema, theme: themeSchema.optional(), templateKey: templateKey.optional() });
export type PageContentInput = z.infer<typeof pageContentSchema>;
