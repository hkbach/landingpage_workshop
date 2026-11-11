"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isValidSupportValue, SUPPORT_CHANNELS, supportLinks, type SupportChannel } from "@/lib/support-contact";
import { Notice } from "./kit";

type Values = Record<SupportChannel, string>;
const EMPTY: Values = { whatsapp: "", phone: "", zalo: "", email: "" };
type Message = { text: string; tone: "ok" | "error" } | null;

/**
 * The support contact of the platform: how a shop owner and a customer reach the admin team (WhatsApp, phone, Zalo, email). Platform-wide, not the contact of a shop, and never shown on a
 * landing page. A box left empty hides that channel. Values are trimmed (BR-16); Save is enabled only when something changed (BR-17).
 */
export function SupportContactAdmin() {
  const t = useTranslations("admin.supportContact");
  const [saved, setSaved] = useState<Values | null>(null);
  const [x, setX] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<SupportChannel, string>>>({});
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/admin/support-contact", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Values>) : Promise.reject(new Error("failed"))))
      .then((v) => { if (live) { setSaved(v); setX(v); } })
      .catch(() => { if (live) setMessage({ text: t("loadFailed"), tone: "error" }); });
    return () => { live = false; };
  }, [t]);

  const clean: Values = { whatsapp: x.whatsapp.trim(), phone: x.phone.trim(), zalo: x.zalo.trim(), email: x.email.trim() };
  const dirty = saved !== null && SUPPORT_CHANNELS.some((c) => clean[c] !== saved[c]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = Object.fromEntries(SUPPORT_CHANNELS.filter((c) => !isValidSupportValue(c, clean[c])).map((c) => [c, "invalid"]));
    setErrors(bad);
    if (Object.keys(bad).length) return;
    setBusy(true);
    const res = await fetch("/api/v1/admin/support-contact", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(clean) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const v = (await res.json()) as Values;
      setSaved(v); setX(v); setMessage({ text: t("saved"), tone: "ok" });
    } else if (res?.status === 422) {
      const j = (await res.json().catch(() => null)) as { error?: { details?: { fields?: Record<string, string> } } } | null;
      setErrors(j?.error?.details?.fields ?? {});
    } else {
      setMessage({ text: t("failed"), tone: "error" });
    }
  }

  const links = supportLinks(clean);

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("boundary")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} noValidate className="grid max-w-xl gap-4" data-testid="support-form">
            {SUPPORT_CHANNELS.map((c) => (
              <div key={c} className="grid gap-1.5">
                <label htmlFor={`support-${c}`} className="text-sm font-medium">{t(`channel.${c}`)}</label>
                <Input
                  id={`support-${c}`} data-testid={`support-${c}`} value={x[c]} disabled={saved === null} maxLength={254}
                  inputMode={c === "email" ? "email" : "tel"} autoComplete="off" placeholder={t(`placeholder.${c}`)}
                  aria-invalid={errors[c] ? true : undefined} aria-describedby={`support-${c}-hint`}
                  onChange={(e) => { setX({ ...x, [c]: e.target.value }); setErrors({ ...errors, [c]: undefined }); setMessage(null); }}
                />
                <p id={`support-${c}-hint`} className="text-xs text-muted-foreground">{t(`hint.${c}`)}</p>
                {errors[c] ? <p role="alert" className="text-xs text-destructive">{t(c === "email" ? "invalidEmail" : "invalidNumber")}</p> : null}
              </div>
            ))}
            <div>
              <Button type="submit" disabled={!dirty || busy} data-testid="support-save">{t("save")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("previewTitle")}</CardTitle>
          <CardDescription>{t("previewIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="support-preview-empty">{t("previewEmpty")}</p>
          ) : (
            <ul className="grid gap-1 text-sm" data-testid="support-preview">
              {links.map((l) => <li key={l.channel}><span className="font-medium">{t(`channel.${l.channel}`)}:</span> {l.value}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
