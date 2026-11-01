"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { checkNewPage, LANDING_PAGE_NAME_MAX, MAX_LANDING_PAGES_PER_SHOP, normalizeSlug, type NewPageCheck } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { TEMPLATE_KEYS, type TemplateKey } from "@/components/sections/templates";
import { cn } from "@/lib/utils";
import { MAIN_PAGE_ID } from "./draft-store";
import { addPage, clearPageContent, isPagePublished, loadPages, newPageId, removePage, savePages, type PageMeta } from "./pages-store";

interface Props {
  mainPage: { name: string; slug: string; template: TemplateKey };
  /** Addresses of the other shops (a page address must be unique on the platform). */
  takenSlugs: string[];
  platformDomain: string;
  /** The shop is live, so its main page is public even before anything is published from this browser. */
  mainLive: boolean;
}

const noop = () => () => {};

/** Gate: the pages are kept in localStorage for now, which is only read after hydration. */
export function LandingPageList(props: Props) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const t = useTranslations("builder.pages");
  if (!hydrated) return <p className="text-sm text-muted-foreground" aria-busy>{t("loading")}</p>;
  return <ListInner {...props} />;
}

/** Suggests an address from the page name, e.g. "Summer promo" -> "clayco-summer-promo". */
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");

function ListInner({ mainPage, takenSlugs, platformDomain, mainLive }: Props) {
  const t = useTranslations("builder.pages");
  const tn = useTranslations("builder");
  const locale = useLocale();
  const router = useRouter();
  const [pages, setPages] = useState<PageMeta[]>(() => loadPages(mainPage));
  const [published, setPublished] = useState<Record<string, boolean>>(() => Object.fromEntries(pages.map((p) => [p.id, isPagePublished(p.id) || (p.id === MAIN_PAGE_ID && mainLive)])));
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PageMeta | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const atLimit = pages.length >= MAX_LANDING_PAGES_PER_SHOP;
  const host = (slug: string) => `${slug}.${platformDomain}`;

  function commit(next: PageMeta[]): boolean {
    if (!savePages(next)) { setMessage({ text: t("saveFailed"), tone: "error" }); return false; }
    setPages(next);
    return true;
  }
  function confirmDelete(page: PageMeta) {
    const res = removePage(pages, page.id);
    setDeleting(null);
    if (!res.ok || !commit(res.pages)) return;
    clearPageContent(page.id);
    setPublished((p) => Object.fromEntries(Object.entries(p).filter(([id]) => id !== page.id)));
    setMessage({ text: t("deleted"), tone: "ok" });
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle", { max: MAX_LANDING_PAGES_PER_SHOP })}</p>
        </div>
        <div className="grid justify-items-end gap-1">
          <Button onClick={() => { setMessage(null); setCreating(true); }} disabled={atLimit} aria-describedby="pages-count">
            <Plus aria-hidden />{t("create")}
          </Button>
          <p id="pages-count" className="text-xs text-muted-foreground">{t("count", { count: pages.length, max: MAX_LANDING_PAGES_PER_SHOP })}</p>
        </div>
      </header>

      {atLimit ? <p role="note" className="rounded-lg border bg-muted/40 p-3 text-sm">{t("limitReached", { max: MAX_LANDING_PAGES_PER_SHOP })}</p> : null}
      <p role="status" className={cn("min-h-5 text-sm font-medium", message?.tone === "error" ? "text-destructive" : "text-emerald-800")}>{message?.text}</p>

      <ul className="grid gap-3 md:grid-cols-2" aria-label={t("listLabel")}>
        {pages.map((p) => {
          const live = published[p.id] === true;
          const isMain = p.id === MAIN_PAGE_ID;
          return (
            <li key={p.id}>
              <Card className="h-full">
                <CardContent className="grid h-full content-between gap-4">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{p.name}</h2>
                      {isMain ? <Badge variant="outline">{t("mainBadge")}</Badge> : null}
                      <Badge className={live ? "bg-emerald-100 text-emerald-950" : "bg-slate-200 text-slate-900"}>{live ? t("published") : t("notPublished")}</Badge>
                    </div>
                    <p className="text-sm">{t("address")}: <span className="font-mono">{host(p.slug)}</span></p>
                    <p className="text-sm text-muted-foreground">
                      {t("template", { name: tn(`template.names.${p.template}`) })} · {t("edited", { date: new Date(p.updatedAt).toLocaleDateString(locale) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/shopowner/site/${p.id}`} className={buttonVariants()}>
                      <Pencil aria-hidden />{t("edit")}<span className="sr-only">: {p.name}</span>
                    </Link>
                    <Link href={`/shopowner/site/preview?page=${p.id}`} className={buttonVariants({ variant: "outline" })}>
                      <ExternalLink aria-hidden />{t("preview")}<span className="sr-only">: {p.name}</span>
                    </Link>
                    {isMain ? null : (
                      <Button variant="outline" onClick={() => setDeleting(p)}>
                        <Trash2 aria-hidden />{t("delete")}<span className="sr-only">: {p.name}</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <CreateDialog
        open={creating} onOpenChange={setCreating} pages={pages} takenSlugs={takenSlugs} mainSlug={mainPage.slug} host={host}
        onCreate={(input) => {
          const res = addPage(pages, input, { takenSlugs, id: newPageId(), now: new Date().toISOString() });
          if (!res.ok) return res.reason;
          if (!commit(res.pages)) return "SAVE";
          router.push(`/shopowner/site/${res.page.id}`);
          return "OK";
        }}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("deleteBody")}{deleting && published[deleting.id] ? ` ${t("deleteLive")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={() => deleting && confirmDelete(deleting)}>{t("deleteConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({ open, onOpenChange, pages, takenSlugs, mainSlug, host, onCreate }: {
  open: boolean; onOpenChange: (o: boolean) => void; pages: PageMeta[]; takenSlugs: string[]; mainSlug: string;
  host: (slug: string) => string; onCreate: (input: { name: string; slug: string; template: TemplateKey }) => NewPageCheck | "SAVE";
}) {
  const t = useTranslations("builder.pages");
  const tn = useTranslations("builder");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState<TemplateKey>(TEMPLATE_KEYS[0]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setName(""); setSlug(""); setSlugTouched(false); setTemplate(TEMPLATE_KEYS[0]); setError(null); };
  const shownSlug = normalizeSlug(slug) || "your-page";
  const errorText = (code: Exclude<NewPageCheck, "OK">) =>
    t(`errors.${code}`, { max: code === "NAME_TOO_LONG" ? LANDING_PAGE_NAME_MAX : MAX_LANDING_PAGES_PER_SHOP });

  function submit(e: FormEvent) {
    e.preventDefault();
    const taken = [...takenSlugs, ...pages.map((p) => p.slug)];
    const check = checkNewPage({ name, slug, pageCount: pages.length, takenSlugs: taken });
    if (check !== "OK") { setError(errorText(check)); return; }
    const res = onCreate({ name, slug, template });
    if (res === "SAVE") setError(t("saveFailed"));
    else if (res !== "OK") setError(errorText(res));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="lp-name">{t("fieldName")}</Label>
            <Input
              id="lp-name" value={name} maxLength={LANDING_PAGE_NAME_MAX + 20} required aria-required="true" autoComplete="off"
              onChange={(e) => { setError(null); setName(e.target.value); if (!slugTouched) setSlug(slugify(`${mainSlug}-${e.target.value}`)); }}
            />
            <p className="text-xs text-muted-foreground">{t("fieldNameHint")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lp-slug">{t("fieldSlug")}</Label>
            <Input
              id="lp-slug" value={slug} className="font-mono" required aria-required="true" autoComplete="off" spellCheck={false}
              aria-describedby="lp-slug-hint" onChange={(e) => { setError(null); setSlug(e.target.value); setSlugTouched(true); }}
            />
            <p id="lp-slug-hint" className="text-xs text-muted-foreground">{t("fieldSlugHint", { host: host(shownSlug) })}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lp-template">{t("fieldTemplate")}</Label>
            <NativeSelect id="lp-template" value={template} onChange={(e) => setTemplate(e.target.value as TemplateKey)}>
              {TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{tn(`template.names.${k}`)}</option>)}
            </NativeSelect>
          </div>
          <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit">{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
