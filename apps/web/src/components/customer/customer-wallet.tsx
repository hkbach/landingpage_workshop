"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";
import { formatMoney, parseMoney, type Locale } from "@workshop/shared";
import { Field } from "@/components/dashboard/shell/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerApiError, fetchCustomerWallet, requestCustomerWithdrawal, type WalletSource } from "@/lib/customer-api";
import { formatDate } from "@/lib/format";
import { usePagination } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { useCustomer } from "./customer-shell";

/** The balance of one program of the guest (Affiliate or Referrals) and its invoices; the same query for the numbers, the button and the History tab. */
export function useWallet(source: WalletSource) {
  const { accountId, email } = useCustomer();
  const queryClient = useQueryClient();
  const key = useMemo(() => ["customer-wallet", accountId, email ?? "no-login", source], [accountId, email, source]);
  const query = useQuery({ queryKey: key, queryFn: () => fetchCustomerWallet(accountId, email, source), retry: false });
  return { query, key, accountId, email, refresh: () => queryClient.invalidateQueries({ queryKey: key }) };
}

function Stat({ label, value, testId, hint }: { label: string; value: string; testId: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums" data-testid={testId}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * The overall numbers of a program (total earned, pending, withdrawn) and the Withdraw button, which opens a popup to type the amount. The amount is checked against what is
 * available here and again by the server; a request becomes an invoice that waits for the platform and shows in the History tab (`onRequested` lets the page go there).
 */
export function WalletOverview({ source, onRequested }: { source: WalletSource; onRequested?: () => void }) {
  const t = useTranslations("customer.wallet");
  const locale = useLocale() as Locale;
  const { query } = useWallet(source);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const w = query.data;
  const money = (n: number) => (w ? formatMoney(n, w.currency, locale) : "—");

  return (
    <section aria-label={t("overview")} className="grid gap-3" data-testid="wallet-overview">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("earned")} value={money(w?.earned ?? 0)} testId="wallet-earned" />
        <Stat label={t("pending")} value={money(w?.pending ?? 0)} testId="wallet-pending" hint={t("pendingHint")} />
        <Stat label={t("withdrawn")} value={money(w?.withdrawn ?? 0)} testId="wallet-withdrawn" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => { setNote(null); setOpen(true); }} disabled={!w || w.available <= 0} title={w && w.available <= 0 ? t("nothing") : undefined} data-testid="wallet-withdraw">
          <Banknote aria-hidden /> {t("withdraw")}
        </Button>
        <span className="text-sm text-muted-foreground" data-testid="wallet-available">{t("available", { amount: money(w?.available ?? 0) })}</span>
        {note ? <span role="status" className="text-sm font-medium text-emerald-800" data-testid="wallet-note">{note}</span> : null}
      </div>
      {open && w ? (
        <WithdrawDialog
          source={source} available={w.available} currency={w.currency} onClose={() => setOpen(false)}
          onDone={(code) => { setOpen(false); setNote(t("done", { code })); onRequested?.(); }}
        />
      ) : null}
    </section>
  );
}

function WithdrawDialog({ source, available, currency, onClose, onDone }: { source: WalletSource; available: number; currency: string; onClose: () => void; onDone: (code: string) => void }) {
  const t = useTranslations("customer.wallet");
  const locale = useLocale() as Locale;
  const { accountId, email, refresh } = useWallet(source);
  const [text, setText] = useState("");
  const [error, setError] = useState<"" | "required" | "invalid" | "exceeds" | "failed">("");
  const [busy, setBusy] = useState(false);
  const money = (n: number) => formatMoney(n, currency, locale);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const typed = text.trim(); // BR-16
    if (!typed) { setError("required"); return; }
    const amount = parseMoney(typed, currency);
    if (amount === null || amount <= 0) { setError("invalid"); return; }
    if (amount > available) { setError("exceeds"); return; }
    setBusy(true);
    try {
      const made = await requestCustomerWithdrawal(accountId, email, source, amount);
      await refresh();
      onDone(made.code);
    } catch (err) {
      const field = err instanceof CustomerApiError ? err.fields.amount : undefined;
      setError(field === "exceeds" ? "exceeds" : field === "invalid" ? "invalid" : "failed");
    } finally {
      setBusy(false);
    }
  }

  const message = error === "required" ? t("errors.required") : error === "invalid" ? t("errors.invalid") : error === "exceeds" ? t("errors.exceeds", { amount: money(available) }) : error === "failed" ? t("errors.failed") : undefined;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="wallet-dialog">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogBody", { program: t(`program.${source}`), amount: money(available) })}</DialogDescription>
          </DialogHeader>
          <Field htmlFor="wd-amount" label={t("amountLabel", { currency })} error={message} hint={t("amountHint", { amount: money(available) })}>
            <Input id="wd-amount" inputMode="decimal" autoComplete="off" value={text} aria-invalid={Boolean(message)} onChange={(e) => { setText(e.target.value); setError(""); }} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={busy} data-testid="wallet-submit">{busy ? t("submitting") : t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_TONE = { PENDING: "bg-amber-100 text-amber-900", PAID: "bg-emerald-100 text-emerald-900", REJECTED: "bg-rose-100 text-rose-900" } as const;

/** The History tab: the invoices of the program with their state (pending, paid, or rejected with the reason), newest first. */
export function WalletHistory({ source }: { source: WalletSource }) {
  const t = useTranslations("customer.wallet");
  const tc = useTranslations("customer");
  const locale = useLocale() as Locale;
  const { query } = useWallet(source);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const pg = usePagination(items, "");

  if (query.isPending) return <p role="status" aria-busy="true" className="text-sm text-muted-foreground">{tc("shell.loading")}</p>;
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p className="text-sm">{tc("gate.loadFailed")}</p>
        <Button onClick={() => void query.refetch()}>{tc("gate.retry")}</Button>
      </div>
    );
  }
  if (items.length === 0) return <p className="text-sm text-muted-foreground" data-testid="wallet-history-empty">{t("empty")}</p>;
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table data-testid="wallet-history">
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.invoice")}</TableHead>
              <TableHead>{t("col.requested")}</TableHead>
              <TableHead className="text-right">{t("col.amount")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
              <TableHead>{t("col.processed")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((i) => (
              <TableRow key={i.id} data-testid="wallet-invoice">
                <TableCell className="font-mono text-xs">{i.code}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(i.requestedAt, "UTC", locale)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(i.amount, i.currency, locale)}</TableCell>
                <TableCell className="whitespace-normal">
                  <span data-testid="wallet-invoice-status" className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", STATUS_TONE[i.status])}>{t(`status.${i.status}`)}</span>
                  {i.reason ? <div className="mt-0.5 max-w-xs text-xs text-muted-foreground">{t("reason", { reason: i.reason })}</div> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{i.processedAt ? formatDate(i.processedAt, "UTC", locale) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationBar {...pg.bar} />
    </div>
  );
}
