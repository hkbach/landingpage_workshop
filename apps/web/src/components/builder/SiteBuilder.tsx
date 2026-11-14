"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info, Tag, TriangleAlert } from "lucide-react";
import { missingLocales, trimDeep, type Locale, type Localized, type OrgStatus, type SectionType } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { collectLocalized, createSection, effectiveVariant, SECTION_REGISTRY } from "@/components/sections/registry";
import { failingThemeChecks, needsAttention } from "@/components/sections/instance";
import { planTemplateSwitch, TEMPLATES, themeForTemplate, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme, SectionInstance, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadDraft, saveDraft, type Draft, chooseInitialDraft, loadPublished, savePublished, MAIN_PAGE_ID, type BuilderSource } from "./draft-store";
import { loadLivePageId, loadPages, savePages, setLivePage, starterFor, touchPage, type PageMeta } from "./pages-store";
import { pagePrerequisites } from "./readiness";
import { FieldsEditor } from "./FieldsEditor";
import { PublishPanel, type Prerequisite } from "./PublishPanel";
import { normalizeOrder } from "@/components/sections/order";
import { BookButtonToggle } from "./BookButtonToggle";
import { BuilderHeader } from "./BuilderHeader";
import { SupportContactBox } from "./SupportContactBox";
import type { SupportContact } from "@/lib/support-contact";
import { LanguageBar } from "@/components/language/LanguageBar";
import { useEditingLanguage } from "@/lib/use-shop-language";
import { publishAction } from "./publish-state";
import { siteFetch } from "@/lib/site-api";
import type { SaveState } from "./save-state";
import { SectionColorsGroup } from "./SectionColorsGroup";
import { SectionList } from "./SectionList";
import { TemplatePicker } from "./TemplatePicker";
import { ThemePanel } from "./ThemePanel";
import { ShopLink, useShopHref } from "@/components/dashboard/shell/shop-link";

export type BuilderShop = Pick<Shop, "name" | "defaultLocale" | "enabledLocales" | "contactEmail" | "contactPhone">;

interface Props {
  shop: BuilderShop;
  /** Which landing page is edited (the shop has up to 2). */
  pageId?: string;
  /** The shop's first page: it exists from the start and is the one published at the shop's own address. */
  mainPage: { name: string; template: TemplateKey; seed?: { id: string; name: string; template: TemplateKey }[] };
  /** Content of the page as the server has it: the published version when `initialSource` is "published", else a template starter. */
  initial: { content: PageContent; theme: PageTheme; template: TemplateKey };
  initialSource?: "published" | "starter";
  initialStatus: OrgStatus;
  upcomingWorkshopCount: number;
  /** Platform support contact (configured by a platform admin later; mock data for now). */
  support?: SupportContact;
  /** Template requested via ?apply=KEY (template preview banner): opens the confirmation dialog. */
  applyTemplate?: TemplateKey;
  /** Connected to the API: the page, its draft and the live page are the server's, the autosave and Publish go to the server. */
  server?: { page: PageMeta; liveId: string | null; source: BuilderSource };
  /** An administrator editing the shop `adminShopId`: the editor talks to the routes of the administrator, and every change carries the reason (see lib/site-api.ts). */
  adminShopId?: string;
}

const noop = () => () => {};

/** Gate: localStorage is only read after hydration (avoids server/client mismatch). */
export function SiteBuilder(props: Props) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  if (!hydrated && !props.server) return <div className="p-6 text-sm text-muted-foreground" aria-busy>…</div>;
  return <PageGate {...props} />;
}

/** The page list lives in the browser for now, so whether the page exists is only known after hydration. */
function PageGate(props: Props) {
  const t = useTranslations("builder.pages");
  const pageId = props.pageId ?? MAIN_PAGE_ID;
  const [page] = useState(() => (props.server ? props.server.page : loadPages(props.mainPage).find((p) => p.id === pageId)));
  if (!page) {
    return (
      <div className="grid justify-items-start gap-3 p-6">
        <h1 className="text-xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("notFoundBody")}</p>
        <ShopLink href="/shopowner/site" className={buttonVariants()}>{t("backToList")}</ShopLink>
      </div>
    );
  }
  return <BuilderInner {...props} page={page} />;
}

