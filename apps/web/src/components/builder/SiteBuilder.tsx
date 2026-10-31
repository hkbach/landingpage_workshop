"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleCheck, Eye, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { LOCALES, missingLocales, type Locale, type Localized, type OrgStatus, type SectionType } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { collectLocalized, createSection, SECTION_REGISTRY, validateSection } from "@/components/sections/registry";
import { applyTemplate, TEMPLATES, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme, SectionInstance, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadDraft, saveDraft, type Draft } from "./draft-store";
import { FieldsEditor } from "./FieldsEditor";
import { PublishPanel, type Prerequisite } from "./PublishPanel";
import { SectionList } from "./SectionList";
import { ThemePanel } from "./ThemePanel";

export type BuilderShop = Pick<Shop, "name" | "defaultLocale" | "enabledLocales" | "contactEmail" | "contactPhone">;

interface Props {
  shop: BuilderShop;
  initial: { content: PageContent; theme: PageTheme };
  initialStatus: OrgStatus;
  upcomingWorkshopCount: number;
}

const noop = () => () => {};

/** Gate: localStorage is only read after hydration (avoids server/client mismatch). */
export function SiteBuilder(props: Props) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  if (!hydrated) return <div className="p-6 text-sm text-muted-foreground" aria-busy>…</div>;
  return <BuilderInner {...props} />;
}

type SaveState = "idle" | "pending" | "saved";
const SEO_ID = "__seo__";

