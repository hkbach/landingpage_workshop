"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { pickLocalized, type Locale, type Localized } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef } from "@/components/sections/registry";
import { isAllowedMapsUrl, isHttpsUrl } from "@/components/sections/safe-url";
import { ImageUploadField } from "./ImageUploadField";
import { YoutubeField } from "./YoutubeField";

type Values = Record<string, unknown>;

interface Props {
  fields: FieldDef[];
  value: Values;
  onChange: (next: Values) => void;
  lang: Locale;
  defaultLocale: Locale;
  idPrefix: string;
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Descriptor-driven editor: renders any section's props from its registry field list. */
export function FieldsEditor({ fields, value, onChange, lang, defaultLocale, idPrefix }: Props) {
  const t = useTranslations("builder");
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const label = t(`fields.${f.key}`);
        switch (f.kind) {
          case "localized": {
            const loc = (value[f.key] ?? {}) as Localized;
            const current = loc[lang] ?? "";
            const hasOther = Object.values(loc).some((s) => s?.trim());
            const missing = !current.trim() && hasOther;
            const fallback = missing ? pickLocalized(loc, lang, defaultLocale) : "";
            const update = (text: string) => set(f.key, { ...loc, [lang]: text });
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>{label} <span className="text-muted-foreground">({lang.toUpperCase()})</span></Label>
                {f.multiline ? (
                  <Textarea id={id} value={current} maxLength={f.max} onChange={(e) => update(e.target.value)} />
                ) : (
                  <Input id={id} value={current} maxLength={f.max} onChange={(e) => update(e.target.value)} />
                )}
                {missing ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-800" role="status">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {t("editor.missingTranslation", { fallback: fallback.slice(0, 60) })}
                  </p>
                ) : null}
              </div>
            );
          }
          case "plain": {
            const v = typeof value[f.key] === "string" ? (value[f.key] as string) : "";
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input id={id} type={f.inputType ?? "text"} value={v} maxLength={f.max} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            );
          }
          case "image": {
            const v = typeof value[f.key] === "string" ? (value[f.key] as string) : "";
            return <ImageUploadField key={f.key} id={id} label={label} value={v} purpose="site" onChange={(url) => set(f.key, url)} />;
          }
          case "youtube": {
            const v = typeof value[f.key] === "string" ? (value[f.key] as string) : "";
            return <YoutubeField key={f.key} id={id} label={label} value={v} onChange={(vid) => set(f.key, vid)} />;
          }
          case "link":
          case "maps": {
            const v = typeof value[f.key] === "string" ? (value[f.key] as string) : "";
            const invalid = v !== "" && !(f.kind === "maps" ? isAllowedMapsUrl(v) : isHttpsUrl(v));
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id} type="url" inputMode="url" value={v} maxLength={2000} aria-invalid={invalid}
                  aria-describedby={`${id}-hint`} placeholder="https://" onChange={(e) => set(f.key, e.target.value.trim())}
                />
                <p id={`${id}-hint`} className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {invalid ? t(f.kind === "maps" ? "editor.errors.mapsUrl" : "editor.errors.httpsUrl") : t(f.kind === "maps" ? "editor.hints.mapsUrl" : "editor.hints.linkUrl")}
                </p>
              </div>
            );
          }
          case "select": {
            const v = typeof value[f.key] === "string" ? (value[f.key] as string) : f.options[0]!;
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>{label}</Label>
                <select id={id} className={selectClass} value={v} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options.map((o) => <option key={o} value={o}>{t(`options.${f.key}.${o}`)}</option>)}
                </select>
              </div>
            );
          }
          case "imageList": {
            const urls = Array.isArray(value[f.key]) ? (value[f.key] as string[]) : [];
            return (
              <fieldset key={f.key} className="space-y-2">
                <legend className="text-sm font-medium">{label} <span className="text-muted-foreground">({urls.length}/{f.max})</span></legend>
                {urls.map((u, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <ImageUploadField
                        id={`${id}-${i}`} label={`${label} ${i + 1}`} value={typeof u === "string" ? u : ""} purpose="site"
                        onChange={(url) => set(f.key, urls.map((x, j) => (j === i ? url : x)))}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => set(f.key, urls.filter((_, j) => j !== i))}>
                      <Trash2 /><span className="sr-only">{t("editor.remove")} {i + 1}</span>
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" disabled={urls.length >= f.max} onClick={() => set(f.key, [...urls, ""])}>
                  <Plus />{t("editor.addImage")}
                </Button>
              </fieldset>
            );
          }
          case "list": {
            const items = Array.isArray(value[f.key]) ? (value[f.key] as Values[]) : [];
            const move = (i: number, d: -1 | 1) => {
              const next = [...items];
              const j = i + d;
              if (j < 0 || j >= next.length) return;
              [next[i], next[j]] = [next[j]!, next[i]!];
              set(f.key, next);
            };
            return (
              <fieldset key={f.key} className="space-y-3">
                <legend className="text-sm font-medium">{label} <span className="text-muted-foreground">({items.length}/{f.max})</span></legend>
                {items.map((item, i) => {
                  const titleVal = item[f.titleKey];
                  const title = typeof titleVal === "string" ? titleVal : pickLocalized(titleVal as Localized, lang, defaultLocale);
                  return (
                    <div key={i} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{title || t("editor.itemN", { n: i + 1 })}</p>
                        <div className="flex shrink-0">
                          <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp /><span className="sr-only">{t("editor.moveUp")}</span>
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown /><span className="sr-only">{t("editor.moveDown")}</span>
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => set(f.key, items.filter((_, j) => j !== i))}>
                            <Trash2 /><span className="sr-only">{t("editor.remove")}</span>
                          </Button>
                        </div>
                      </div>
                      <FieldsEditor
                        fields={f.fields} value={item} lang={lang} defaultLocale={defaultLocale} idPrefix={`${id}-${i}`}
                        onChange={(next) => set(f.key, items.map((x, j) => (j === i ? next : x)))}
                      />
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" disabled={items.length >= f.max} onClick={() => set(f.key, [...items, f.newItem()])}>
                  <Plus />{t("editor.addItem")}
                </Button>
              </fieldset>
            );
          }
        }
      })}
    </div>
  );
}
