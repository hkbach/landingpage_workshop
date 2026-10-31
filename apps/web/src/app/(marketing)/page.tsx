import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarCheck, Globe, LayoutTemplate, Users, Wallet, Languages } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const STEPS = ["create", "design", "share"] as const;
const FEATURES = [
  { key: "builder", icon: LayoutTemplate },
  { key: "booking", icon: CalendarCheck },
  { key: "multilingual", icon: Languages },
  { key: "payments", icon: Wallet },
  { key: "customers", icon: Users },
  { key: "subdomain", icon: Globe },
] as const;

export default async function MarketingHome() {
  const t = await getTranslations("marketing");
  const tc = await getTranslations("common");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="font-semibold">{tc("appName")}</Link>
          <nav aria-label={t("nav.label")} className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost" })}>{t("nav.login")}</Link>
            <Link href="/signup" className={buttonVariants()}>{t("nav.signup")}</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t("hero.title")}</h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">{t("hero.subtitle")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-11 px-6 text-base" })}>{t("hero.cta")}</Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 px-6 text-base" })}>{t("hero.secondary")}</Link>
          </div>
        </section>

        <section aria-labelledby="how-title" className="bg-muted/40 py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 id="how-title" className="text-center text-2xl font-semibold">{t("how.title")}</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{t(`how.steps.${s}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`how.steps.${s}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="features-title" className="py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 id="features-title" className="text-center text-2xl font-semibold">{t("features.title")}</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <li key={key} className="rounded-xl p-5 ring-1 ring-foreground/10">
                  <Icon className="size-6" aria-hidden />
                  <h3 className="mt-3 font-semibold">{t(`features.items.${key}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`features.items.${key}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-primary py-14 text-primary-foreground">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h2 className="text-2xl font-semibold">{t("cta.title")}</h2>
            <p className="mt-2 opacity-90">{t("cta.body")}</p>
            <Link href="/signup" className={buttonVariants({ variant: "secondary", size: "lg", className: "mt-6 h-11 px-6 text-base" })}>{t("cta.button")}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {t("footer", { year: 2026, name: tc("appName") })}
      </footer>
    </div>
  );
}
