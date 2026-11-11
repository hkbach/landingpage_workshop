import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/marketing/legal-document";
import { legalFor } from "@/lib/mock/legal-store";
import type { Locale } from "@workshop/shared";

// The text of the Privacy is written by the administrators (Legal of the admin area): the page is built on every request so a change shows at once.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.legal");
  return { title: t("privacy.title") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("marketing.legal");
  const locale = (await getLocale()) as Locale;
  const doc = legalFor("privacy", locale);
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20" data-testid="legal-page">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t("privacy.title")}</h1>
        {doc ? (
          <>
            <p className="mt-3 text-sm text-white/60" data-testid="legal-meta">{t("updated", { date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(doc.updatedAt)), version: doc.version })}</p>
            {doc.locale !== locale ? <p role="note" className="mt-4 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-sm text-amber-100" data-testid="legal-fallback">{t("fallback")}</p> : null}
            <div className="mt-8"><LegalDocument text={doc.content} /></div>
          </>
        ) : (
          <p className="mt-6 text-white/70" data-testid="legal-pending">{t("pendingNotice")}</p>
        )}
      </div>
    </section>
  );
}
