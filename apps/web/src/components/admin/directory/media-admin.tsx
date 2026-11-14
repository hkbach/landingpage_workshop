"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeImage } from "@/components/sections/safe-url";
import type { AdminMedia } from "@/lib/admin-types";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DirectoryTable, FilterBox, Notice, Toolbar, selectClass, useDebounced, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
type Tab = "USED" | "UNUSED";
const PURPOSES = ["site", "workshop", "branding", "session", "promotion"] as const;
/** The API removes at most this many files in one request. */
const BATCH = 100;
const size = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

interface Listing { items: AdminMedia[]; truncated: boolean; total: number }
type Loaded = { token: number; data: Listing | null; error: "notConfigured" | "failed" | null };

/** The files of the storage with their state (`GET /api/v1/admin/media`); `reload` asks again after an action. */
function useMedia(): { data: Listing | null; error: Loaded["error"]; reload: () => void } {
  const [token, setToken] = useState(0);
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/v1/admin/media", { cache: "no-store" })
      .then(async (r): Promise<Omit<Loaded, "token">> => {
        if (r.ok) return { data: (await r.json()) as Listing, error: null };
        const code = ((await r.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
        return { data: null, error: code === "MEDIA_NOT_CONFIGURED" ? "notConfigured" : "failed" };
      })
      .catch((): Omit<Loaded, "token"> => ({ data: null, error: "failed" }))
      .then((result) => { if (live) setState({ token, ...result }); });
    return () => { live = false; };
  }, [token]);
  return { data: state?.data ?? null, error: state?.error ?? null, reload: () => setToken((n) => n + 1) };
}

/**
 * The images kept in Cloudflare R2, in two tabs: the ones something still shows, and the ones nothing shows any more (their address is written nowhere in the system). In the second tab the
 * administrator selects images and deletes them from the storage in one action; a reason is needed, and the server checks again that each one is still unused before it removes it.
 */
export function MediaAdmin() {
  const t = useTranslations("admin.media");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("UNUSED");
  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const typed = useDebounced(q);
  const { data, error, reload } = useMedia();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const all = useMemo(() => data?.items ?? null, [data]);
  const counts = useMemo(() => ({ USED: all?.filter((m) => m.status === "USED").length ?? 0, UNUSED: all?.filter((m) => m.status === "UNUSED").length ?? 0 }), [all]);
  const rows = useMemo(() => {
    if (all === null) return null;
    const needle = typed.trim().toLowerCase();
    return all.filter((m) => m.status === tab && (!purpose || m.purpose === purpose) && (!needle || m.shopName.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle)));
  }, [all, tab, purpose, typed]);
  // Only what is selected AND listed now counts: an image hidden by the search or the folder filter, or gone after a reload, is never deleted by surprise.
  const chosen = useMemo(() => (tab === "UNUSED" ? (rows ?? []).filter((m) => selected.has(m.key)).map((m) => m.key) : []), [rows, selected, tab]);
  const everyListed = rows !== null && rows.length > 0 && rows.every((m) => selected.has(m.key));

  function toggle(key: string, on: boolean) {
    setSelected((prev) => { const next = new Set(prev); if (on) next.add(key); else next.delete(key); return next; });
  }
  function toggleAll(on: boolean) {
    setSelected((prev) => { const next = new Set(prev); for (const m of rows ?? []) { if (on) next.add(m.key); else next.delete(m.key); } return next; });
  }

  async function remove(reason: string) {
    setConfirming(false);
    setBusy(true);
    const total = { deleted: 0, inUse: 0, failed: 0 };
    for (let i = 0; i < chosen.length; i += BATCH) {
      const keys = chosen.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/v1/admin/media/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys, reason }) });
        if (!res.ok) throw new Error(String(res.status));
        const out = (await res.json()) as { deleted: string[]; inUse: string[]; failed: string[] };
        total.deleted += out.deleted.length; total.inUse += out.inUse.length; total.failed += out.failed.length;
      } catch {
        total.failed += keys.length; // (a refusal, a network error or an answer that is not JSON: the page is never left busy)
      }
    }
    setBusy(false);
    setSelected(new Set());
    setMessage({ text: t("done", total), tone: total.failed === 0 ? "ok" : "error" });
    reload();
  }

  const columns: Column<AdminMedia>[] = [
    ...(tab === "UNUSED" ? [{
      key: "select",
      header: <input type="checkbox" className="size-4 accent-primary" aria-label={t("selectAll")} checked={everyListed} onChange={(e) => toggleAll(e.target.checked)} disabled={busy || !rows?.length} data-testid="media-select-all" />,
      className: "w-10",
      cell: (m: AdminMedia) => <input type="checkbox" className="size-4 accent-primary" aria-label={t("selectRow")} checked={selected.has(m.key)} onChange={(e) => toggle(m.key, e.target.checked)} disabled={busy} data-testid="media-select" />,
    }] : []),
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
    { key: "shop", header: t("col.shop"), cell: (m) => m.shopName || "—" },
    { key: "kind", header: t("col.kind"), cell: (m) => t(`kind.${m.purpose}`) },
    ...(tab === "USED" ? [{ key: "usedBy", header: t("col.usedBy"), cell: (m: AdminMedia) => m.usedBy.map((u) => t(`usedBy.${u}`)).join(", ") || "—" }] : []),
    { key: "file", header: t("col.file"), className: "whitespace-nowrap text-sm", cell: (m) => `${m.key.split(".").pop()!.toUpperCase()} · ${size(m.size)}` },
    { key: "date", header: t("col.uploaded"), className: "whitespace-nowrap text-sm", cell: (m) => (m.uploadedAt ? fmt(m.uploadedAt, locale) : "—") },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (m) => (
        <a href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted"><ExternalLink className="size-3.5" aria-hidden />{t("open")}<span className="sr-only"> {t("opensNewTab")}</span></a>
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
      {error === "notConfigured" ? <Notice message={{ text: t("notConfigured"), tone: "error" }} /> : null}
      {data?.truncated ? <Notice message={{ text: t("truncated", { count: data.items.length }), tone: "error" }} /> : null}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setMessage(null); }}>
        <TabsList aria-label={t("tabsLabel")}>
          <TabsTrigger value="USED" data-testid="media-tab-used">{t("tab.used")} ({counts.USED})</TabsTrigger>
          <TabsTrigger value="UNUSED" data-testid="media-tab-unused">{t("tab.unused")} ({counts.UNUSED})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="md-kind" label={t("col.kind")}>
          <select id="md-kind" className={selectClass} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="">{t("all")}</option>
            {PURPOSES.map((p) => <option key={p} value={p}>{t(`kind.${p}`)}</option>)}
          </select>
        </FilterBox>
        {tab === "UNUSED" ? (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground" aria-live="polite" data-testid="media-selected">{t("selected", { count: chosen.length })}</span>
            <Button variant="destructive" disabled={busy || chosen.length === 0} onClick={() => setConfirming(true)} data-testid="media-bulk-delete"><Trash2 aria-hidden /> {t("deleteSelected")}</Button>
          </div>
        ) : null}
      </Toolbar>

      <DirectoryTable rows={error === "notConfigured" ? [] : rows} error={error === "failed"} columns={columns} rowKey={(m) => m.key} resetKey={`${tab}|${typed}|${purpose}`} testId="media-table" />
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      <ReasonDialog
        open={confirming} onOpenChange={setConfirming} reason="required" destructive
        title={t("deleteTitle", { count: chosen.length })} description={t("deleteBody")} confirmLabel={t("deleteSelected")}
        onConfirm={(why) => { void remove(why); }}
      />
    </div>
  );
}
