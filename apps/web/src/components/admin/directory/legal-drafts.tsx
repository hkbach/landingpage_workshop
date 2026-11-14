"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, ExternalLink } from "lucide-react";
import { LOCALES, type Locale } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmt } from "../utils";
import { Notice } from "./kit";

type Kind = "terms" | "privacy";
type Version = { content: string; version: number; updatedAt: string; updatedBy: string | null };
type Overview = { kind: Kind; epoch: number; consents: { agreed: number; activeUsers: number }; documents: Partial<Record<Locale, Version>>; drafts: Partial<Record<Locale, Version>> };
type HistoryItem = { version: number; status: "DRAFT" | "PUBLISHED" | "SUPERSEDED" | string; major: boolean; length: number; createdAt: string; publishedAt?: string | null };
type Message = { text: string; tone: "ok" | "error" } | null;
const MAX = 50_000;

/**
 * The Terms of Service and the Privacy Policy with a DRAFT and a PUBLISHED text for each language (D17): the text is written and saved as a draft, then published; a major change makes every
 * user agree again. A published language can be taken down, and an old version brought back as a draft.
 */
export function LegalDrafts() {
  const t = useTranslations("admin.legal");
  const tl = useTranslations("common.languages");
  const locale = useLocale();
  const [kind, setKind] = useState<Kind>("terms");
  const [lang, setLang] = useState<Locale>("en");
  const [data, setData] = useState<Overview | null>(null);
  const [text, setText] = useState("");
  const [major, setMajor] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const live = data?.documents[lang];
  const draft = data?.drafts[lang];
  const shown = draft?.content ?? live?.content ?? "";

  /** The document and the history of one language, from the server. */
  const fetchBoth = useCallback((k: Kind, l: Locale) => Promise.all([
    fetch(`/api/v1/admin/legal/${k}`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Overview>) : Promise.reject(new Error("failed")))),
    fetch(`/api/v1/admin/legal/${k}/versions?locale=${l}`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ items: HistoryItem[] }>) : { items: [] as HistoryItem[] })),
  ]), []);
  const show = useCallback((o: Overview, h: { items: HistoryItem[] }, l: Locale) => { setData(o); setHistory(h.items); setText(o.drafts[l]?.content ?? o.documents[l]?.content ?? ""); }, []);

  useEffect(() => {
    let live = true;
    fetchBoth(kind, lang).then(([o, h]) => { if (live) show(o, h, lang); }).catch(() => { if (live) setMessage({ text: t("loadFailed"), tone: "error" }); });
    return () => { live = false; };
  }, [kind, lang, fetchBoth, show, t]);

  async function call(method: string, path: string, body: unknown, ok: string) {
    setBusy(true);
    const res = await fetch(`/api/v1/admin/legal/${path}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setMessage({ text: res?.status === 422 ? t("tooLong", { max: MAX }) : t("failed"), tone: "error" }); return false; }
    setMessage({ text: ok, tone: "ok" });
    await fetchBoth(kind, lang).then(([o, h]) => show(o, h, lang)).catch(() => undefined);
    return true;
  }

  const dirty = text.trim() !== shown.trim();

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("descriptionDrafts")}</p>
      </header>
      <Notice message={message} />
      <Tabs value={kind} onValueChange={(v) => { setKind(v as Kind); setMessage(null); }}>
        <TabsList aria-label={t("kindLabel")}>
          <TabsTrigger value="terms" data-testid="legal-tab-terms">{t("terms")}</TabsTrigger>
          <TabsTrigger value="privacy" data-testid="legal-tab-privacy">{t("privacy")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle>{t(kind)}</CardTitle>
          <CardDescription>
            {live ? t("liveVersion", { version: live.version, date: fmt(live.updatedAt, locale), by: live.updatedBy ?? "-" }) : t("noLive")}
            {data ? ` ${t("consents", { agreed: data.consents.agreed, active: data.consents.activeUsers })}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="flex flex-wrap gap-2" aria-label={t("languages")} data-testid="legal-languages">
            {LOCALES.map((l) => (
              <li key={l}>
                <button type="button" onClick={() => { setLang(l); setMessage(null); }} aria-pressed={l === lang} data-testid={`legal-lang-${l}`}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${l === lang ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                  {data?.documents[l] ? <CircleCheck className="size-3.5" aria-hidden /> : null}{tl(l)}
                  <span className="sr-only"> ({data?.drafts[l] ? t("hasDraft") : data?.documents[l] ? t("written") : t("missing")})</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" data-testid="legal-state">{draft ? t("showingDraft", { version: draft.version }) : live ? t("showingLive") : t("showingNothing")}</p>
          <div className="grid gap-3">
            <label htmlFor="legal-text" className="text-sm font-medium">{t("textOf", { language: tl(lang) })}</label>
            <Textarea id="legal-text" data-testid="legal-text" rows={16} maxLength={MAX} value={text} className="font-mono" placeholder={t("placeholder")} onChange={(e) => { setText(e.target.value); setMessage(null); }} />
            <p className="text-xs text-muted-foreground">{t("format")} · {text.length} / {MAX}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy || !dirty} data-testid="legal-save" onClick={() => void call("PUT", kind, { locale: lang, content: text.trim() }, text.trim() ? t("draftSaved") : t("draftRemoved"))}>{t("saveDraft")}</Button>
              <Button type="button" variant="outline" disabled={busy || dirty || !draft} data-testid="legal-publish" onClick={() => void call("POST", `${kind}/publish`, { locale: lang, major }, t("published")).then((ok) => { if (ok) setMajor(false); })}>{t("publish")}</Button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} data-testid="legal-major" />{t("major")}</label>
              {live ? <Button type="button" variant="outline" disabled={busy} data-testid="legal-unpublish" onClick={() => void call("DELETE", `${kind}/${lang}`, undefined, t("unpublished"))}>{t("unpublish")}</Button> : null}
              <a href={`/${kind}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><ExternalLink aria-hidden /> {t("openPublic")}<span className="sr-only"> {t("opensNewTab")}</span></a>
            </div>
            <p className="text-xs text-muted-foreground">{t("majorHint")}</p>
          </div>
          {history.length > 0 ? (
            <section aria-label={t("history")} className="grid gap-2">
              <h2 className="text-sm font-semibold">{t("history")}</h2>
              <ul className="grid gap-1.5 text-sm" data-testid="legal-history">
                {history.map((h) => (
                  <li key={h.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
                    <span>{t("historyRow", { version: h.version, status: h.status, date: fmt(h.publishedAt ?? h.createdAt, locale), length: h.length })}{h.major ? ` · ${t("majorTag")}` : ""}</span>
                    {h.status !== "DRAFT" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void call("POST", `${kind}/versions/${h.version}/restore`, { locale: lang }, t("restored"))}>{t("restore")}</Button> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
