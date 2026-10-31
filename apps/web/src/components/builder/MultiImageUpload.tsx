"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaUploader, type MediaUploader, type UploadPurpose } from "@/lib/media/uploader";
import { uploadMany, type UploadManyResult } from "@/lib/media/upload-many";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validate";

/**
 * Select several images at once. Files are uploaded one after another and appended after the current images
 * (up to `max`); each failure is listed by file name and never blocks the others.
 */
export function MultiImageUpload({ id, current, max, onAdd, purpose = "site", uploader = mediaUploader }: {
  id: string; current: string[]; max: number; onAdd: (urls: string[]) => void; purpose?: UploadPurpose; uploader?: MediaUploader;
}) {
  const t = useTranslations("builder");
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<UploadManyResult | null>(null);

  const remaining = Math.max(0, max - current.length);
  const busy = progress !== null;

  async function onFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0 || busy) return;
    const base = current;
    setReport(null);
    setProgress({ done: 0, total: Math.min(files.length, remaining) });
    const result = await uploadMany(files, uploader, purpose, remaining, (done, total, urls) => {
      setProgress({ done, total });
      onAdd([...base, ...urls]);
    });
    setProgress(null);
    setReport(result);
  }

  return (
    <div className="space-y-2" aria-busy={busy}>
      <input
        ref={input} id={`${id}-multi`} type="file" multiple accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only"
        onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy || remaining === 0} onClick={() => input.current?.click()} aria-describedby={`${id}-multi-hint`}>
        <ImagePlus />{t("image.uploadMany")}
      </Button>
      <p id={`${id}-multi-hint`} className="text-xs text-muted-foreground">{t("image.uploadManyHint", { remaining })}</p>

      {progress ? (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {t("image.uploadingMany", { done: progress.done, total: progress.total })}
        </p>
      ) : null}

      {report ? (
        <div role="status" className="space-y-1 text-xs">
          {report.urls.length > 0 ? <p className="text-muted-foreground">{t("image.uploadedMany", { count: report.urls.length })}</p> : null}
          {report.failed.length > 0 ? (
            <ul role="alert" className="list-disc space-y-0.5 pl-4 text-destructive">
              {report.failed.map((f, i) => (
                <li key={`${f.name}-${i}`}>{f.name}: {t(`image.errors.${f.code}`)}</li>
              ))}
            </ul>
          ) : null}
          {report.skipped.length > 0 ? <p className="text-destructive">{t("image.skippedMany", { count: report.skipped.length, max })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
