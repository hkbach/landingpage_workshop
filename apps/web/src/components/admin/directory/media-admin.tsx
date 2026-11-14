"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeImage } from "@/components/sections/safe-url";
import type { AdminMedia } from "@/lib/admin-types";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DirectoryTable, FilterBox, Notice, Pill, Toolbar, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
const KINDS = ["promotion", "session", "workshop"] as const;
const size = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/**
 * The images of the shops: the files a shop uploaded (kept by the platform, later in Cloudflare R2) and the images the shops show from a link. Search by the shop or by what shows the image; filter by
 * what it is for and by where it is kept. An administrator looks at an image and removes a file that breaks the rules (a reason is needed); what showed it then has no image.
 */
export function MediaAdmin() {
  const t = useTranslations("admin.media");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [source, setSource] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminMedia>("media", { q: typed, kind, source });
  const [removing, setRemoving] = useState<AdminMedia | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function remove(m: AdminMedia, reason: string) {
    setRemoving(null);
    const res = await fetch(`/api/v1/admin/media/${encodeURIComponent(m.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }).catch(() => null);
    setMessage(res?.ok ? { text: t("removed"), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const columns: Column<AdminMedia>[] = [
    {
      key: "image", header: t("col.image"),
      cell: (m) => {
        const src = safeImage(m.url);
        return src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-16 rounded-md object-cover" data-testid="media-thumb" />
        ) : <span className="grid h-12 w-16 place-items-center rounded-md bg-muted text-xs text-muted-foreground">—</span>;
      },
    },
    { key: "shop", header: t("col.shop"), cell: (m) => m.shopName },
    { key: "kind", header: t("col.kind"), cell: (m) => t(`kind.${m.kind}`) },
    { key: "usedBy", header: t("col.usedBy"), cell: (m) => m.usedBy || <span className="text-muted-foreground">—</span> },
    { key: "source", header: t("col.source"), cell: (m) => <Pill tone={m.source === "UPLOAD" ? "sky" : "slate"}>{t(`source.${m.source}`)}</Pill> },
    { key: "file", header: t("col.file"), className: "whitespace-nowrap text-sm", cell: (m) => (m.source === "UPLOAD" ? `${m.mime.replace("image/", "").toUpperCase()} · ${size(m.size)}` : "—") },
    { key: "date", header: t("col.uploaded"), className: "whitespace-nowrap text-sm", cell: (m) => (m.uploadedAt ? fmt(m.uploadedAt, locale) : "—") },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (m) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <a href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted"><ExternalLink className="size-3.5" aria-hidden />{t("open")}<span className="sr-only"> {t("opensNewTab")}</span></a>
          {m.source === "UPLOAD" ? <Button size="sm" variant="destructive" onClick={() => setRemoving(m)} data-testid="media-remove"><Trash2 aria-hidden /> {t("remove")}</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="md-kind" label={t("col.kind")}>
          <select id="md-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("all")}</option>
            {KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="md-source" label={t("col.source")}>
          <select id="md-source" className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t("all")}</option>
            <option value="UPLOAD">{t("source.UPLOAD")}</option>
            <option value="LINK">{t("source.LINK")}</option>
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(m) => `${m.source}-${m.id}`} resetKey={`${typed}|${kind}|${source}`} testId="media-table" />
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      <ReasonDialog
        open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }} reason="required" destructive
        title={t("removeTitle")} description={t("removeBody")} confirmLabel={t("remove")}
        onConfirm={(why) => { if (removing) void remove(removing, why); }}
      />
    </div>
  );
}
