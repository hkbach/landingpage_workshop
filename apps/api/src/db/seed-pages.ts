import { checkSectionProps, isSectionType } from "@workshop/shared";
import type { PageContent } from "./schema/site";
import type { ShopSeed, Text, WorkshopSeed } from "./seed-data";

// The landing page of a demo shop: every section with ALL the fields of its type (the one validation rule of the API and the editor refuses a page with missing fields), real photographs, and the
// colours of one of the palettes of the editor. `buildPage` checks its own result with that rule, so a seed that makes a page the API would refuse stops at once.

const PALETTES: Record<string, { primary: string; background: string; surface: string; text: string }> = {
  warm: { primary: "#9a3412", background: "#fffaf5", surface: "#fff1e6", text: "#292524" },
  ocean: { primary: "#0f5f8a", background: "#f6fbfe", surface: "#e4f2f9", text: "#0f172a" },
  forest: { primary: "#2f6b3a", background: "#f7fbf6", surface: "#e6f2e4", text: "#14211a" },
  plum: { primary: "#7e2a7a", background: "#fdf8fd", surface: "#f6e8f5", text: "#2a1429" },
  mono: { primary: "#27272a", background: "#ffffff", surface: "#f4f4f5", text: "#18181b" },
  sunset: { primary: "#b4232a", background: "#fffafa", surface: "#fdeaea", text: "#2b1517" },
  noir: { primary: "#e5b94f", background: "#121214", surface: "#1e1e23", text: "#f4f4f5" },
  sage: { primary: "#3b6a4b", background: "#f6f8f5", surface: "#e7eee6", text: "#1e2b22" },
  indigo: { primary: "#2a3f7a", background: "#f8f6f0", surface: "#ebe7db", text: "#1f2430" },
  magenta: { primary: "#a21caf", background: "#fffbff", surface: "#fbeafc", text: "#2b1030" },
};

const RADII = ["md", "lg", "xl", "sm"] as const;
const DENSITIES = ["comfortable", "spacious", "compact"] as const;

/** The same sentence in English, Vietnamese and the language of the shop (when it is another one). */
function say(cfg: ShopSeed, en: string, vi: string, local?: string): Text {
  const out: Text = { en, vi };
  if (local && cfg.defaultLocale !== "en" && cfg.defaultLocale !== "vi") out[cfg.defaultLocale] = local;
  return out;
}

export interface BuiltPage { theme: Record<string, unknown>; content: PageContent & { layout: string } }

