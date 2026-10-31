import { z } from "zod";
import { LOCALES, type Localized, type SectionType } from "@workshop/shared";
import { isAllowedMapsUrl, isHttpsUrl } from "./safe-url";

// Section registry (FR-SITE-02): per type -> schema, defaults, and a field descriptor that drives the generic editor.

export type FieldDef =
  | { kind: "localized"; key: string; max: number; multiline?: boolean }
  | { kind: "plain"; key: string; max: number; inputType?: "text" | "tel" | "email" }
  | { kind: "image"; key: string }
  | { kind: "link"; key: string }
  | { kind: "maps"; key: string }
  | { kind: "select"; key: string; options: readonly string[] }
  | { kind: "imageList"; key: string; max: number }
  | { kind: "list"; key: string; max: number; titleKey: string; fields: FieldDef[]; newItem: () => Record<string, unknown> };

export interface SectionDef {
  type: SectionType;
  schemaVersion: 1;
  schema: z.ZodType<Record<string, unknown>>;
  defaultProps: () => Record<string, unknown>;
  fields: FieldDef[];
  /** Shown in the builder with an authenticity reminder. */
  authenticityNote?: boolean;
  /** Content comes from the workshop catalogue, not from the section props. */
  autoContent?: boolean;
  removable: boolean;
}

const optStr = (max: number) => z.string().max(max).optional();
const localized = (max: number) =>
  z.object(Object.fromEntries(LOCALES.map((l) => [l, optStr(max)])) as Record<(typeof LOCALES)[number], z.ZodOptional<z.ZodString>>);
const imageUrl = z.string().max(2000).refine((v) => v === "" || isHttpsUrl(v), { message: "https_url" });
const linkUrl = z.string().max(2000).refine((v) => v === "" || isHttpsUrl(v), { message: "https_url" });
const mapsUrl = z.string().max(2000).refine((v) => v === "" || isAllowedMapsUrl(v), { message: "maps_url" });
const socials = z.array(z.object({ label: z.string().max(40), url: linkUrl })).max(6);
const asSchema = (s: z.ZodType<unknown>) => s as unknown as z.ZodType<Record<string, unknown>>;

const SOCIAL_FIELDS: FieldDef = {
  kind: "list", key: "socials", max: 6, titleKey: "label",
  fields: [{ kind: "plain", key: "label", max: 40 }, { kind: "link", key: "url" }],
  newItem: () => ({ label: "", url: "" }),
};

// Default FAQ entry about late arrival (shop content, editable by the shop). Mirrors BR-09.
export const LATE_POLICY_FAQ: { q: Localized; a: Localized } = {
  q: {
    en: "What if I arrive late?",
    vi: "Nếu tôi đến trễ thì sao?",
    ko: "늦게 도착하면 어떻게 되나요?",
    ja: "遅刻した場合はどうなりますか？",
  },
  a: {
    en: "Please arrive on time. If you arrive more than 30 minutes late, your booking may be released and your spot may be offered to walk-in guests. If spots are still available when you arrive, you may still be able to join.",
    vi: "Vui lòng đến đúng giờ. Nếu bạn đến trễ hơn 30 phút, đặt chỗ có thể bị hủy giữ chỗ và chỗ của bạn có thể được nhường cho khách đến trực tiếp. Nếu khi bạn đến vẫn còn chỗ, bạn vẫn có thể tham gia.",
    ko: "정시에 도착해 주세요. 30분 이상 늦으면 예약이 해제되어 자리가 현장 방문 고객에게 제공될 수 있습니다. 도착했을 때 자리가 남아 있다면 참여하실 수 있습니다.",
    ja: "時間通りにお越しください。30分以上遅れた場合、予約が解除され、席が飛び込みのお客様に提供されることがあります。到着時に空席があればご参加いただける場合があります。",
  },
};

