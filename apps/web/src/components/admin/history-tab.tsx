"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diffChanges } from "@/lib/audit-diff";
import { DirectoryTable, Pill, useDebounced, type Column } from "./directory/kit";
import { fmt } from "./utils";

/**
 * What each admin screen keeps track of: the kinds of record of the audit log it is about, and the starts of actions that are NOT a change (a login is not a change of an account). Every create and every
 * edit made on that screen (by an administrator, or by the shop owner or the customer when it is their own record) is a line of the audit log, and the History tab shows those lines.
 */
export const HISTORY_SCOPES = {
  shops: { entityType: ["organization"] },
  users: { entityType: ["user"], exclude: ["auth.login", "auth.logout", "legal.consent"] },
  workshops: { entityType: ["workshop"] },
  sessions: { entityType: ["session", "schedule_rule"] },
  promotions: { entityType: ["promotion"] },
  landingPages: { entityType: ["site_page"] },
  ratings: { entityType: ["rating"] },
  affiliate: { entityType: ["affiliate_link"] },
  referrals: { entityType: ["invite_link"] },
  withdrawals: { entityType: ["withdrawal", "withdrawal_limits"] },
  fees: { entityType: ["fee_settings"] },
  legal: { entityType: ["legal_document"] },
  platform: { entityType: ["platform_settings", "withdrawal_limits"] },
  messages: { entityType: ["contact_message"] },
  reports: { entityType: ["site_report"] },
  media: { entityType: ["media"] },
  emails: { entityType: ["email"] },
} as const satisfies Record<string, { entityType: readonly string[]; exclude?: readonly string[] }>;
export type HistoryScope = keyof typeof HISTORY_SCOPES;

interface ApiLine {
  id: string; action: string; entityType: string; entityId: string; organizationSlug: string | null; actorUserId: string | null; actorEmail: string | null; before: unknown; after: unknown; createdAt: string;
}
const PAGE = 50;

/** One screen with two tabs: the screen itself and its History. The screen stays mounted while History is open (what was typed in it is not lost). */
export function WithHistory({ scope, children }: { scope: HistoryScope; children: React.ReactNode }) {
  const t = useTranslations("admin.history");
  const [tab, setTab] = useState<"main" | "history">("main");
  return (
    <div className="grid gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v === "history" ? "history" : "main")}>
        <TabsList aria-label={t("tabsLabel")}>
          <TabsTrigger value="main" data-testid="tab-main">{t("tabMain")}</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">{t("tabHistory")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div hidden={tab !== "main"}>{children}</div>
      {tab === "history" ? <HistoryTab scope={scope} /> : null}
    </div>
  );
}

const tone = (action: string): "green" | "sky" | "red" | "slate" =>
  /(delete|remove|suspend|disable|reject|deactivate|unpublish|cancel)/.test(action) ? "red"
    : /\.(create|register|publish|restore|enable|resolve|pay)$/.test(action) ? "green"
      : /(update|save|set_|edit|reschedule|verify|visibility)/.test(action) ? "sky" : "slate";

