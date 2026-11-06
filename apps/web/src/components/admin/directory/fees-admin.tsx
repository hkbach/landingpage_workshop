"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { bpsToPercent, checkFeeRates, isValidFeeBps, percentToBps } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { usePagination } from "@/lib/pagination";
import { ReasonDialog } from "../reason-dialog";
import { Notice } from "./kit";

interface Rates { maintenanceBps: number; serviceBps: number; referralBps: number }
interface Item extends Rates { shopId: string; shopName: string }
type Texts = { maintenance: string; service: string; referral: string };
type Message = { text: string; tone: "ok" | "error" } | null;
const toTexts = (r: Rates): Texts => ({ maintenance: bpsToPercent(r.maintenanceBps), service: bpsToPercent(r.serviceBps), referral: bpsToPercent(r.referralBps) });

/** The three percentages as typed to basis points; the name of the field that is wrong, or the three rates. */
function parse(x: Texts): { ok: true; rates: Rates } | { ok: false; field: keyof Texts | "total" } {
  const maintenanceBps = percentToBps(x.maintenance), serviceBps = percentToBps(x.service), referralBps = percentToBps(x.referral);
  if (maintenanceBps === null) return { ok: false, field: "maintenance" };
  if (serviceBps === null) return { ok: false, field: "service" };
  if (referralBps === null || !isValidFeeBps(referralBps)) return { ok: false, field: "referral" };
  if (checkFeeRates({ maintenanceBps, serviceBps }) !== "OK") return { ok: false, field: "total" };
  return { ok: true, rates: { maintenanceBps, serviceBps, referralBps } };
}

/**
 * The fees of the platform, in percent: the maintenance fee and the service fee charged on the bookings of a shop, and the referral fee (the part of those fees that is paid to
 * the person whose referral link brought the booking). Set for one shop at a time, or by a bulk action that applies the same rates to every shop.
 */
export function FeesAdmin() {
  const t = useTranslations("admin.feesAll");
  const [items, setItems] = useState<Item[] | null>(null);
  const [defaults, setDefaults] = useState<Rates | null>(null);
  const [token, setToken] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [bulk, setBulk] = useState<Texts>({ maintenance: "", service: "", referral: "" });
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Rates | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/admin/fees", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ defaults: Rates; items: Item[] }>) : Promise.reject(new Error("failed"))))
      .then((j) => { if (live) { setItems(j.items); setDefaults((d) => d ?? j.defaults); setBulk((b) => (b.maintenance ? b : toTexts(j.defaults))); } })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [token]);
  const pg = usePagination(items ?? [], "");

  function startBulk(e: React.FormEvent) {
    e.preventDefault();
    const p = parse({ maintenance: bulk.maintenance.trim(), service: bulk.service.trim(), referral: bulk.referral.trim() });
    if (!p.ok) { setBulkError(p.field); return; }
    setBulkError(null);
    setConfirm(p.rates);
  }

  async function applyAll(r: Rates) {
    setConfirm(null);
    const res = await fetch("/api/v1/admin/fees/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) }).catch(() => null);
    setMessage(res?.ok ? { text: t("bulkDone", { n: ((await res.json()) as { applied: number }).applied }), tone: "ok" } : { text: t("failed"), tone: "error" });
    setToken((n) => n + 1);
  }

  const err = (field: string | null, k: keyof Texts | "total") => (field === k ? t(k === "total" ? "totalTooHigh" : "invalid") : undefined);

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Card>
        <CardHeader>
          <CardTitle>{t("bulkTitle")}</CardTitle>
          <CardDescription>{t("bulkIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={startBulk} noValidate className="flex flex-wrap items-start gap-3" data-testid="fees-bulk">
            {(["maintenance", "service", "referral"] as const).map((k) => (
              <div key={k} className="grid w-40 gap-1.5">
                <label htmlFor={`bulk-${k}`} className="text-sm font-medium">{t(`col.${k}`)}</label>
                <Input id={`bulk-${k}`} inputMode="decimal" value={bulk[k]} aria-invalid={bulkError === k || (bulkError === "total" && k !== "referral")} onChange={(e) => { setBulk({ ...bulk, [k]: e.target.value }); setBulkError(null); }} />
                {err(bulkError, k) ? <p role="alert" className="text-xs text-destructive">{err(bulkError, k)}</p> : null}
              </div>
            ))}
            <Button type="submit" className="mt-6">{t("applyAll")}</Button>
            {bulkError === "total" ? <p role="alert" className="mt-7 text-xs text-destructive">{t("totalTooHigh")}</p> : null}
          </form>
          {defaults ? <p className="mt-3 text-xs text-muted-foreground">{t("defaults", { m: bpsToPercent(defaults.maintenanceBps), s: bpsToPercent(defaults.serviceBps), r: bpsToPercent(defaults.referralBps) })}</p> : null}
        </CardContent>
      </Card>
      <div className="rounded-xl border bg-card" data-testid="fees-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.shop")}</TableHead>
              <TableHead>{t("col.maintenance")}</TableHead>
              <TableHead>{t("col.service")}</TableHead>
              <TableHead>{t("col.referral")}</TableHead>
              <TableHead><span className="sr-only">{t("col.actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items === null ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t("loading")}</TableCell></TableRow>
            ) : (
              pg.items.map((it) => <FeeRow key={`${it.shopId}-${it.maintenanceBps}-${it.serviceBps}-${it.referralBps}`} item={it} onDone={(m) => { setMessage(m); setToken((n) => n + 1); }} />)
            )}
          </TableBody>
        </Table>
      </div>
      <PaginationBar {...pg.bar} />
      <ReasonDialog
        open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }} reason="none"
        title={t("confirmTitle")} description={confirm ? t("confirmBody", { m: bpsToPercent(confirm.maintenanceBps), s: bpsToPercent(confirm.serviceBps), r: bpsToPercent(confirm.referralBps), n: items?.length ?? 0 }) : ""}
        confirmLabel={t("applyAll")} onConfirm={() => { if (confirm) void applyAll(confirm); }}
      />
    </div>
  );
}