export const SECTION_REGISTRY: Record<SectionType, SectionDef> = {
  hero: {
    type: "hero", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({ title: localized(120), subtitle: localized(240), imageUrl, ctaText: localized(40) })),
    defaultProps: () => ({ title: { en: "Make something with your hands" }, subtitle: { en: "Hands-on workshops, no experience needed" }, imageUrl: "", ctaText: { en: "Book a workshop" } }),
    fields: [
      { kind: "localized", key: "title", max: 120 }, { kind: "localized", key: "subtitle", max: 240 },
      { kind: "image", key: "imageUrl" }, { kind: "localized", key: "ctaText", max: 40 },
    ],
  },
  about: {
    type: "about", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({ heading: localized(80), body: localized(2000), imageUrl })),
    defaultProps: () => ({ heading: { en: "About us" }, body: { en: "" }, imageUrl: "" }),
    fields: [{ kind: "localized", key: "heading", max: 80 }, { kind: "localized", key: "body", max: 2000, multiline: true }, { kind: "image", key: "imageUrl" }],
  },
  workshops: {
    type: "workshops", schemaVersion: 1, removable: true, autoContent: true,
    schema: asSchema(z.object({ heading: localized(80), layout: z.enum(["grid", "list"]) })),
    defaultProps: () => ({ heading: { en: "Our workshops" }, layout: "grid" }),
    fields: [{ kind: "localized", key: "heading", max: 80 }, { kind: "select", key: "layout", options: ["grid", "list"] }],
  },
  gallery: {
    type: "gallery", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({ heading: localized(80), imageUrls: z.array(imageUrl).max(12) })),
    defaultProps: () => ({ heading: { en: "Gallery" }, imageUrls: [] }),
    fields: [{ kind: "localized", key: "heading", max: 80 }, { kind: "imageList", key: "imageUrls", max: 12 }],
  },
  team: {
    type: "team", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({
      heading: localized(80),
      members: z.array(z.object({ name: z.string().max(80), role: localized(80), bio: localized(300), imageUrl })).max(12),
    })),
    defaultProps: () => ({ heading: { en: "Meet the team" }, members: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 },
      {
        kind: "list", key: "members", max: 12, titleKey: "name",
        fields: [{ kind: "plain", key: "name", max: 80 }, { kind: "localized", key: "role", max: 80 }, { kind: "localized", key: "bio", max: 300, multiline: true }, { kind: "image", key: "imageUrl" }],
        newItem: () => ({ name: "", role: {}, bio: {}, imageUrl: "" }),
      },
    ],
  },
  testimonials: {
    type: "testimonials", schemaVersion: 1, removable: true, authenticityNote: true,
    schema: asSchema(z.object({
      heading: localized(80),
      items: z.array(z.object({ name: z.string().max(80), country: z.string().max(60), text: localized(500) })).max(12),
    })),
    defaultProps: () => ({ heading: { en: "What guests say" }, items: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 },
      {
        kind: "list", key: "items", max: 12, titleKey: "name",
        fields: [{ kind: "plain", key: "name", max: 80 }, { kind: "plain", key: "country", max: 60 }, { kind: "localized", key: "text", max: 500, multiline: true }],
        newItem: () => ({ name: "", country: "", text: {} }),
      },
    ],
  },
  faq: {
    type: "faq", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({ heading: localized(80), items: z.array(z.object({ q: localized(200), a: localized(1000) })).max(20) })),
    defaultProps: () => ({ heading: { en: "FAQ" }, items: [{ q: { ...LATE_POLICY_FAQ.q }, a: { ...LATE_POLICY_FAQ.a } }] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 },
      {
        kind: "list", key: "items", max: 20, titleKey: "q",
        fields: [{ kind: "localized", key: "q", max: 200 }, { kind: "localized", key: "a", max: 1000, multiline: true }],
        newItem: () => ({ q: {}, a: {} }),
      },
    ],
  },
  location: {
    type: "location", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({ heading: localized(80), address: localized(300), hours: localized(300), mapsUrl })),
    defaultProps: () => ({ heading: { en: "Find us" }, address: { en: "" }, hours: { en: "" }, mapsUrl: "" }),
    fields: [
      { kind: "localized", key: "heading", max: 80 }, { kind: "localized", key: "address", max: 300 },
      { kind: "localized", key: "hours", max: 300, multiline: true }, { kind: "maps", key: "mapsUrl" },
    ],
  },
  contact: {
    type: "contact", schemaVersion: 1, removable: true,
    schema: asSchema(z.object({
      heading: localized(80), phone: z.string().max(40), whatsapp: z.string().max(40),
      email: z.string().max(120).refine((v) => v === "" || z.email().safeParse(v).success, { message: "email" }), socials,
    })),
    defaultProps: () => ({ heading: { en: "Contact" }, phone: "", whatsapp: "", email: "", socials: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 }, { kind: "plain", key: "phone", max: 40, inputType: "tel" },
      { kind: "plain", key: "whatsapp", max: 40, inputType: "tel" }, { kind: "plain", key: "email", max: 120, inputType: "email" }, SOCIAL_FIELDS,
    ],
  },
  footer: {
    type: "footer", schemaVersion: 1, removable: false,
    schema: asSchema(z.object({ text: localized(200), socials })),
    defaultProps: () => ({ text: { en: "" }, socials: [] }),
    fields: [{ kind: "localized", key: "text", max: 200 }, SOCIAL_FIELDS],
  },
};

export const ADDABLE_TYPES: SectionType[] = ["hero", "about", "workshops", "gallery", "team", "testimonials", "faq", "location", "contact"];

export function createSection(type: SectionType) {
  return { id: crypto.randomUUID(), type, enabled: true, props: SECTION_REGISTRY[type].defaultProps() };
}

/** Collect the non-empty localized values of a section's props (used for missing-translation warnings). */
export function collectLocalized(fields: FieldDef[], props: Record<string, unknown>): Localized[] {
  const out: Localized[] = [];
  for (const f of fields) {
    const v = props[f.key];
    if (f.kind === "localized") {
      const loc = (v ?? {}) as Localized;
      // Optional text that is empty in every language is not flagged.
      if (Object.values(loc).some((s) => s?.trim())) out.push(loc);
    } else if (f.kind === "list" && Array.isArray(v)) {
      for (const item of v) out.push(...collectLocalized(f.fields, item as Record<string, unknown>));
    }
  }
  return out;
}

export function validateSection(type: SectionType, props: Record<string, unknown>): string[] {
  const res = SECTION_REGISTRY[type].schema.safeParse(props);
  return res.success ? [] : res.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
}
