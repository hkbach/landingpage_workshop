"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isImageUrl } from "@/components/sections/safe-url";
import { mediaUploader, MediaUploadError, type MediaUploader, type UploadPurpose } from "@/lib/media/uploader";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validate";

/**
 * Image field for the descriptor-driven editor: upload (validated client-side), preview, replace/remove, or paste an
 * https URL. The value is "", an https URL or (mock uploader, builder only) a data:image URL.
 */
export function ImageUploadField({ id, label, value, onChange, purpose = "site", uploader = mediaUploader }: {
  id: string; label: string; value: string; onChange: (url: string) => void; purpose?: UploadPurpose; uploader?: MediaUploader;
}) {
  const t = useTranslations("builder");
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isData = value.startsWith("data:");
  const valid = value === "" || isImageUrl(value, { allowDataImages: true });

  async function onFile(file: File | undefined) {
    if (!file) return;
    const ticket = ++request.current;
    setError(null);
    setBusy(true);
    try {
      const media = await uploader.upload(file, purpose);
      if (ticket === request.current) onChange(media.url);
    } catch (e) {
      if (ticket === request.current) setError(e instanceof MediaUploadError ? e.code : "failed");
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  }

  const hasImage = value !== "" && valid;
  return (
    <div className="space-y-2" aria-busy={busy}>
      <Label htmlFor={`${id}-file`}>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={t("image.previewAlt", { name: label })} className="size-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={input} id={`${id}-file`} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only"
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} aria-describedby={`${id}-hint`}>
              {hasImage ? <RefreshCw /> : <ImagePlus />}
              {hasImage ? t("image.replace") : t("image.upload")}
              <span className="sr-only"> ({label})</span>
            </Button>
            {value ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { request.current++; setError(null); onChange(""); }}>
                <Trash2 />{t("image.remove")}<span className="sr-only"> ({label})</span>
              </Button>
            ) : null}
          </div>
          {busy ? (
            <div role="status" className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />{t("image.uploading")}</p>
              <div className="h-1 overflow-hidden rounded bg-muted" aria-hidden><div className="h-full w-1/3 animate-pulse rounded bg-primary" /></div>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-xs text-destructive">{t(`image.errors.${error}`)}</p> : null}
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t("image.hint")}</p>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{t("image.orPaste")}</Label>
        <Input
          id={id} type="url" inputMode="url" placeholder="https://" value={isData ? "" : value} maxLength={2000} aria-invalid={!valid}
          aria-describedby={!valid ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value.trim())}
        />
        {isData ? <p className="text-xs text-muted-foreground">{t("image.uploadedNote")}</p> : null}
        {!valid ? <p id={`${id}-err`} className="text-xs text-destructive">{t("editor.errors.httpsUrl")}</p> : null}
      </div>
    </div>
  );
}
