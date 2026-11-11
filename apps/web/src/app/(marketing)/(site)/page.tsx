import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarClock, Gift, Heart, Languages, LayoutTemplate, MousePointerClick, ShieldCheck, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { ctaPrimary, ctaSecondary, FeatureCard, Hero, heroRich, SectionHeading } from "@/components/marketing/marketing-ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return { title: t("homeTitle"), description: t("homeDescription") };
}

const WHY = [
  { key: "page", icon: LayoutTemplate, tone: "cyan" },
  { key: "seats", icon: ShieldCheck, tone: "emerald" },
  { key: "languages", icon: Languages, tone: "violet" },
  { key: "payments", icon: Wallet, tone: "amber" },
  { key: "guests", icon: Users, tone: "cyan" },
  { key: "growth", icon: TrendingUp, tone: "emerald" },
] as const;
const STEPS = ["create", "design", "share"] as const;
const GUESTS = [
  { key: "book", icon: MousePointerClick, tone: "cyan" },
  { key: "today", icon: CalendarClock, tone: "emerald" },
  { key: "favorites", icon: Heart, tone: "violet" },
  { key: "earn", icon: Gift, tone: "amber" },
] as const;
const STATS = ["languages", "seats", "always"] as const;
const FAQ = ["q1", "q2", "q3", "q4", "q5"] as const;

export default async function MarketingHome() {
  const t = await getTranslations("marketing");
  return (
    <>
      <Hero badge={t("hero.badge")} title={t.rich("hero.title", heroRich)} subtitle={t("hero.subtitle")}>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup" className={ctaPrimary} data-testid="home-cta">{t("hero.cta")}<Sparkles className="size-4" aria-hidden /></Link>
          <a href="#how" className={ctaSecondary}>{t("hero.secondary")}<ArrowRight className="size-4" aria-hidden /></a>
        </div>
        <p className="mt-5 text-sm text-white/55">{t("hero.note")}</p>
        {/* Three facts of the product, in the place of the logos of the reference design. */}
        <ul className="mx-auto mt-14 grid max-w-4xl gap-6 border-t border-white/10 pt-8 text-left sm:grid-cols-3" data-testid="home-stats">
          {STATS.map((k) => (
            <li key={k} className="flex items-center gap-4 sm:block">
              <p className="text-4xl font-semibold tracking-tight text-white">{t(`stats.${k}.value`)}</p>
              <p className="text-sm text-white/65 sm:mt-1">{t(`stats.${k}.label`)}</p>
            </li>
          ))}
        </ul>
      </Hero>

      <section aria-labelledby="why-title" className="px-4 py-16 sm:px-6 sm:py-24" data-testid="home-why">
        <div className="mx-auto max-w-7xl">
          <SectionHeading id="why-title" eyebrow={t("why.eyebrow")} title={t("why.title")} intro={t("why.intro")} />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map(({ key, icon, tone }) => <FeatureCard key={key} icon={icon} tone={tone} title={t(`why.items.${key}.title`)} body={t(`why.items.${key}.body`)} />)}
          </ul>
        </div>
      </section>

      <section id="how" aria-labelledby="how-title" className="scroll-mt-20 bg-white/[0.03] px-4 py-16 sm:px-6 sm:py-24" data-testid="home-how">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="how-title" eyebrow={t("how.eyebrow")} title={t("how.title")} />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="relative rounded-2xl border border-white/10 bg-[#07122e] p-6">
                <span className="grid size-10 place-items-center rounded-full bg-cyan-400 text-base font-bold text-slate-950">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{t(`how.steps.${s}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{t(`how.steps.${s}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="guests-title" className="px-4 py-16 sm:px-6 sm:py-24" data-testid="home-guests">
        <div className="mx-auto max-w-7xl">
          <SectionHeading id="guests-title" eyebrow={t("guests.eyebrow")} title={t("guests.title")} intro={t("guests.intro")} />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {GUESTS.map(({ key, icon, tone }) => <FeatureCard key={key} icon={icon} tone={tone} title={t(`guests.items.${key}.title`)} body={t(`guests.items.${key}.body`)} />)}
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="bg-white/[0.03] px-4 py-16 sm:px-6 sm:py-24" data-testid="home-faq">
        <div className="mx-auto max-w-3xl">
          <SectionHeading id="faq-title" title={t("faq.title")} />
          <div className="mt-10 grid gap-3">
            {FAQ.map((q) => (
              <details key={q} className="group rounded-2xl border border-white/10 bg-[#07122e] p-5 open:border-cyan-400/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-white marker:content-none">
                  {t(`faq.items.${q}.q`)}
                  <span aria-hidden className="text-xl leading-none text-cyan-300 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{t(`faq.items.${q}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24" data-testid="home-cta-band">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 p-8 text-center sm:p-14" style={{ background: "radial-gradient(70% 90% at 50% 0%, rgba(34,211,238,0.25), transparent 70%), linear-gradient(180deg, #0a1a3f, #07122e)" }}>
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
