// Every field of the props of each landing page section type, empty. The API refuses a section that lacks a field (the same rule as the editor), so a test that is not about that rule builds
// its sections from these and changes only what it is about.
const EMPTY: Record<string, Record<string, unknown>> = {
  hero: { title: {}, subtitle: {}, imageUrl: "", ctaText: {} },
  about: { heading: {}, body: {}, imageUrl: "" },
  workshops: { heading: {} },
  promotions: { heading: {} },
  gallery: { heading: {}, imageUrls: [] },
  team: { heading: {}, members: [] },
  testimonials: { heading: {}, items: [] },
  faq: { heading: {}, items: [] },
  location: { heading: {}, address: {}, hours: {}, mapsUrl: "" },
  contact: { heading: {}, phone: "", whatsapp: "", email: "", socials: [] },
  video: { heading: {}, caption: {}, videos: [] },
  footer: { text: {}, socials: [] },
};

export const completeProps = (type: string, props: Record<string, unknown> = {}): Record<string, unknown> => ({ ...(EMPTY[type] ?? {}), ...props });
