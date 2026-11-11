"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, ExternalLink } from "lucide-react";
import { LOCALES, type Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmt } from "../utils";
import { Notice, selectClass } from "./kit";

type Kind = "terms" | "privacy";
interface Doc { kind: Kind; content: Partial<Record<Locale, string>>; version: number; updatedAt: string; updatedBy: string }
type Message = { text: string; tone: "ok" | "error" } | null;
const MAX = 50_000;

/**
 * The text of the Terms of Service and of the Privacy Policy, in each of the five languages. A blank line starts a paragraph, a line that starts with "# " is a heading, one that starts with "- "
 * is a list item. The public pages /terms and /privacy show it at once (a language with no text shows the English text). Save is on only when the text changed (BR-17); the text is trimmed (BR-16).
 */
export function LegalAdmin() {
  const t = useTranslations("admin.legal");
  const tl = useTranslations("common.languages");
  const locale = useLocale();
  const [kind, setKind] = useState<Kind>("terms");
  const [lang, setLang] = useState<Locale>("en");
  const [docs, setDocs] = useState<Partial<Record<Kind, Doc>>>({});
  const [text, setText] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const doc = docs[kind];
  const saved = doc?.content[lang] ?? "";

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/admin/legal/${kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Doc>) : Promise.reject(new Error("failed"))))
      .then((d) => { if (live) { setDocs((x) => ({ ...x, [kind]: d })); setText(d.content[lang] ?? ""); } })
      .catch(() => { if (live) setMessage({ text: t("loadFailed"), tone: "error" }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the text is loaded again when the kind changes; a change of language only picks its text from what was loaded
  }, [kind, t]);

  function pick(next: Locale) { setLang(next); setText(docs[kind]?.content[next] ?? ""); setMessage(null); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/v1/admin/legal/${kind}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: lang, content: text.trim() }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setMessage({ text: res?.status === 422 ? t("tooLong", { max: MAX }) : t("failed"), tone: "error" }); return; }
    const d = (await res.json()) as Doc;
    setDocs((x) => ({ ...x, [kind]: d }));
    setText(d.content[lang] ?? "");
    setMessage({ text: text.trim() ? t("saved") : t("removed"), tone: "ok" });
  }

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
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
            {doc && doc.version > 0 ? t("version", { version: doc.version, date: fmt(doc.updatedAt, locale), by: doc.updatedBy }) : t("noVersion")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="flex flex-wrap gap-2" aria-label={t("languages")} data-testid="legal-languages">
            {LOCALES.map((l) => (
              <li key={l}>
                <button type="button" onClick={() => pick(l)} aria-pressed={l === lang} data-testid={`legal-lang-${l}`}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${l === lang ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                  {doc?.content[l] ? <CircleCheck className="size-3.5" aria-hidden /> : null}{tl(l)}
                  <span className="sr-only"> ({doc?.content[l] ? t("written") : t("missing")})</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={save} noValidate className="grid gap-3">
            <label htmlFor="legal-text" className="text-sm font-medium">{t("textOf", { language: tl(lang) })}</label>
            <Textarea id="legal-text" data-testid="legal-text" rows={18} maxLength={MAX} value={text} className="font-mono" placeholder={t("placeholder")} onChange={(e) => { setText(e.target.value); setMessage(null); }} />
            <p className="text-xs text-muted-foreground">{t("format")} · {text.length} / {MAX}</p>
            {lang !== "en" && !doc?.content.en ? <p className="text-xs text-amber-800">{t("fallbackNote")}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || text.trim() === saved} data-testid="legal-save">{busy ? t("saving") : t("save")}</Button>
              <a href={`/${kind}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><ExternalLink aria-hidden /> {t("openPublic")}<span className="sr-only"> {t("opensNewTab")}</span></a>
              <select aria-label={t("languages")} className={`${selectClass} sm:hidden`} value={lang} onChange={(e) => pick(e.target.value as Locale)}>{LOCALES.map((l) => <option key={l} value={l}>{tl(l)}</option>)}</select>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
