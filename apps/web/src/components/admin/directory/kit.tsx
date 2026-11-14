"use client";

import { ADMIN_LIST_PATH, adaptRows } from "@/lib/admin-adapters";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** The value of a box after the person stopped typing for a moment (so the list is not asked for at every key). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * A list of the system admin area from the mock backend (`/api/v1/admin/directory/{name}`) with the filters given. `items` is null while the list is being asked for; `reload`
 * asks again (after an action).
 */
export function useDirectory<T>(name: string, params: Record<string, string>): { items: T[] | null; error: boolean; reload: () => void } {
  // (the screens say DEACTIVATED, the API DISABLED)
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, name === "users" && k === "status" && v === "DEACTIVATED" ? "DISABLED" : v])).toString();
  const [token, setToken] = useState(0);
  const key = `${name}?${qs}#${token}`;
  const [state, setState] = useState<{ key: string; items: T[]; error: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/admin/${ADMIN_LIST_PATH[name] ?? `directory/${name}`}${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: T[] }>) : Promise.reject(new Error("failed"))))
      .then((j) => { if (live) setState({ key, items: adaptRows<T>(name, j.items), error: false }); })
      .catch(() => { if (live) setState({ key, items: [], error: true }); });
    return () => { live = false; };
  }, [name, qs, key]);
  const fresh = state?.key === key;
  return { items: fresh ? state.items : (state?.items ?? null), error: fresh ? state.error : false, reload: () => setToken((n) => n + 1) };
}

/** A search box with an icon, and the filters of the list beside it. */
export function Toolbar({ value, onChange, placeholder, label, children }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="grid min-w-64 flex-1 gap-1.5 lg:max-w-md">
        <label htmlFor="dir-search" className="text-sm font-medium">{label}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="dir-search" type="search" className="pl-8" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
      {children}
    </div>
  );
}

/** A filter of the toolbar: a label over a control. */
export function FilterBox({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export interface Column<T> { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string }

/** A table of a list with the states of loading, an error and no rows, and the pagination bar. */
export function DirectoryTable<T>({ rows, error, columns, rowKey, resetKey, testId }: { rows: T[] | null; error: boolean; columns: Column<T>[]; rowKey: (row: T) => string; resetKey: string; testId: string }) {
  const t = useTranslations("admin.dir");
  const pg = usePagination(rows ?? [], resetKey);
  return (
    <div className="grid gap-3" data-testid={testId}>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs [&_thead]:bg-muted/50 [&_th]:h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground lg:[&_td]:py-2.5">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((c) => <TableHead key={c.key} className={c.className}>{c.header}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">{t("loading")}</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={columns.length} role="alert" className="py-8 text-center text-destructive">{t("error")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">{t("empty")}</TableCell></TableRow>
            ) : (
              pg.items.map((row) => <TableRow key={rowKey(row)}>{columns.map((c) => <TableCell key={c.key} className={c.className}>{c.cell(row)}</TableCell>)}</TableRow>)
            )}
          </TableBody>
        </Table>
      </div>
      <PaginationBar {...pg.bar} />
    </div>
  );
}

/** The result of an action (done, or failed), under the title of the page. */
export function Notice({ message }: { message: { text: string; tone: "ok" | "error" } | null }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={cn("rounded-lg border p-3 text-sm", message.tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-emerald-300 bg-emerald-50 text-emerald-950")}>
      {message.text}
    </p>
  );
}

/** The detail of a row: label / value pairs in a dialog. */
export function DetailDialog({ open, onClose, title, description, rows, children }: { open: boolean; onClose: () => void; title: string; description?: string; rows: Array<[string, ReactNode]>; children?: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <dl className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-4 gap-y-2 text-sm" data-testid="detail-dialog">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value === "" || value === undefined || value === null ? "—" : value}</dd>
            </div>
          ))}
        </dl>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const TONES = { green: "bg-emerald-100 text-emerald-950", red: "bg-red-100 text-red-950", amber: "bg-amber-100 text-amber-950", slate: "bg-slate-100 text-slate-900", sky: "bg-sky-100 text-sky-900" } as const;
export function Pill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <Badge className={TONES[tone]}>{children}</Badge>;
}

/** A code of the platform in the language of the admin area (`admin.enums.{group}.{code}`); a code without a message is shown readable. */
export function useCodeLabel(): (group: string, code: string) => string {
  const t = useTranslations("admin.enums");
  return (group, code) => (t.has(`${group}.${code}` as never) ? t(`${group}.${code}` as never) : humanize(code));
}

/** "SHOP_OWNER" -> "Shop owner" for a value that has no message of its own. */
export const humanize = (code: string): string => { const s = code.toLowerCase().replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

export const selectClass = "h-8 min-w-36 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
