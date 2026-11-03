"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { bpsToPercent, checkFeeRates, percentToBps, type FeeRates } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ops/field";
import { useDirty } from "@/lib/use-dirty";

/**
 * The fees the platform takes from the income of ONE shop (each shop has its own rates): Profit = total income - maintenance fee (a % of each booking) - service fee (a %).
 * Save stays disabled until a rate changes (BR-17); the texts are trimmed (BR-16).
 */
export function PlatformFeesForm({ organizationId, initial }: { organizationId: string; initial: FeeRates }) {
  const t = useTranslations("admin.fees");
  const [saved, setSaved] = useState(initial);
  const [maintenance, setMaintenance] = useState(bpsToPercent(initial.maintenanceBps));
  const [service, setService] = useState(bpsToPercent(initial.serviceBps));
  const [errors, setErrors] = useState<{ maintenance?: string; service?: string }>({});
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useDirty({ maintenance, service }, `${saved.maintenanceBps}|${saved.serviceBps}`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const maintenanceBps = percentToBps(maintenance);
    const serviceBps = percentToBps(service);
    const next: { maintenance?: string; service?: string } = {};
    if (maintenanceBps === null) next.maintenance = t("errors.invalid");
    if (serviceBps === null) next.service = t("errors.invalid");
    if (maintenanceBps !== null && serviceBps !== null && checkFeeRates({ maintenanceBps, serviceBps }) === "TOTAL_TOO_HIGH") next.service = t("errors.totalTooHigh");
    setErrors(next);
    if (maintenanceBps === null || serviceBps === null || next.service) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/finance-settings`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ maintenanceBps, serviceBps }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const rates = (await res.json()) as FeeRates;
      setSaved(rates);
      setMaintenance(bpsToPercent(rates.maintenanceBps));
      setService(bpsToPercent(rates.serviceBps));
      setMessage({ text: t("saved"), tone: "ok" });
    } catch {
      setMessage({ text: t("saveFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t("formula")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4" data-testid="fees-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fee-maintenance" label={t("maintenance")} hint={t("maintenanceHint")} required error={errors.maintenance}>
              {(p) => <Input {...p} inputMode="decimal" value={maintenance} onChange={(e) => { setMaintenance(e.target.value); setErrors({}); }} onBlur={() => setMaintenance((v) => v.trim())} autoComplete="off" />}
            </Field>
            <Field id="fee-service" label={t("service")} hint={t("serviceHint")} required error={errors.service}>
              {(p) => <Input {...p} inputMode="decimal" value={service} onChange={(e) => { setService(e.target.value); setErrors({}); }} onBlur={() => setService((v) => v.trim())} autoComplete="off" />}
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!dirty || busy}><Save aria-hidden />{t("save")}</Button>
            <p role="status" className={message?.tone === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-emerald-800"}>{message?.text}</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
