import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Feather, Gem, Scale, ShieldCheck, Sparkles, Languages, LayoutTemplate, LifeBuoy } from "lucide-react";
import { ctaPrimary, ctaSecondary, FeatureCard, Hero, heroRich, SectionHeading } from "@/components/marketing/marketing-ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return { title: t("aboutTitle"), description: t("aboutDescription") };
}

const VALUES = [
  { key: "craft", icon: Gem, tone: "violet" },
  { key: "trust", icon: ShieldCheck, tone: "emerald" },
  { key: "simple", icon: Feather, tone: "cyan" },
  { key: "fair", icon: Scale, tone: "amber" },
] as const;
const DIFF = [
  { key: "a", icon: LayoutTemplate, tone: "cyan" },
  { key: "b", icon: Languages, tone: "violet" },
  { key: "c", icon: LifeBuoy, tone: "emerald" },
] as const;

export default async function AboutPage() {
  const t = await getTranslations("marketing.about");
  return (
    <>
      <Hero compact badge={t("hero.badge")} title={t.rich("hero.title", heroRich)} subtitle={t("hero.subtitle")} />

      <section aria-labelledby="mission-title" className="px-4 py-16 sm:px-6 sm:py-20" data-testid="about-mission">
        <div className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[1fr_1.4fr]">
          <h2 id="mission-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("mission.title")}</h2>
          <div className="grid gap-4 text-base leading-relaxed text-white/75 sm:text-lg">
            <p>{t("mission.body1")}</p>
            <p>{t("mission.body2")}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="values-title" className="bg-white/[0.03] px-4 py-16 sm:px-6 sm:py-24" data-testid="about-values">
        <div className="mx-auto max-w-7xl">
          <SectionHeading id="values-title" title={t("values.title")} />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ key, icon, tone }) => <FeatureCard key={key} icon={icon} tone={tone} title={t(`values.items.${key}.title`)} body={t(`values.items.${key}.body`)} />)}
          </ul>
        </div>
      </section>

      <section aria-labelledby="diff-title" className="px-4 py-16 sm:px-6 sm:py-24" data-testid="about-difference">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="diff-title" title={t("difference.title")} />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {DIFF.map(({ key, icon, tone }) => <FeatureCard key={key} icon={icon} tone={tone} title={t(`difference.items.${key}.title`)} body={t(`difference.items.${key}.body`)} />)}
          </ul>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 p-8 text-center sm:p-14" style={{ background: "radial-gradient(70% 90% at 50% 0%, rgba(99,102,241,0.30), transparent 70%), linear-gradient(180deg, #0a1a3f, #07122e)" }}>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("cta.title")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/75">{t("cta.body")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={ctaPrimary}>{t("cta.button")}<Sparkles className="size-4" aria-hidden /></Link>
            <Link href="/contact" className={ctaSecondary}>{t("cta.secondary")}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
