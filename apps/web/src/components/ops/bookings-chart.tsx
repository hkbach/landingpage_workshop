"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { niceScale } from "@workshop/shared";
import { Card, CardContent } from "@/components/ui/card";
import { seriesFor, totalsOf, type DayStat, type Granularity } from "@/lib/bookings-chart";
import { cn } from "@/lib/utils";

// A small stacked bar chart (plain SVG, no library). Two views of the same bookings: by what became of them (checked in, still to come, cancelled) or by
// payment status (paid, unpaid). The legend names every colour and the stack order never changes, so colour is never the only cue; each bar has a tooltip.
const VIEWS = {
  booking: { groups: ["attended", "upcoming", "lost"], colors: ["#2563eb", "#14b8a6", "#f97316"] },
  payment: { groups: ["paid", "unpaid"], colors: ["#16a34a", "#94a3b8"] },
} as const;
type View = keyof typeof VIEWS;

const W = 720, H = 150, LEFT = 30, RIGHT = 6, TOP = 8, BOTTOM = 22;
const PLOT_W = W - LEFT - RIGHT, PLOT_H = H - TOP - BOTTOM;

/** The bookings over the range From - To (the day of their session), drawn by day, week or month depending on how long the range is. */
export function BookingsChart({ days, from, to }: { days: readonly DayStat[]; from: string; to: string }) {
  const t = useTranslations("ops.bookings.chart");
  const locale = useLocale();
  const [view, setView] = useState<View>("booking");
  const { granularity, buckets } = seriesFor(days, from, to);
  const totals = totalsOf(buckets);
  const { groups, colors } = VIEWS[view];

  const { top, step } = niceScale(Math.max(0, ...buckets.map((b) => b.total)));
  const slot = PLOT_W / buckets.length;
  const barW = Math.min(granularity === "day" ? 16 : 36, slot * 0.7);
  const y = (v: number) => TOP + ((top - v) / top) * PLOT_H;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => step * i);
  const fmt = (key: string, g: Granularity) =>
    new Intl.DateTimeFormat(locale, g === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(g === "month" ? `${key}-15T12:00:00Z` : `${key}T12:00:00Z`));
  // About eight labels, always counted back from the last bar.
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  const shown = (i: number) => (buckets.length - 1 - i) % every === 0;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const chips: [string, string][] = [
    [t("bookings"), String(totals.total)], [t("guests"), String(totals.guests)],
    [view === "booking" ? t("attended") : t("paidRate"), view === "booking" ? String(totals.attended) : pct(totals.paidRate)],
    [view === "booking" ? t("lostRate") : t("unpaid"), view === "booking" ? pct(totals.lostRate) : String(totals.unpaid)],
  ];

  return (
    <Card size="sm" className="overflow-hidden" data-testid="bookings-chart">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <span className="text-xs text-muted-foreground" data-testid="chart-unit">{t(`unit.${granularity}`)}</span>
        </div>
        <div role="group" aria-label={t("viewLabel")} className="inline-flex rounded-lg border bg-background p-0.5 text-xs">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button
              key={v} type="button" aria-pressed={view === v} data-testid={`chart-view-${v}`} onClick={() => setView(v)}
              className={cn("rounded-md px-2.5 py-1 font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring/60", view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      </div>
      <CardContent className="grid gap-2">
        <dl className="flex flex-wrap gap-2" aria-label={t("totalsLabel")}>
          {chips.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5 rounded-full border bg-muted/40 px-2.5 py-0.5">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {totals.total === 0 ? (
          <p role="status" data-testid="chart-empty" className="grid h-24 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <figure className="grid gap-1.5">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("summary", { total: totals.total, guests: totals.guests, from: fmt(buckets[0]!.key, granularity), to: fmt(buckets.at(-1)!.key, granularity) })} className="h-auto max-h-44 w-full text-muted-foreground">
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={v === 0 ? 0.5 : 0.18} strokeDasharray={v === 0 ? undefined : "3 4"} />
                  <text x={LEFT - 5} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="currentColor">{v}</text>
                </g>
              ))}
              {buckets.map((b, i) => {
                const x = LEFT + slot * i + (slot - barW) / 2;
                let acc = 0;
                return (
                  <g key={b.key}>
                    {groups.map((g, gi) => {
                      const v = b[g];
                      if (!v) return null;
                      const rect = (
                        <rect key={g} x={x} y={y(acc + v)} width={barW} height={y(acc) - y(acc + v)} fill={colors[gi]} rx={2}>
                          <title>{`${fmt(b.key, granularity)}: ${t(g)} ${v}`}</title>
                        </rect>
                      );
                      acc += v;
                      return rect;
                    })}
                    {shown(i) ? <text x={x + barW / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="currentColor">{fmt(b.key, granularity)}</text> : null}
                  </g>
                );
              })}
            </svg>
            <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground" aria-hidden="true">
              {groups.map((g, gi) => (
                <li key={g} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: colors[gi] }} />{t(g)} <span className="font-medium text-foreground tabular-nums">{totals[g]}</span></li>
              ))}
            </ul>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}
