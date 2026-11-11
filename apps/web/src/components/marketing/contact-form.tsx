"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Topic = "general" | "demo" | "support" | "partnership";
const TOPICS: readonly Topic[] = ["general", "demo", "support", "partnership"];
interface Draft { name: string; email: string; topic: Topic; message: string; website: string }
const EMPTY: Draft = { name: "", email: "", topic: "general", message: "", website: "" };
type Errors = Partial<Record<"name" | "email" | "message", "required" | "email" | "short" | "tooLong">>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What is wrong with the form (the server checks again). Every text is trimmed first (BR-16). */
function check(d: Draft): Errors {
  const e: Errors = {};
  if (!d.name) e.name = "required"; else if (d.name.length > 120) e.name = "tooLong";
  if (!d.email) e.email = "required"; else if (!EMAIL.test(d.email) || d.email.length > 254) e.email = "email";
  if (!d.message) e.message = "required"; else if (d.message.length < 10) e.message = "short"; else if (d.message.length > 2000) e.message = "tooLong";
  return e;
}

/** The Contact form of the public site: name, email, what it is about and the message. A hidden box catches robots. */
export function ContactForm() {
  const t = useTranslations("marketing.contact.form");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed" | "limited">("idle");
  const [sentTo, setSentTo] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean: Draft = { ...draft, name: draft.name.trim(), email: draft.email.trim(), message: draft.message.trim() };
    setDraft(clean);
    const found = check(clean);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setState("sending");
    try {
      const res = await fetch("/api/v1/public/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(clean) });
      if (res.status === 201) { setSentTo(clean.email); setState("sent"); setDraft(EMPTY); return; }
      if (res.status === 429) { setState("limited"); return; }
      if (res.status === 422) {
        const j = (await res.json().catch(() => null)) as { error?: { details?: { fields?: Record<string, string> } } } | null;
        const f = j?.error?.details?.fields ?? {};
        const code = (v?: string) => (v === "tooShort" ? "short" : v === "tooLong" ? "tooLong" : v === "invalid" ? "email" : "required");
        setErrors({ ...(f.name ? { name: code(f.name) } : {}), ...(f.email ? { email: code(f.email) } : {}), ...(f.message ? { message: code(f.message) } : {}) });
      }
      setState("failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="grid justify-items-start gap-4 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-8" data-testid="contact-success">
        <CheckCircle2 className="size-10 text-emerald-300" aria-hidden />
        <h2 className="text-2xl font-semibold">{t("successTitle")}</h2>
        <p className="text-white/80">{t("successBody", { email: sentTo })}</p>
        <button type="button" onClick={() => setState("idle")} className="rounded-full border border-white/25 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10">{t("another")}</button>
      </div>
    );
  }

  const field = "w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-base text-white placeholder:text-white/40 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30";
  const row = (id: keyof Errors, label: string, control: React.ReactNode) => (
    <div className="grid gap-1.5">
      <label htmlFor={`ct-${id}`} className="text-sm font-medium text-white/90">{label}</label>
      {control}
      {errors[id] ? <p id={`ct-${id}-error`} role="alert" className="text-sm text-rose-300">{t(`errors.${errors[id]}`)}</p> : null}
    </div>
  );
  const bind = (id: "name" | "email" | "message") => ({ id: `ct-${id}`, "aria-invalid": errors[id] ? true : undefined, "aria-describedby": errors[id] ? `ct-${id}-error` : undefined });

  return (
    <form onSubmit={submit} noValidate className="relative grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8" data-testid="contact-form">
      <div>
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-white/70">{t("intro")}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {row("name", t("name"), <input {...bind("name")} type="text" autoComplete="name" maxLength={120} className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />)}
        {row("email", t("email"), <input {...bind("email")} type="text" inputMode="email" autoComplete="email" maxLength={254} className={field} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />)}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="ct-topic" className="text-sm font-medium text-white/90">{t("topic")}</label>
        <select id="ct-topic" className={cn(field, "[&>option]:text-slate-900")} value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value as Topic })}>
          {TOPICS.map((k) => <option key={k} value={k}>{t(`topics.${k}`)}</option>)}
        </select>
      </div>
      {row("message", t("message"), <textarea {...bind("message")} rows={6} maxLength={2000} className={cn(field, "resize-y")} placeholder={t("messagePlaceholder")} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />)}
      {/* The trap for robots: hidden from people and from the keyboard. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></label>
      </div>
      {state === "failed" ? <p role="alert" className="text-sm text-rose-300">{t("errors.failed")}</p> : null}
      {state === "limited" ? <p role="alert" className="text-sm text-rose-300">{t("errors.rateLimited")}</p> : null}
      <div>
        <button type="submit" disabled={state === "sending"} className="inline-flex h-12 items-center gap-2 rounded-full bg-cyan-400 px-8 text-base font-semibold text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.3)] outline-none transition hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60" data-testid="contact-send">
          <Send className="size-4" aria-hidden />{state === "sending" ? t("sending") : t("send")}
        </button>
      </div>
    </form>
  );
}