/** The changes of one kind of record, newest first: when, who, what was done, to which record, and what each field was and became. */
export function HistoryTab({ scope }: { scope: HistoryScope }) {
  const t = useTranslations("admin.history");
  const locale = useLocale();
  const [who, setWho] = useState("");
  const [shop, setShop] = useState("");
  const typedWho = useDebounced(who);
  const typedShop = useDebounced(shop);
  const [state, setState] = useState<{ key: string; lines: ApiLine[]; next: string | null; error: boolean } | null>(null);
  const [more, setMore] = useState(false);

  const config = HISTORY_SCOPES[scope] as { entityType: readonly string[]; exclude?: readonly string[] };
  const query = useMemo(() => {
    const p = new URLSearchParams({ entityType: config.entityType.join(","), limit: String(PAGE) });
    if (config.exclude?.length) p.set("exclude", config.exclude.join(","));
    if (typedWho) p.set("email", typedWho);
    if (typedShop) p.set("org", typedShop);
    return p.toString();
  }, [config, typedWho, typedShop]);

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/admin/audit-logs?${query}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: ApiLine[]; nextCursor: string | null }>) : Promise.reject(new Error("failed"))))
      .then((j) => { if (live) setState({ key: query, lines: j.items, next: j.nextCursor, error: false }); })
      .catch(() => { if (live) setState({ key: query, lines: [], next: null, error: true }); });
    return () => { live = false; };
  }, [query]);

  const loadMore = useCallback(async () => {
    if (!state?.next) return;
    setMore(true);
    const res = await fetch(`/api/v1/admin/audit-logs?${query}&cursor=${encodeURIComponent(state.next)}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const j = (await res.json()) as { items: ApiLine[]; nextCursor: string | null };
      setState((s) => (s && s.key === query ? { ...s, lines: [...s.lines, ...j.items], next: j.nextCursor } : s));
    } else {
      setState((s) => (s ? { ...s, error: true } : s));
    }
    setMore(false);
  }, [state, query]);

  const fresh = state?.key === query;
  const lines = fresh ? state.lines : (state?.lines ?? null);

  const columns: Column<ApiLine>[] = [
    { key: "when", header: t("col.when"), cell: (l) => <span className="whitespace-nowrap">{fmt(l.createdAt, locale)}</span> },
    { key: "who", header: t("col.who"), cell: (l) => (l.actorEmail ? <span>{l.actorEmail}</span> : <span className="text-muted-foreground">{t("system")}</span>) },
    { key: "action", header: t("col.action"), cell: (l) => <Pill tone={tone(l.action)}>{l.action}</Pill> },
    {
      key: "record", header: t("col.record"),
      cell: (l) => (
        <>
          <div className="font-mono text-xs">{l.entityType} · {l.entityId.length > 12 ? `${l.entityId.slice(0, 8)}…` : l.entityId}</div>
          {l.organizationSlug ? <div className="text-xs text-muted-foreground">{l.organizationSlug}</div> : null}
        </>
      ),
    },
    { key: "changes", header: t("col.changes"), className: "max-w-md whitespace-normal", cell: (l) => <Changes line={l} /> },
  ];

  const boxes = [
    { id: "history-who", label: t("searchWho"), value: who, set: setWho },
    { id: "history-shop", label: t("searchShop"), value: shop, set: setShop },
  ];

  return (
    <div className="grid gap-3" data-testid="history-tab">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap items-end gap-3">
        {boxes.map((b) => (
          <div key={b.id} className="grid min-w-56 flex-1 gap-1.5 lg:max-w-sm">
            <label htmlFor={b.id} className="text-sm font-medium">{b.label}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id={b.id} type="search" className="pl-8" value={b.value} onChange={(e) => b.set(e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <DirectoryTable rows={lines} error={Boolean(fresh && state.error)} columns={columns} rowKey={(l) => l.id} resetKey={query} testId="history-table" />
      {fresh && state.next ? (
        <div>
          <Button type="button" variant="outline" disabled={more} onClick={() => void loadMore()} data-testid="history-more">{more ? t("loading") : t("more")}</Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("utcNote")}</p>
    </div>
  );
}

/** The fields a line changed, a few at a time (the rest open on a click). */
function Changes({ line }: { line: ApiLine }) {
  const t = useTranslations("admin.history");
  const changes = useMemo(() => diffChanges(line.before, line.after), [line.before, line.after]);
  const [all, setAll] = useState(false);
  if (changes.length === 0) return <span className="text-xs text-muted-foreground">{t("noDetails")}</span>;
  const shown = all ? changes : changes.slice(0, 3);
  return (
    <ul className="grid gap-0.5 text-xs">
      {shown.map((c) => (
        <li key={c.field} className="break-words">
          <span className="font-mono font-medium">{c.field}</span>: <span className="text-muted-foreground line-through decoration-muted-foreground/40">{c.before ?? t("empty")}</span> → <span>{c.after ?? t("empty")}</span>
        </li>
      ))}
      {changes.length > 3 ? (
        <li><button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setAll((v) => !v)}>{all ? t("less") : t("moreFields", { count: changes.length - 3 })}</button></li>
      ) : null}
    </ul>
  );
}
