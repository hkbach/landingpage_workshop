import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Globe, PartyPopper } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import type { Shop } from "@/lib/types";

/**
 * What a shop that signed up shows in its owner area for now: the shop was created (DRAFT) with the address made from its name. The tools of the owner area (bookings, workshops, sessions, landing
 * pages...) read the demo shop in this prototype, so a new shop does not show them (it would show another shop's data); they work with the real backend. TODO(api): one tenant for every shop.
 */
export async function NewShopWelcome({ shop, setupDone = true }: { shop: Pick<Shop, "name" | "slug" | "ownerEmail">; setupDone?: boolean }) {
  const t = await getTranslations("dashboard.newShop");
  return (
    <div className="mx-auto grid max-w-2xl gap-4" data-testid="new-shop-welcome">
      <div className="grid gap-3 rounded-2xl border bg-card p-6 shadow-sm">
        <span className="grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><PartyPopper className="size-5" aria-hidden /></span>
        <h1 className="text-2xl font-semibold" data-testid="new-shop-title">{t("title", { shop: shop.name })}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium">{t("address")}</dt>
          <dd className="flex items-center gap-1.5 font-mono"><Globe className="size-4" aria-hidden /><span data-testid="new-shop-address">{shop.slug}.{PLATFORM_DOMAIN}</span></dd>
          <dt className="font-medium">{t("email")}</dt>
          <dd>{shop.ownerEmail}</dd>
        </dl>
      </div>
      {setupDone ? null : (
        <div role="status" className="grid gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950" data-testid="setup-pending">
          <p>{t("setupPending")}</p>
          <Link href={`/shopowner/onboarding?shop=${encodeURIComponent(shop.slug)}`} className={buttonVariants({ size: "sm" })}>{t("setupCta")}</Link>
        </div>
      )}
      <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t("prototype")}</p>
    </div>
  );
}
