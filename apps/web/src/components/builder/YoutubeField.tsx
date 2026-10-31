"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { isYoutubeId, parseYoutubeId, youtubeThumbnailUrl } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Paste a YouTube link; only the validated 11-char video ID is stored (the raw link is discarded). */
export function YoutubeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (videoId: string) => void }) {
  const t = useTranslations("builder");
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const has = isYoutubeId(value);

  function commit(raw: string) {
    setText(raw);
    if (!raw.trim()) { setInvalid(false); return; }
    const vid = parseYoutubeId(raw);
    if (vid) { onChange(vid); setInvalid(false); setText(""); } else setInvalid(true);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {has ? (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnailUrl(value)} alt="" className="h-12 w-20 rounded object-cover" referrerPolicy="no-referrer" />
          <p className="min-w-0 flex-1 truncate text-sm">{t("video.current", { id: value })}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(""); setText(""); }}>
            <Trash2 />{t("video.remove")}
          </Button>
        </div>
      ) : null}
      <Input
        id={id} type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=" value={text} maxLength={2048}
        aria-invalid={invalid} aria-describedby={`${id}-hint`} onChange={(e) => commit(e.target.value)}
      />
      <p id={`${id}-hint`} className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {invalid ? t("video.invalid") : has ? t("video.replaceHint") : t("video.hint")}
      </p>
    </div>
  );
}
