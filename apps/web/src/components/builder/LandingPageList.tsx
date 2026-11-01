"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { checkNewPage, LANDING_PAGE_NAME_MAX, MAX_LANDING_PAGES_PER_SHOP, trimDeep, type NewPageCheck, type OrgStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEMPLATES, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadDraft, loadPublished, MAIN_PAGE_ID, savePublished, type Draft } from "./draft-store";
import { addPage, clearPageContent, loadLivePageId, loadPages, newPageId, removePage, savePages, setLivePage, starterFor, type PageMeta } from "./pages-store";
import { publishAction, type PublishAction } from "./publish-state";
import { invalidSectionCount, pagePrerequisites, themeIsInvalid, type ReadinessShop } from "./readiness";
import { LayoutWireframe } from "./TemplatePicker";
import { useDirty } from "@/lib/use-dirty";

interface Props {
  mainPage: { name: string; template: TemplateKey; seed?: { id: string; name: string; template: TemplateKey }[] };
  /** Address of the shop; the one public landing page is shown there. */
  shopHost: string;
  shop: ReadinessShop;
  shopStatus: OrgStatus;
  upcomingWorkshopCount: number;
  /** Sample content a page that was never edited starts from. */
  sample: { content: PageContent; theme: PageTheme };
}

const noop = () => () => {};

/** Gate: the pages are kept in localStorage for now, which is only read after hydration. */
export function LandingPageList(props: Props) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const t = useTranslations("builder.pages");
  if (!hydrated) return <p className="text-sm text-muted-foreground" aria-busy>{t("loading")}</p>;
  return <ListInner {...props} />;
}

type Message = { text: string; tone: "ok" | "error" };

