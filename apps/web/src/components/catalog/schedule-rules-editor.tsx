"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ops/field";
import { NativeSelect } from "@/components/ops/native-select";
import type { ScheduleRule } from "@/lib/mock/ops";
import { cn } from "@/lib/utils";
import { MAX_CAPACITY } from "./workshop-form";
import { useDirty } from "@/lib/use-dirty";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0 = Sunday ... 6 = Saturday (FR-SCHED-01 weekdays 0-6)

function useWeekdayNames(): string[] {
  const locale = useLocale();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    return WEEKDAYS.map((d) => f.format(new Date(Date.UTC(2024, 0, 7 + d)))); // 2024-01-07 is a Sunday
  }, [locale]);
}

/** FR-SCHED-01: recurring schedule rules for a workshop (mock state only). */
export function ScheduleRulesEditor({ workshopId, initialRules, timezone }: { workshopId: string; initialRules: ScheduleRule[]; timezone: string }) {
  const t = useTranslations("catalog");
  const days = useWeekdayNames();
  const [rules, setRules] = useState<ScheduleRule[]>(initialRules);
  const [editing, setEditing] = useState<ScheduleRule | "new" | null>(null);
  const [note, setNote] = useState(false);

  function save(rule: ScheduleRule) {
    setRules((list) => (list.some((r) => r.id === rule.id) ? list.map((r) => (r.id === rule.id ? rule : r)) : [...list, rule]));
    setEditing(null); setNote(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("rules.title")}</CardTitle>
          <Button size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" />{t("rules.add")}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("rules.hint", { tz: timezone })}</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rules.length === 0 ? <p className="text-sm text-muted-foreground">{t("rules.empty")}</p> : null}
        <ul className="grid gap-3">
          {rules.map((r) => (
            <li key={r.id} className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{r.weekdays.slice().sort().map((d) => days[d]).join(", ")}</p>
                <Badge variant="outline" className={r.status === "ACTIVE" ? "border-transparent bg-emerald-100 text-emerald-900" : "border-transparent bg-amber-100 text-amber-950"}>
                  {t(`rules.status.${r.status}`)}
                </Badge>
              </div>
              <p>{r.times.slice().sort().join(", ")} <span className="text-xs text-muted-foreground">({timezone})</span></p>
              <p className="text-xs text-muted-foreground">
                {t("rules.effective", { from: r.effectiveFrom, to: r.effectiveTo ?? t("rules.noEnd") })}
                {r.capacityOverride ? ` | ${t("rules.capacityOverrideValue", { n: r.capacityOverride })}` : ""}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}><Pencil aria-hidden="true" />{t("rules.edit")}</Button>
                <Button size="sm" variant="outline" aria-label={t("rules.remove")}
                  onClick={() => { setRules((l) => l.filter((x) => x.id !== r.id)); setNote(true); }}>
                  <Trash2 aria-hidden="true" />{t("rules.remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("rules.generateNote")}</p>
        <p role="status" className="text-sm text-emerald-800 empty:hidden">{note ? t("rules.changedSim") : ""}</p>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {editing ? (
            <RuleForm
              key={editing === "new" ? "new" : editing.id} days={days} timezone={timezone}
              rule={editing === "new" ? undefined : editing} workshopId={workshopId} onSave={save} onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function RuleForm({
  rule, workshopId, days, timezone, onSave, onCancel,
}: { rule?: ScheduleRule; workshopId: string; days: string[]; timezone: string; onSave: (r: ScheduleRule) => void; onCancel: () => void }) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? []);
  const [times, setTimes] = useState<string[]>(rule?.times ?? []);
  const [timeInput, setTimeInput] = useState("");
  const [from, setFrom] = useState(rule?.effectiveFrom ?? "");
  const [to, setTo] = useState(rule?.effectiveTo ?? "");
  const [cap, setCap] = useState(rule?.capacityOverride ? String(rule.capacityOverride) : "");
  const [status, setStatus] = useState<ScheduleRule["status"]>(rule?.status ?? "ACTIVE");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useDirty({ weekdays, times, from, to, cap, status }, rule?.id ?? "new");

  function addTime() {
    if (!TIME_RE.test(timeInput)) return setErrors((e) => ({ ...e, times: "errors.timeInvalid" }));
    if (!times.includes(timeInput)) setTimes((l) => [...l, timeInput].sort());
    setTimeInput(""); setErrors((e) => ({ ...e, times: "" }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (weekdays.length === 0) errs.weekdays = "errors.weekdaysRequired";
    if (times.length === 0) errs.times = "errors.timesRequired";
    if (!from) errs.from = "errors.fromRequired";
    if (to && from && to < from) errs.to = "errors.toBeforeFrom";
    const capNum = cap.trim() === "" ? undefined : Number(cap);
    if (capNum !== undefined && (!Number.isInteger(capNum) || capNum < 1 || capNum > MAX_CAPACITY)) errs.cap = "errors.capacityRange";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: rule?.id ?? `sr-local-${Date.now()}`, workshopId, weekdays: weekdays.slice().sort(), times, effectiveFrom: from,
      effectiveTo: to || undefined, capacityOverride: capNum, status,
    });
  }

  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{rule ? t("rules.editTitle") : t("rules.addTitle")}</DialogTitle>
        <DialogDescription>{t("rules.timesHint", { tz: timezone })}</DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-1.5" aria-describedby={errors.weekdays ? "wd-err" : undefined}>
        <legend className="mb-1 text-sm font-medium">{t("rules.weekdays")}<span aria-hidden="true" className="text-destructive">*</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {days.map((label, d) => {
            const on = weekdays.includes(d);
            return (
              <button
                key={d} type="button" aria-pressed={on}
                onClick={() => { setWeekdays((l) => (on ? l.filter((x) => x !== d) : [...l, d])); setErrors((x) => ({ ...x, weekdays: "" })); }}
                className={cn(
                  "h-9 min-w-11 rounded-lg border px-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {err("weekdays") ? <p id="wd-err" role="alert" className="text-xs text-destructive">{err("weekdays")}</p> : null}
      </fieldset>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">{t("rules.startTimes")}<span aria-hidden="true" className="text-destructive">*</span></legend>
        <div className="flex flex-wrap gap-1.5" aria-live="polite">
          {times.map((tm) => (
            <span key={tm} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
              {tm}
              <button type="button" aria-label={t("rules.removeTime", { time: tm })} className="rounded-full p-1 hover:bg-background"
                onClick={() => setTimes((l) => l.filter((x) => x !== tm))}>
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input type="time" aria-label={t("rules.newTime")} value={timeInput} onChange={(e) => setTimeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTime(); } }} />
          <Button type="button" variant="outline" onClick={addTime}><Plus aria-hidden="true" />{t("rules.addTime")}</Button>
        </div>
        {err("times") ? <p role="alert" className="text-xs text-destructive">{err("times")}</p> : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="rule-from" label={t("rules.from")} required error={err("from")}>
          {(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field id="rule-to" label={t("rules.to")} error={err("to")} hint={t("rules.toHint")}>
          {(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
        </Field>
        <Field id="rule-cap" label={t("rules.capacityOverride")} error={err("cap")} hint={t("rules.capacityOverrideHint")}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} value={cap} onChange={(e) => setCap(e.target.value)} />}
        </Field>
        <Field id="rule-status" label={t("rules.statusLabel")}>
          {(p) => (
            <NativeSelect {...p} value={status} onChange={(e) => setStatus(e.target.value as ScheduleRule["status"])}
              options={[{ value: "ACTIVE", label: t("rules.status.ACTIVE") }, { value: "PAUSED", label: t("rules.status.PAUSED") }]} />
          )}
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{tops("common.back")}</Button>
        <Button type="submit" disabled={!dirty}>{t("rules.save")}</Button>
      </DialogFooter>
    </form>
  );
}
