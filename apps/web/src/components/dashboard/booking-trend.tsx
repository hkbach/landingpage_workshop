"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isDailyPeriod, niceScale, TREND_PERIODS, trendTotals, type TrendBucket, type TrendPeriod } from "@workshop/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/dashboard/shell/native-select";

// Plain SVG (no chart library). Blue = attended, teal = still to come, orange = cancelled / no-show; the legend names them and the
// stack order is fixed, so colour is never the only cue. A table with the same numbers is one click away.
const COLORS = { attended: "#1d4ed8", upcoming: "#0f766e", lost: "#c2410c" } as const;
const GROUPS = ["attended", "upcoming", "lost"] as const;

const W = 640, H = 260, LEFT = 40, RIGHT = 8, TOP = 12, BOTTOM = 32;
const PLOT_W = W - LEFT - RIGHT, PLOT_H = H - TOP - BOTTOM;

export function BookingTrend({ series }: { series: Record<TrendPeriod, TrendBucket[]> }) {
  const t = useTranslations("dashboard.overview.trend");
  const locale = useLocale();
  const [period, setPeriod] = useState<TrendPeriod>("3m");
  const data = series[period];
  const totals = trendTotals(data);
  const daily = isDailyPeriod(period);

  const { top, step } = niceScale(Math.max(0, ...data.map((b) => b.total)));
  const group = PLOT_W / data.length;
  const barW = Math.min(daily ? 12 : 34, group * 0.7);
  const y = (v: number) => TOP + ((top - v) / top) * PLOT_H;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => step * i);
  const label = (key: string) =>
    new Intl.DateTimeFormat(locale, daily ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" })
      .format(new Date(daily ? `${key}T12:00:00Z` : `${key}-15T12:00:00Z`));
  // Labels are counted back from the latest bucket, which is always labelled: every 5th day, or every 2nd month when there are many.
  const shown = (i: number) => { const back = data.length - 1 - i; return daily ? back % 5 === 0 : data.length <= 6 || back % 2 === 0; };
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const summary = t("chartSummary", { period: t(`period.${period}`).toLowerCase(), total: totals.total, attended: totals.attended, upcoming: totals.upcoming, lost: totals.lost });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="trend-period">{t("periodLabel")}</Label>
            <NativeSelect id="trend-period" value={period} onChange={(e) => setPeriod(e.target.value as TrendPeriod)}>
              {TREND_PERIODS.map((p) => <option key={p} value={p}>{t(`period.${p}`)}</option>)}
            </NativeSelect>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("totalsLabel")}>
          {[
            [t("total"), String(totals.total)], [t("guests"), String(totals.guests)],
            [t("attended"), String(totals.attended)], [t("lostRate"), pct(totals.lostRate)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <figure className="grid gap-2">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full text-muted-foreground">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={v === 0 ? 0.6 : 0.2} />
                <text x={LEFT - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="currentColor">{v}</text>
              </g>
            ))}
            {data.map((b, i) => {
              const x = LEFT + group * i + (group - barW) / 2;
              let acc = 0;
              return (
                <g key={b.key}>
                  {GROUPS.map((g) => {
                    const v = b[g];
                    if (!v) return null;
                    const rect = <rect key={g} x={x} y={y(acc + v)} width={barW} height={y(acc) - y(acc + v)} fill={COLORS[g]}><title>{`${label(b.key)}: ${t(g)} ${v}`}</title></rect>;
                    acc += v;
                    return rect;
                  })}
                  {shown(i) ? <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="currentColor">{label(b.key)}</text> : null}
                </g>
              );
            })}
          </svg>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
            {GROUPS.map((g) => <li key={g} className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ backgroundColor: COLORS[g] }} />{t(g)}</li>)}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t("showTable")}</summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr><th className="py-1 pr-2 font-medium">{daily ? t("day") : t("month")}</th>{GROUPS.map((g) => <th key={g} className="py-1 pr-2 text-right font-medium">{t(g)}</th>)}<th className="py-1 text-right font-medium">{t("total")}</th></tr>
                </thead>
                <tbody>
                  {data.map((b) => (
                    <tr key={b.key} className="border-t">
                      <td className="py-1 pr-2">{label(b.key)}</td>
                      {GROUPS.map((g) => <td key={g} className="py-1 pr-2 text-right tabular-nums">{b[g]}</td>)}
                      <td className="py-1 text-right tabular-nums">{b.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </figure>
      </CardContent>
    </Card>
  );
}
