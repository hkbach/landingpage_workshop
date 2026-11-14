"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerAvatar } from "@/components/ops/customer-avatar";
import { mediaUploader, MediaUploadError, type MediaUploader } from "@/lib/media/uploader";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validate";

/**
 * The photo of the customer on the profile: a picture that shows the photo (or the initials), and the buttons to upload one (checked and shrunk in the browser, then sent to Cloudflare R2), to replace
 * it or to remove it. The value is "" or the https address of the stored image. The profile is saved with its own Save button, as before.
 */
export function AvatarUpload({ id, name, value, onChange, uploader = mediaUploader }: { id: string; name: string; value: string; onChange: (url: string) => void; uploader?: MediaUploader }) {
  const t = useTranslations("customer.profile");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const media = await uploader.upload(file, "avatar");
      onChange(media.url);
    } catch (e) {
      setError(e instanceof MediaUploadError ? e.code : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-4" aria-busy={busy} data-testid="avatar-upload">
      <CustomerAvatar name={name} url={value} className="size-16 text-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input ref={input} id={id} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only" data-testid="avatar-file" aria-describedby={`${id}-hint`} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {value ? <RefreshCw /> : <ImagePlus />}
            {value ? t("avatarReplace") : t("avatarUpload")}
          </Button>
          {value ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setError(null); onChange(""); }}><Trash2 />{t("avatarRemove")}</Button> : null}
        </div>
        {busy ? <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />{t("avatarUploading")}</p> : null}
        {error ? <p role="alert" className="text-xs text-destructive">{t(`avatarErrors.${error}`)}</p> : null}
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t("avatarHint")}</p>
      </div>
    </div>
  );
}
