"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { ArrowLeft, Eye, Monitor, Smartphone } from "lucide-react";
import type { Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageRenderer } from "@/components/sections/PageRenderer";
import type { RenderContext } from "@/components/sections/context";
import type { PageContent, PageTheme, Shop, Workshop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SiteChromeContext } from "@/components/sections/chrome-context";
import { applyTemplate, themeForTemplate, type TemplateKey } from "@/components/sections/templates";
import { DRAFT_KEY, parseDraft } from "./draft-store";

type PreviewShop = Pick<Shop, "name" | "defaultLocale" | "enabledLocales" | "timezone" | "currency">;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

interface Props {
  shop: PreviewShop;
  initial: { content: PageContent; theme: PageTheme; template: TemplateKey };
  workshops: Workshop[];
  siteMessages: Record<string, Record<string, unknown>>;
  /** Template to preview with the current content (in memory only; nothing is saved). */
  previewTemplate?: TemplateKey;
}

export function SitePreview({ shop, initial, workshops, siteMessages, previewTemplate }: Props) {
  const t = useTranslations("builder");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [lang, setLang] = useState<Locale>(shop.defaultLocale);
  // Draft written by the builder's autosave (localStorage); falls back to the mock draft.
  const raw = useSyncExternalStore(subscribe, () => window.localStorage.getItem(DRAFT_KEY), () => null);
  const stored = useMemo(() => parseDraft(raw) ?? { ...initial }, [raw, initial]);
  // "Preview template": the same content, laid out with another template. Never written anywhere.
  const draft = useMemo(
    () => previewTemplate
      ? { ...stored, template: previewTemplate, content: applyTemplate(stored.content, previewTemplate), theme: themeForTemplate(previewTemplate, stored.theme) }
      : stored,
    [stored, previewTemplate],
  );

  const ctx: RenderContext = {
    locale: lang, shop, workshops, reportHref: "#", privacyHref: "#", allowDataImages: true,
    languages: shop.enabledLocales.map((l) => ({ locale: l, href: "#" })),
  };
  const chrome = useMemo(() => ({ onSelectLocale: setLang }), []);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/site" className={buttonVariants({ variant: "outline" })}><ArrowLeft />{t("previewPage.back")}</Link>
          <h1 className="text-xl font-semibold tracking-tight">{t("previewPage.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="preview-lang">{t("previewPage.language")}</Label>
            <select
              id="preview-lang" value={lang} onChange={(e) => setLang(e.target.value as Locale)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {shop.enabledLocales.map((l) => <option key={l} value={l}>{t(`language.names.${l}`)}</option>)}
            </select>
          </div>
          <div role="group" aria-label={t("previewPage.device")} className="flex gap-1">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  device === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {d === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
                {t(`previewPage.${d}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {previewTemplate ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="flex items-start gap-2">
            <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>{t("previewPage.templateBanner", { name: t(`template.names.${previewTemplate}`) })}</strong>{" "}
              {t("previewPage.templateBannerNote")}
            </span>
          </p>
          <div className="flex gap-2">
            <Link href="/dashboard/site" className={buttonVariants({ variant: "outline" })}>{t("previewPage.templateBack")}</Link>
            <Link href={`/dashboard/site?apply=${previewTemplate}`} className={buttonVariants()}>{t("previewPage.templateApply")}</Link>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("previewPage.note")}</p>

      <div className="rounded-xl border bg-muted/30 p-3 sm:p-6">
        <div
          // overflow-clip (not hidden) keeps position: sticky working inside the frame; --site-top clears the dashboard header.
          className={cn("mx-auto overflow-clip rounded-lg border bg-white shadow-sm", device === "mobile" ? "max-w-[390px]" : "max-w-full")}
          style={{ "--site-top": "3.5rem" } as CSSProperties}
          data-testid="preview-frame"
        >
          <NextIntlClientProvider locale={lang} messages={{ site: siteMessages[lang] ?? {} }}>
            <SiteChromeContext.Provider value={chrome}>
              <PageRenderer content={draft.content} theme={draft.theme} ctx={ctx} />
            </SiteChromeContext.Provider>
          </NextIntlClientProvider>
        </div>
      </div>
    </div>
  );
}