/** The rates of one shop: three boxes and Save, which is enabled only when something changed (BR-17). */
function FeeRow({ item, onDone }: { item: Item; onDone: (m: Message) => void }) {
  const t = useTranslations("admin.feesAll");
  const [x, setX] = useState<Texts>(toTexts(item));
  const [field, setField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = { maintenance: x.maintenance.trim(), service: x.service.trim(), referral: x.referral.trim() }; // BR-16
  const base = toTexts(item);
  const dirty = clean.maintenance !== base.maintenance || clean.service !== base.service || clean.referral !== base.referral;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = parse(clean);
    if (!p.ok) { setField(p.field); return; }
    setBusy(true);
    const res = await fetch(`/api/v1/admin/fees/${encodeURIComponent(item.shopId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(p.rates) }).catch(() => null);
    setBusy(false);
    onDone(res?.ok ? { text: t("saved", { name: item.shopName }), tone: "ok" } : { text: t("failed"), tone: "error" });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{item.shopName}</TableCell>
      {(["maintenance", "service", "referral"] as const).map((k) => (
        <TableCell key={k} className="align-top">
          <Input
            aria-label={`${item.shopName}: ${t(`col.${k}`)}`} inputMode="decimal" className="w-24" value={x[k]} aria-invalid={field === k || (field === "total" && k !== "referral")}
            onChange={(e) => { setX({ ...x, [k]: e.target.value }); setField(null); }}
          />
          {field === k || (field === "total" && k === "service") ? <p role="alert" className="mt-1 text-xs text-destructive">{t(field === "total" ? "totalTooHigh" : "invalid")}</p> : null}
        </TableCell>
      ))}
      <TableCell className="text-right align-top">
        <form onSubmit={save} noValidate><Button type="submit" size="sm" disabled={busy || !dirty}>{t("save")}<span className="sr-only"> {item.shopName}</span></Button></form>
      </TableCell>
    </TableRow>
  );
}