function BuilderInner({ shop, initial, initialStatus, upcomingWorkshopCount }: Props) {
  const t = useTranslations("builder");
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? { ...initial, template: "classic" });
  const [rev, setRev] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState<OrgStatus>(initialStatus);
  const [lang, setLang] = useState<Locale>(shop.defaultLocale);
  const [selectedId, setSelectedId] = useState<string>(() => draft.content.sections[0]?.id ?? SEO_ID);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateKey | null>(null);
  const enabledLocales = shop.enabledLocales;

  // Debounced autosave (2 s) into local state only.
  useEffect(() => {
    if (rev === 0) return;
    const id = setTimeout(() => {
      saveDraft(draft);
      setSaveState("saved");
    }, 2000);
    return () => clearTimeout(id);
  }, [rev, draft]);

  function change(next: Draft) {
    setDraft(next);
    setRev((r) => r + 1);
    setSaveState("pending");
  }
  const setContent = (content: PageContent) => change({ ...draft, content });
  const setSections = (sections: SectionInstance[]) => setContent({ ...draft.content, sections });
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
  function confirmTemplate() {
    if (!pendingTemplate) return;
    const content = applyTemplate(draft.content, pendingTemplate);
    // Template default theme, but keep the shop's logo and favicon.
    const theme = { ...TEMPLATES[pendingTemplate].theme, logoUrl: draft.theme.logoUrl, faviconUrl: draft.theme.faviconUrl };
    change({ content, theme, template: pendingTemplate });
    setSelectedId(content.sections[0]?.id ?? SEO_ID);
    setPendingTemplate(null);
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

  const invalidSections = sections.filter((s) => s.enabled && validateSection(s.type, s.props).length > 0).length;

  const prerequisites: Prerequisite[] = useMemo(() => {
    const hero = sections.find((s) => s.type === "hero" && s.enabled);
    const heroTitle = (hero?.props.title ?? {}) as Localized;
    const contact = sections.find((s) => s.type === "contact" && s.enabled);
    const hasContact = !!(contact && (contact.props.phone || contact.props.email || contact.props.whatsapp)) || !!(shop.contactEmail || shop.contactPhone);
    return [
      { key: "identity", met: !!(draft.theme.logoUrl || shop.name) },
      { key: "hero", met: !!hero && Object.values(heroTitle).some((v) => v?.trim()) },
      { key: "contact", met: hasContact },
      { key: "workshop", met: upcomingWorkshopCount > 0 },
    ];
  }, [sections, draft.theme.logoUrl, shop, upcomingWorkshopCount]);

  const editorLabel = selected ? t(`sectionTypes.${selected.type}`) : t("seo.title");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {saveState === "pending" ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />{t("autosave.saving")}</>
              : saveState === "saved" ? <><CircleCheck className="size-4 text-green-700" aria-hidden />{t("autosave.saved")}</>
              : t("autosave.idle")}
          </p>
          <Link href="/dashboard/site/preview" className={buttonVariants({ variant: "outline" })}>
            <Eye />{t("preview")}
          </Link>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t("draftNote")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("template.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div role="radiogroup" aria-label={t("template.title")} className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
                  <button
                    key={k} type="button" role="radio" aria-checked={draft.template === k}
                    onClick={() => { if (draft.template !== k) setPendingTemplate(k); }}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      draft.template === k && "border-primary ring-2 ring-primary/30",
                    )}
                  >
                    <span className="block font-medium">{t(`template.names.${k}`)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t(`template.descriptions.${k}`)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("template.hint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("sections.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SectionList
                sections={sections} selectedId={activeSelectedId} onSelect={setSelectedId} onReorder={setSections}
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
            <CardHeader><CardTitle>{t("theme.title")}</CardTitle></CardHeader>
            <CardContent>
              <ThemePanel theme={draft.theme} onChange={(patch) => change({ ...draft, theme: { ...draft.theme, ...patch } })} />
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
                status={status} prerequisites={prerequisites} invalidSections={invalidSections}
                onSubmitForReview={() => setStatus("PENDING_REVIEW")} onPublish={() => saveDraft(draft)}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("editor.title", { name: editorLabel })}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={lang} onValueChange={(v) => setLang(v as Locale)}>
              <TabsList aria-label={t("language.label")} className="h-auto flex-wrap">
                {LOCALES.filter((l) => enabledLocales.includes(l)).map((l) => (
                  <TabsTrigger key={l} value={l} className="gap-1.5 px-3">
                    {t(`language.names.${l}`)}
                    {l === shop.defaultLocale ? <span className="text-xs text-muted-foreground">({t("language.default")})</span> : null}
                    {missingByLocale[l] > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        <span aria-label={t("language.missing", { count: missingByLocale[l] })}>{missingByLocale[l]}</span>
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
              {enabledLocales.map((l) => (
                <TabsContent key={l} value={l} className="mt-4 space-y-4">
                  {l === lang ? (
                    <>
                      {l !== shop.defaultLocale ? (
                        <p className="text-xs text-muted-foreground">{t("language.fallbackNote", { locale: t(`language.names.${shop.defaultLocale}`) })}</p>
                      ) : null}
                      {selected ? (
                        <SectionEditorBody
                          section={selected} lang={l} defaultLocale={shop.defaultLocale}
                          onChange={(props) => patchSection(selected.id, { props })}
                        />
                      ) : (
                        <FieldsEditor
                          idPrefix="seo" lang={l} defaultLocale={shop.defaultLocale}
                          fields={[{ kind: "localized", key: "title", max: 70 }, { kind: "localized", key: "description", max: 160, multiline: true }]}
                          value={draft.content.seo as unknown as Record<string, unknown>}
                          onChange={(v) => setContent({ ...draft.content, seo: v as unknown as PageContent["seo"] })}
                        />
                      )}
                    </>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={pendingTemplate !== null} onOpenChange={(o) => { if (!o) setPendingTemplate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("template.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("template.confirmText")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingTemplate(null)}>{t("template.cancel")}</Button>
            <Button type="button" onClick={confirmTemplate}>{t("template.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionEditorBody({ section, lang, defaultLocale, onChange }: {
  section: SectionInstance; lang: Locale; defaultLocale: Locale; onChange: (props: Record<string, unknown>) => void;
}) {
  const t = useTranslations("builder");
  const def = SECTION_REGISTRY[section.type];
  return (
    <div className="space-y-4">
      {def.autoContent ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("editor.autoWorkshops")}</p>
      ) : null}
      {def.authenticityNote ? (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{t("editor.authenticityNote")}
        </p>
      ) : null}
      <FieldsEditor idPrefix={section.id} fields={def.fields} value={section.props} lang={lang} defaultLocale={defaultLocale} onChange={onChange} />
    </div>
  );
}