export function buildPage(cfg: ShopSeed, workshops: WorkshopSeed[], hasPromotions: boolean, over: { palette?: string; title?: string } = {}): BuiltPage {
  const page = cfg.page!;
  const paletteKey = over.palette ?? page.palette;
  const colors = PALETTES[paletteKey] ?? PALETTES.warm!;
  const index = Math.abs([...cfg.slug].reduce((a, c) => a + c.charCodeAt(0), 0));
  const theme = { palette: paletteKey, ...colors, font: page.font, radius: RADII[index % RADII.length], density: DENSITIES[index % DENSITIES.length] };

  const first = workshops[0]!;
  const gallery = [...new Set(workshops.flatMap((w) => [w.cover, ...w.gallery]))].slice(0, 8);
  const title = over.title ?? cfg.name;
  const sections: PageContent["sections"] = [
    {
      id: "hero", type: "hero", enabled: true,
      props: {
        title: say(cfg, title, title, over.title ? undefined : first.title[cfg.defaultLocale]),
        subtitle: say(cfg, "Small-group workshops, real ingredients, a teacher at every table.", "Workshop nhóm nhỏ, nguyên liệu thật, mỗi bàn có một người hướng dẫn.", first.short[cfg.defaultLocale]),
        imageUrl: first.cover,
        ctaText: say(cfg, "Book a seat", "Đặt chỗ", undefined),
      },
    },
    {
      id: "about", type: "about", enabled: true,
      props: {
        heading: say(cfg, `About ${cfg.name}`, `Về ${cfg.name}`),
        body: say(cfg, "We teach one craft at a time, with small groups so everybody gets their hands dirty. You leave with what you made and the recipe to do it again.", "Chúng tôi dạy từng nghề một, nhóm nhỏ để ai cũng được tự tay làm. Bạn mang về thành phẩm và công thức để làm lại tại nhà."),
        imageUrl: gallery[1] ?? first.cover,
      },
    },
    { id: "workshops", type: "workshops", enabled: true, props: { heading: say(cfg, "Our workshops", "Các workshop của chúng tôi") } },
  ];
  if (hasPromotions) sections.push({ id: "promotions", type: "promotions", enabled: true, props: { heading: say(cfg, "Offers", "Ưu đãi") } });
  sections.push(
    { id: "gallery", type: "gallery", enabled: true, props: { heading: say(cfg, "In the studio", "Trong studio"), imageUrls: gallery } },
    {
      id: "testimonials", type: "testimonials", enabled: true,
      props: {
        heading: say(cfg, "What guests say", "Khách hàng nói gì"),
        items: [
          { name: "Emma W.", country: "United Kingdom", text: say(cfg, "The best afternoon of my trip. Small group, patient teacher.", "Buổi chiều tuyệt nhất trong chuyến đi. Nhóm nhỏ, thầy cô rất kiên nhẫn.") },
          { name: "Minh T.", country: "Vietnam", text: say(cfg, "Worth every dong: I cooked the dish again at home the next day.", "Rất đáng tiền: hôm sau mình đã làm lại món đó ở nhà.") },
          { name: "Yuki T.", country: "Japan", text: say(cfg, "Clear steps and friendly people. I will bring my friends.", "Các bước rõ ràng, mọi người thân thiện. Mình sẽ rủ bạn bè đến.") },
        ],
      },
    },
    {
      id: "faq", type: "faq", enabled: true,
      props: {
        heading: say(cfg, "Questions", "Câu hỏi thường gặp"),
        items: [
          { q: say(cfg, "Do I need experience?", "Tôi có cần kinh nghiệm không?"), a: say(cfg, "No. Every workshop starts from the beginning.", "Không. Mọi workshop đều bắt đầu từ con số không.") },
          { q: say(cfg, "Can I cancel?", "Tôi có thể hủy không?"), a: say(cfg, "Write to us before the session starts and we will release your seat.", "Hãy báo trước giờ bắt đầu để chúng tôi nhả chỗ cho bạn.") },
          { q: say(cfg, "Is there a private group?", "Có nhận nhóm riêng không?"), a: say(cfg, "Yes, contact us with the size of your group and a date.", "Có, hãy liên hệ với số người và ngày bạn muốn.") },
        ],
      },
    },
    {
      id: "location", type: "location", enabled: true,
      props: { heading: say(cfg, "Find us", "Tìm chúng tôi"), address: say(cfg, cfg.address, cfg.address), hours: say(cfg, "Tue to Sun, 9:00 to 20:00", "Thứ Ba đến Chủ Nhật, 9:00 đến 20:00"), mapsUrl: cfg.mapsUrl },
    },
    {
      id: "contact", type: "contact", enabled: true,
      props: {
        heading: say(cfg, "Contact", "Liên hệ"), phone: cfg.phone, whatsapp: cfg.whatsapp, email: cfg.owner.email,
        socials: [{ label: "Instagram", url: `https://www.instagram.com/${cfg.slug}` }, { label: "Facebook", url: `https://www.facebook.com/${cfg.slug}` }],
      },
    },
    { id: "footer", type: "footer", enabled: true, props: { text: say(cfg, `© ${cfg.name}. Demo data for testing.`, `© ${cfg.name}. Dữ liệu mẫu để kiểm thử.`), socials: [{ label: "Instagram", url: `https://www.instagram.com/${cfg.slug}` }] } },
  );

  // the one rule of the API and the editor: a seed must never make a page that they would refuse
  for (const s of sections) {
    if (!isSectionType(s.type)) throw new Error(`Unknown section type ${s.type}`);
    const checked = checkSectionProps(s.type, s.props);
    if (!checked.success) throw new Error(`Seed page of ${cfg.slug}: section ${s.id} is not valid: ${JSON.stringify(checked.error.issues.slice(0, 2))}`);
  }

  return {
    theme,
    content: {
      schemaVersion: 1, layout: page.template, sections,
      seo: { title: say(cfg, title, title), description: say(cfg, `Book a workshop at ${cfg.name}.`, `Đặt workshop tại ${cfg.name}.`) },
    },
  };
}