function ListInner({ mainPage, shopHost, shop, shopStatus, upcomingWorkshopCount, sample }: Props) {
  const t = useTranslations("builder.pages");
  const tn = useTranslations("builder");
  const locale = useLocale();
  const router = useRouter();
  const mainLive = shopStatus === "ACTIVE";
  const [pages, setPages] = useState<PageMeta[]>(() => loadPages(mainPage));
  const [liveId, setLiveId] = useState<string | null>(() => loadLivePageId(mainLive));
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PageMeta | null>(null);
  const [publishing, setPublishing] = useState<PageMeta | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const atLimit = pages.length >= MAX_LANDING_PAGES_PER_SHOP;
  const nameOf = (id: string | null) => pages.find((p) => p.id === id)?.name ?? "";

  /** What a page shows: its saved draft, else (main) the published version, else the sample laid out with its template. */
  const contentOf = (p: PageMeta): Draft =>
    loadDraft(p.id)
    ?? (p.id === MAIN_PAGE_ID ? loadPublished(p.id) ?? { content: sample.content, theme: sample.theme, template: p.template } : starterFor(sample, p.template));

  // The same rules as the Publish button of the editor (FR-SITE-04), applied to the saved content of each page.
  const actions = useMemo(() => {
    const out: Record<string, PublishAction> = {};
    for (const p of pages) {
      const d = loadDraft(p.id)
        ?? (p.id === MAIN_PAGE_ID ? loadPublished(p.id) ?? { content: sample.content, theme: sample.theme, template: p.template } : starterFor(sample, p.template));
      out[p.id] = publishAction({
        status: shopStatus,
        prerequisites: pagePrerequisites(d.content.sections, d.theme, shop, upcomingWorkshopCount),
        invalidSections: invalidSectionCount(d.content.sections, d.theme),
        invalidTheme: themeIsInvalid(d.theme),
      });
    }
    return out;
  }, [pages, shopStatus, shop, upcomingWorkshopCount, sample]);

  function commit(next: PageMeta[]): boolean {
    if (!savePages(next)) { setMessage({ text: t("saveFailed"), tone: "error" }); return false; }
    setPages(next);
    return true;
  }
  function publish(page: PageMeta) {
    setPublishing(null);
    // Publishing is a submit: every text of the page is trimmed.
    if (!savePublished(trimDeep(contentOf(page)), page.id).ok || !setLivePage(page.id, mainLive).ok) { setMessage({ text: t("saveFailed"), tone: "error" }); return; }
    setLiveId(page.id);
    setMessage({ text: t("publishedDone", { name: page.name }), tone: "ok" });
  }
  function confirmDelete(page: PageMeta) {
    const res = removePage(pages, page.id);
    setDeleting(null);
    if (!res.ok || !commit(res.pages)) return;
    clearPageContent(page.id);
    if (liveId === page.id) setLiveId(null);
    setMessage({ text: t("deleted"), tone: "ok" });
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle", { max: MAX_LANDING_PAGES_PER_SHOP })}</p>
          <p className="text-sm text-muted-foreground">{t("liveRule", { host: shopHost })}</p>
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
          const live = liveId === p.id;
          const isMain = p.id === MAIN_PAGE_ID;
          const def = TEMPLATES[p.template];
          const action = actions[p.id];
          const canPublish = action?.kind === "publish" && !action.disabled;
          const hint = action?.kind === "publish" ? (action.reason === "errors" ? t("publishHint.errors") : null) : t("publishHint.approval");
          return (
            <li key={p.id}>
              <Card className="h-full">
                <CardContent className="grid h-full content-between gap-4">
                  <div className="grid gap-3">
                    {/* Thumbnail of the template that is applied to this page. */}
                    <div role="img" aria-label={t("thumbnail", { name: tn(`template.names.${p.template}`) })} data-testid="page-thumbnail">
                      <LayoutWireframe layout={def.layout} template={def} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{p.name}</h2>
                      {isMain ? <Badge variant="outline">{t("mainBadge")}</Badge> : null}
                      <Badge className={live ? "bg-emerald-100 text-emerald-950" : "bg-slate-200 text-slate-900"}>{live ? t("published") : t("notPublished")}</Badge>
                    </div>
                    <p className={cn("text-sm", live && "font-mono")}>{live ? t("liveAt", { host: shopHost }) : t("notLive")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("template", { name: tn(`template.names.${p.template}`) })} · {t("edited", { date: new Date(p.updatedAt).toLocaleDateString(locale) })}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/shopowner/site/${p.id}`} className={buttonVariants({ variant: "outline" })}>
                        <Pencil aria-hidden />{t("edit")}<span className="sr-only">: {p.name}</span>
                      </Link>
                      <Link href={`/shopowner/site/preview?page=${p.id}`} className={buttonVariants({ variant: "outline" })}>
                        <ExternalLink aria-hidden />{t("preview")}<span className="sr-only">: {p.name}</span>
                      </Link>
                      {live ? (
                        <Button disabled><Globe aria-hidden />{t("isPublic")}<span className="sr-only">: {p.name}</span></Button>
                      ) : (
                        <Button
                          disabled={!canPublish} aria-describedby={!canPublish && hint ? `hint-${p.id}` : undefined}
                          onClick={() => (liveId && liveId !== p.id ? setPublishing(p) : publish(p))}
                        >
                          <Globe aria-hidden />{t("publish")}<span className="sr-only">: {p.name}</span>
                        </Button>
                      )}
                      {isMain ? null : (
                        <Button variant="outline" onClick={() => setDeleting(p)}>
                          <Trash2 aria-hidden />{t("delete")}<span className="sr-only">: {p.name}</span>
                        </Button>
                      )}
                    </div>
                    {!live && !canPublish && hint ? <p id={`hint-${p.id}`} className="text-xs text-muted-foreground">{hint}</p> : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <CreateDialog
        open={creating} onOpenChange={setCreating} pageCount={pages.length}
        onCreate={(name) => {
          const res = addPage(pages, { name }, { id: newPageId(), now: new Date().toISOString() });
          if (!res.ok) return res.reason;
          if (!commit(res.pages)) return "SAVE";
          router.push(`/shopowner/site/${res.page.id}`);
          return "OK";
        }}
      />

      <Dialog open={publishing !== null} onOpenChange={(o) => { if (!o) setPublishing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("publishConfirmTitle", { name: publishing?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("publishConfirmBody", { other: nameOf(liveId) })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishing(null)}>{t("cancel")}</Button>
            <Button onClick={() => publishing && publish(publishing)}>{t("publishConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("deleteBody")}{deleting && liveId === deleting.id ? ` ${t("deleteLive")}` : ""}
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

/** Creating a landing page only needs its name; the template can be changed in the editor. */
function CreateDialog({ open, onOpenChange, pageCount, onCreate }: {
  open: boolean; onOpenChange: (o: boolean) => void; pageCount: number; onCreate: (name: string) => NewPageCheck | "SAVE";
}) {
  const t = useTranslations("builder.pages");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dirty = useDirty(name, open);
  const errorText = (code: Exclude<NewPageCheck, "OK">) =>
    t(`errors.${code}`, { max: code === "NAME_TOO_LONG" ? LANDING_PAGE_NAME_MAX : MAX_LANDING_PAGES_PER_SHOP });

  function submit(e: FormEvent) {
    e.preventDefault();
    const check = checkNewPage({ name, pageCount });
    if (check !== "OK") { setError(errorText(check)); return; }
    const res = onCreate(name);
    if (res === "SAVE") setError(t("saveFailed"));
    else if (res !== "OK") setError(errorText(res));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setName(""); setError(null); } onOpenChange(o); }}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="lp-name">{t("fieldName")}</Label>
            <Input
              id="lp-name" value={name} maxLength={LANDING_PAGE_NAME_MAX + 20} required aria-required="true" autoComplete="off"
              aria-describedby="lp-name-hint" onChange={(e) => { setError(null); setName(e.target.value); }}
            />
            <p id="lp-name-hint" className="text-xs text-muted-foreground">{t("fieldNameHint")}</p>
          </div>
          <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" disabled={!dirty}>{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
