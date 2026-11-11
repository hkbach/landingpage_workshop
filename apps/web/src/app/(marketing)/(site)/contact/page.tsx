import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LifeBuoy, ShieldCheck, Store } from "lucide-react";
import { ContactForm } from "@/components/marketing/contact-form";
import { Hero, heroRich } from "@/components/marketing/marketing-ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return { title: t("contactTitle"), description: t("contactDescription") };
}

const SIDE = [
  { key: "studio", icon: LifeBuoy },
  { key: "guest", icon: Store },
  { key: "privacy", icon: ShieldCheck },
] as const;

// The platform support contact configured by the administrator (FR-ADM-07) is never shown on a public page: this page is a form, and points a shop owner to the dashboard.
export default async function ContactPage() {
  const t = await getTranslations("marketing.contact");
  return (
    <>
      <Hero compact badge={t("hero.badge")} title={t.rich("hero.title", heroRich)} subtitle={t("hero.subtitle")} />
      <section className="px-4 pb-20 sm:px-6 sm:pb-28" data-testid="contact-section">
        <div className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
          <ContactForm />
          <aside aria-labelledby="side-title" className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
            <h2 id="side-title" className="text-xl font-semibold">{t("side.title")}</h2>
            <ul className="grid gap-5">
              {SIDE.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300"><Icon className="size-5" aria-hidden /></span>
                  <span className="grid gap-1">
                    <span className="font-medium">{t(`side.items.${key}.title`)}</span>
                    <span className="text-sm leading-relaxed text-white/70">{t(`side.items.${key}.body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </>
  );
}
