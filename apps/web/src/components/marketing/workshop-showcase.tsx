import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Clock, Sparkles, Star } from "lucide-react";
import { formatMoney, type Locale } from "@workshop/shared";
import { safeImage } from "@/components/sections/safe-url";
import { featuredWorkshops } from "@/lib/mock/showcase";
import { SectionHeading } from "./marketing-ui";

/**
 * The Workshops section of the home page: 10 workshops taken at random from the shops of the platform, each with its picture in a circle, its name, its shop, its price and its length.
 * A card leads to the landing page of the shop. The section is built on every request (the pick changes at every visit).
 */
export async function WorkshopShowcase() {
  const t = await getTranslations("marketing.workshops");
  const locale = (await getLocale()) as Locale;
  const items = featuredWorkshops(locale, 10);
  return (
    <section id="workshops" aria-labelledby="workshops-title" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24" data-testid="home-workshops">
      <div className="mx-auto max-w-7xl">
        <SectionHeading id="workshops-title" eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
        {items.length === 0 ? (
          <p className="mt-10 text-center text-white/70" data-testid="workshops-empty">{t("empty")}</p>
        ) : (
          <ul className="mt-12 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-5" data-testid="workshops-list">
            {items.map((w) => {
              const cover = safeImage(w.coverUrl);
              return (
                <li key={`${w.shopSlug}-${w.id}`} data-testid="workshop-card">
                  <Link href={`/sites/${w.shopSlug}`} className="group grid justify-items-center gap-3 rounded-2xl p-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={t("open", { title: w.title, shop: w.shopName })}>
                    {/* The picture of the workshop in a circle with a blue glow. */}
                    <span className="relative grid size-32 place-items-center rounded-full bg-gradient-to-br from-cyan-400/40 via-sky-500/30 to-violet-500/40 p-1 shadow-[0_0_36px_rgba(34,211,238,0.22)] transition duration-300 group-hover:scale-105 group-hover:shadow-[0_0_44px_rgba(34,211,238,0.4)] sm:size-36 lg:size-40">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full rounded-full border-2 border-[#050b1f] object-cover" data-testid="workshop-circle" />
                      ) : (
                        <span className="grid size-full place-items-center rounded-full border-2 border-[#050b1f] bg-[#07122e] text-cyan-300"><Sparkles className="size-8" aria-hidden /></span>
                      )}
                    </span>
                    <span className="line-clamp-2 min-h-[2.6em] text-base font-semibold leading-snug text-white group-hover:text-cyan-300">{w.title}</span>
                    <span className="-mt-1.5 line-clamp-1 text-sm text-white/65">{w.shopName}</span>
                    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/75">
                      <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 font-medium text-cyan-200">{t("price", { price: formatMoney(w.priceAmount, w.currency, locale) })}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{t("minutes", { n: w.durationMinutes })}</span>
                      {w.rating ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-amber-300 text-amber-300" aria-hidden /><span className="sr-only">{t("rating")}: </span>{w.rating.average.toFixed(1)}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