const SEO_ID = "__seo__";

function BuilderInner({ shop, initial, initialSource = "starter", initialStatus, upcomingWorkshopCount, applyTemplate, support, page, mainPage, server, adminShopId }: Props & { page: PageMeta }) {
  const toShop = useShopHref();
  const router = useRouter();
  const pageId = page.id;
  const t = useTranslations("builder");
  // Opening rule: last saved draft > published version > template starter (see chooseInitialDraft).
  const [opened] = useState(() => server ? { draft: initial, source: server.source } : chooseInitialDraft({
    saved: loadDraft(pageId),
    // The server's published version is the main page's; another page only has one once it was published here.
    published: loadPublished(pageId) ?? (pageId === MAIN_PAGE_ID && initialSource === "published" ? initial : null),
    starter: pageId === MAIN_PAGE_ID ? { ...initial } : starterFor(initial, page.template),
  }));
  const [draft, setDraft] = useState<Draft>(opened.draft);
  const [view, setView] = useState<BuilderSource>(opened.source);
  const [rev, setRev] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState<OrgStatus>(initialStatus);
  // Only one landing page is public at a time: publishing this one takes the current public page offline.
  const [liveId, setLiveId] = useState<string | null>(() => (server ? server.liveId : loadLivePageId(initialSource === "published")));
  const [publishMessage, setPublishMessage] = useState<"published" | null>(null);
  const [activeLang, setLang] = useEditingLanguage(shop.enabledLocales, shop.defaultLocale);
  const [selectedId, setSelectedId] = useState<string>(() => draft.content.sections[0]?.id ?? SEO_ID);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateKey | null>(() => (applyTemplate && applyTemplate !== draft.template ? applyTemplate : null));
  const enabledLocales = shop.enabledLocales;

  // Saves to the server one at a time, in the order of the edits (an older save never lands after a newer one), and says "saved" only when the latest edit is the one saved.
  const latestRev = useRef(0);
  const savedRev = useRef(0);
  const latestDraft = useRef(draft);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const putDraft = useCallback((d: Draft, at: number, leaving = false) => {
    const body = JSON.stringify({ content: d.content, theme: d.theme, templateKey: d.template });
    const run = () => siteFetch(adminShopId, `/pages/${encodeURIComponent(pageId)}/draft`, { method: "PUT", headers: { "content-type": "application/json" }, body, keepalive: leaving && body.length < 60_000 })
      .then((res) => { if (res.ok) savedRev.current = Math.max(savedRev.current, at); if (!leaving && at === latestRev.current) setSaveState(res.ok ? "saved" : "unavailable"); })
      .catch(() => { if (!leaving && at === latestRev.current) setSaveState("unavailable"); });
    queue.current = queue.current.then(run, run);
  }, [pageId, adminShopId]);
  // Leaving the builder (another page of the app, or the tab closed) with an edit not saved yet: it is sent at once.
  useEffect(() => {
    if (!server) return;
    const flush = () => { if (latestRev.current > savedRev.current) putDraft(latestDraft.current, latestRev.current, true); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [server, putDraft]);

  // Debounced autosave (2 s): into the server when connected (the live page is not touched), else into the browser's storage.
  useEffect(() => {
    if (rev === 0) return;
    latestRev.current = rev;
    latestDraft.current = draft;
    const id = setTimeout(() => {
      if (server) {
        putDraft(draft, rev);
        return;
      }
      const res = saveDraft(draft, pageId);
      if (res.ok) savePages(touchPage(loadPages(mainPage), pageId, { template: draft.template, now: new Date().toISOString() }));
      setSaveState(res.ok ? "saved" : res.reason);
    }, 2000);
    return () => clearTimeout(id);
  }, [rev, draft, pageId, mainPage, server, putDraft]);

  function change(next: Draft) {
    setView("draft");
    setDraft(next);
    setRev((r) => r + 1);
    setSaveState("pending");
  }
  const setContent = (content: PageContent) => change({ ...draft, content });
  // Every change goes through normalizeOrder: the hero stays first and the footer last, whatever the caller did.
  const setSections = (sections: SectionInstance[]) => setContent({ ...draft.content, sections: normalizeOrder(sections) });
  const patchSection = (id: string, patch: Partial<SectionInstance>) =>
    setSections(draft.content.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const sections = draft.content.sections;
  const selected = sections.find((s) => s.id === selectedId);
  const activeSelectedId = selected ? selectedId : SEO_ID;

  function addSection(type: SectionType) {
    const s = createSection(type);
    const footerIdx = sections.findIndex((x) => x.type === "footer");
    const next = [...sections];
    next.splice(footerIdx < 0 ? next.length : footerIdx, 0, s);
    setSections(next);
    setSelectedId(s.id);
  }
  function removeSection(id: string) {
    const s = sections.find((x) => x.id === id);
    if (!s || !SECTION_REGISTRY[s.type].removable) return; // footer cannot be removed
    setSections(sections.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(SEO_ID);
  }
  function closeTemplateDialog() {
    setPendingTemplate(null);
    // Drop ?apply=KEY so a reload does not reopen the dialog.
    if (applyTemplate) window.history.replaceState(null, "", toShop(`/shopowner/site/${pageId}`));
  }
  function confirmTemplate() {
    if (!pendingTemplate) return;
    // Content (props + per-section colours) is kept; layout, variants, theme and section order follow the template.
    const plan = planTemplateSwitch(draft.content, pendingTemplate);
    const content = { ...draft.content, layout: plan.layout, sections: plan.sections };
    const theme = themeForTemplate(pendingTemplate, draft.theme);
    change({ content, theme, template: pendingTemplate });
    setSelectedId(content.sections[0]?.id ?? SEO_ID);
    closeTemplateDialog();
  }

  // Missing translations per enabled language (default locale fallback applies at render time).
  const missingByLocale = useMemo(() => {
    const all: Localized[] = [draft.content.seo.title, draft.content.seo.description];
    for (const s of draft.content.sections) {
      if (s.enabled) all.push(...collectLocalized(SECTION_REGISTRY[s.type].fields, s.props));
    }
    return Object.fromEntries(
      enabledLocales.map((l) => [l, all.filter((v) => missingLocales(v, [l]).length > 0).length]),
    ) as Record<Locale, number>;
  }, [draft.content, enabledLocales]);

  // Sections with invalid props/colours (Needs attention) and a failing theme block Publish / Submit.
  const attention = useMemo(
    () => new Set(sections.filter((s) => needsAttention(s, draft.theme)).map((s) => s.id)),
    [sections, draft.theme],
  );
  const invalidSections = sections.filter((s) => s.enabled && attention.has(s.id)).length;
  const invalidTheme = failingThemeChecks(draft.theme).length > 0;
  const switchPlan = useMemo(
    () => (pendingTemplate ? planTemplateSwitch(draft.content, pendingTemplate) : null),
    [pendingTemplate, draft.content],
  );

  const prerequisites: Prerequisite[] = useMemo(
    () => pagePrerequisites(sections, draft.theme, shop, upcomingWorkshopCount),
    [sections, draft.theme, shop, upcomingWorkshopCount],
  );

  // One source of truth for the publish control: the sticky header and the Publish card follow the same rules.
  const saving = saveState === "pending";
  const headerAction = publishAction({ status, prerequisites, invalidSections, invalidTheme, saving });
  // Also guarded here: a disabled button cannot be clicked, but a stale handler must never publish a half-saved draft.
  // Publishing and submitting for review are the "submit" of the builder: every text of the page is trimmed then.
  const trimmed = () => {
    const clean = trimDeep(draft);
    if (JSON.stringify(clean) !== JSON.stringify(draft)) setDraft(clean);
    return clean;
  };
  /** Connected: save the draft, then the server publishes it (and, for the first publish of a shop, makes the shop ACTIVE after its own checks). */
  async function publishOnServer() {
    const clean = trimmed();
    try {
      const saved = await siteFetch(adminShopId, `/pages/${encodeURIComponent(pageId)}/draft`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: clean.content, theme: clean.theme, templateKey: clean.template }) });
      if (!saved.ok) throw new Error("draft");
      const res = await siteFetch(adminShopId, `/pages/${encodeURIComponent(pageId)}/publish`, { method: "POST", ...(adminShopId ? { headers: { "content-type": "application/json" }, body: "{}" } : {}) });
      if (!res.ok) throw new Error("publish");
      const done = (await res.json()) as { shopStatus?: OrgStatus };
      setSaveState("saved");
      setLiveId(pageId);
      setView("published");
      setPublishMessage("published");
      if (done.shopStatus) setStatus(done.shopStatus);
      router.refresh();
    } catch {
      setSaveState("unavailable");
    }
  }
  const publishNow = () => {
    if (saving) return;
    if (server) { void publishOnServer(); return; }
    const clean = trimmed();
    saveDraft(clean, pageId);
    savePublished(clean, pageId); // publishing copies the draft to the published version
    setLivePage(pageId, initialSource === "published"); // and makes this the one public page
    setLiveId(pageId);
    setView("published");
    setPublishMessage("published");
    // The first publish of a shop that is not live yet makes the shop ACTIVE at once (no review): the server does it and writes the audit line.
    if (status === "DRAFT") {
      void fetch("/api/v1/site/publish", { method: "POST" })
        .then((res) => { if (res.ok) setStatus("ACTIVE"); })
        .catch(() => { /* the page is saved; the shop stays DRAFT and the next publish tries again */ });
    }
  };

  const names = (types: SectionType[]) => types.map((ty) => t(`sectionTypes.${ty}`)).join(", ");
  const editorLabel = selected ? t(`sectionTypes.${selected.type}`) : t("seo.title");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <BuilderHeader
        pageId={pageId} pageName={page.name}
        saveState={saveState} status={status} action={headerAction} message={publishMessage}
        onPublish={publishNow}
      />

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p>{t("draftNote")}</p>
          <p data-testid="builder-source" className="mt-1 font-medium">{t(`source.${view}`)}</p>
          {liveId && liveId !== pageId ? <p data-testid="builder-replaces-live" className="mt-1">{t("pages.replacesLive")}</p> : null}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("template.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <TemplatePicker pageId={pageId} current={draft.template} onSelect={setPendingTemplate} />
          <p className="text-xs text-muted-foreground">{t("template.hint")}</p>
        </CardContent>
      </Card>

      <LanguageBar value={activeLang} onChange={setLang} enabled={enabledLocales} defaultLocale={shop.defaultLocale} missingByLocale={missingByLocale} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Card>
          <CardHeader><CardTitle>{t("sections.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SectionList
              sections={sections} attention={attention} selectedId={activeSelectedId} onSelect={setSelectedId} onReorder={setSections}
              onToggle={(id, enabled) => patchSection(id, { enabled })} onRemove={removeSection} onAdd={addSection}
            />
            <button
              type="button" onClick={() => setSelectedId(SEO_ID)} aria-current={activeSelectedId === SEO_ID ? "true" : undefined}
              className={cn("w-full rounded-lg border p-2 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50", activeSelectedId === SEO_ID && "border-primary ring-2 ring-primary/30")}
            >
              {t("seo.title")}
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("editor.title", { name: editorLabel })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("editor.editingIn", { language: t(`language.names.${activeLang}`) })}
              {activeLang !== shop.defaultLocale ? <> · {t("language.fallbackNote", { locale: t(`language.names.${shop.defaultLocale}`) })}</> : null}
            </p>
            {selected ? (
              <SectionEditorBody
                section={selected} lang={activeLang} defaultLocale={shop.defaultLocale} theme={draft.theme}
                onChange={(props) => patchSection(selected.id, { props })}
                onPatch={(patch) => patchSection(selected.id, patch)}
                onBeforeLeave={() => { if (saveState !== "pending") return; if (server) putDraft(draft, rev, true); else saveDraft(draft, pageId); }}
              />
            ) : (
              <FieldsEditor
                idPrefix="seo" lang={activeLang} defaultLocale={shop.defaultLocale}
                fields={[{ kind: "localized", key: "title", max: 70 }, { kind: "localized", key: "description", max: 160, multiline: true }]}
                value={draft.content.seo as unknown as Record<string, unknown>}
                onChange={(v) => setContent({ ...draft.content, seo: v as unknown as PageContent["seo"] })}
              />
            )}
          </CardContent>
        </Card>

      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader><CardTitle>{t("theme.title")}</CardTitle></CardHeader>
          <CardContent>
            <ThemePanel theme={draft.theme} templateTheme={TEMPLATES[draft.template].theme} onChange={(patch) => change({ ...draft, theme: { ...draft.theme, ...patch } })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("publish.title")}
              <Badge variant="secondary">{t(`publish.status.${status}`)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PublishPanel
              status={status} prerequisites={prerequisites} invalidSections={invalidSections} invalidTheme={invalidTheme}
              saving={saving} message={publishMessage} onPublish={publishNow}
            />
            <SupportContactBox contact={support} />
          </CardContent>
        </Card>

      </div>

      <Dialog open={pendingTemplate !== null} onOpenChange={(o) => { if (!o) closeTemplateDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("template.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {pendingTemplate ? t("template.confirmFor", { name: t(`template.names.${pendingTemplate}`) }) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p><strong>{t("template.keeps")}</strong> {t("template.keepsText")}</p>
            <p><strong>{t("template.changes")}</strong> {t("template.changesText")}</p>
            {switchPlan && switchPlan.added.length > 0 ? <p>{t("template.added", { names: names(switchPlan.added) })}</p> : null}
            {switchPlan && switchPlan.hidden.length > 0 ? <p>{t("template.hidden", { names: names(switchPlan.hidden) })}</p> : null}
            {switchPlan && switchPlan.removed.length > 0 ? <p>{t("template.removed", { names: names(switchPlan.removed) })}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeTemplateDialog}>{t("template.cancel")}</Button>
            <Button type="button" onClick={confirmTemplate}>{t("template.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionEditorBody({ section, lang, defaultLocale, theme, onChange, onPatch, onBeforeLeave }: {
  section: SectionInstance; lang: Locale; defaultLocale: Locale; theme: PageTheme;
  onChange: (props: Record<string, unknown>) => void; onPatch: (patch: Partial<SectionInstance>) => void;
  /** Called just before the shop owner leaves for another page, so edits waiting for the autosave are not lost. */
  onBeforeLeave: () => void;
}) {
  const t = useTranslations("builder");
  const def = SECTION_REGISTRY[section.type];
  const variant = effectiveVariant(section);
  return (
    <div className="space-y-4">
      {section.type === "promotions" ? (
        // The offers themselves are not edited here: they are managed (and each one's rules are set) on the Promotion management page.
        <div role="note" data-testid="promotions-editor-note" className="grid gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
          <p className="flex items-start gap-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("editor.promotionsNote")}</p>
          <ShopLink href="/shopowner/promotions" onClick={onBeforeLeave} className={cn(buttonVariants(), "w-fit")}>
            <Tag aria-hidden />{t("editor.promotionsGo")}
          </ShopLink>
        </div>
      ) : def.autoContent ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("editor.autoWorkshops")}</p>
      ) : null}
      {def.authenticityNote ? (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{t("editor.authenticityNote")}
        </p>
      ) : null}
      {def.variants.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${section.id}-variant`}>{t("editor.layout")}</Label>
          <select
            id={`${section.id}-variant`} value={variant} onChange={(e) => onPatch({ variant: e.target.value })}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {def.variants.map((v) => <option key={v} value={v}>{t(`variants.${section.type}.${v}`)}</option>)}
          </select>
        </div>
      ) : null}
      <FieldsEditor idPrefix={section.id} fields={def.fields} value={section.props} lang={lang} defaultLocale={defaultLocale} onChange={onChange} />
      <BookButtonToggle section={section} onChange={(showBook) => onPatch({ showBook })} />
      <SectionColorsGroup section={section} theme={theme} onChange={(style) => onPatch({ style })} />
    </div>
  );
}
