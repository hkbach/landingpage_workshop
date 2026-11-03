import { minorDigits, niceScale, type MonthPoint } from "@workshop/shared";

// Charts are drawn with plain SVG / CSS: no chart library (a new dependency needs approval). Colours: blue for income, orange for
// the fees (`expense` in the data: maintenance and service fee), a dark thin line for the profit. They stay distinguishable without
// relying on hue alone: the legend names them, the bars sit in a fixed order and the profit has markers. Every chart has a text alternative.
export const INCOME_COLOR = "#2563eb";
export const EXPENSE_COLOR = "#f97316";
const NET_COLOR = "#0f172a";

// A small, light chart: slim bars, a hairline grid and a thin profit line.
const W = 560, H = 220, LEFT = 44, RIGHT = 8, TOP = 10, BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT, PLOT_H = H - TOP - BOTTOM;

export function compactMoney(minor: number, currency: string, locale: string): string {
  const major = minor / 10 ** minorDigits(currency);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(major);
}

export interface MonthlyChartLabels {
  title: string; income: string; expense: string; net: string; month: string; summary: string;
  format: (minor: number) => string; monthLabel: (key: string) => string;
}

/** Income and fees per month as slim grouped bars, with the profit as a thin line. */
export function MonthlyChart({ series, currency, locale, labels }: { series: MonthPoint[]; currency: string; locale: string; labels: MonthlyChartLabels }) {
  const peak = Math.max(0, ...series.flatMap((p) => [p.income, p.expense]));
  const minNet = Math.min(0, ...series.map((p) => p.net));
  const { top, bottom, step } = niceScale(peak, minNet);
  const range = top - bottom;
  const y = (v: number) => TOP + ((top - v) / range) * PLOT_H;
  const group = PLOT_W / Math.max(series.length, 1);
  const barW = Math.min(9, group * 0.22);
  const ticks = Array.from({ length: Math.round(range / step) + 1 }, (_, i) => bottom + step * i);
  const cx = (i: number) => LEFT + group * i + group / 2;
  const net = series.map((p, i) => `${cx(i)},${y(p.net)}`).join(" ");
  // A bar grows from the zero line; a value of 0 keeps a hairline so the month is not empty.
  const bar = (v: number) => ({ y: Math.min(y(v), y(0)), h: Math.max(Math.abs(y(v) - y(0)), v === 0 ? 0 : 1) });

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.summary} className="mx-auto h-auto w-full max-w-xl text-muted-foreground">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.45 : 0.14} strokeWidth="1" strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="currentColor">{compactMoney(t, currency, locale)}</text>
          </g>
        ))}
        {series.map((p, i) => {
          const inc = bar(p.income), fee = bar(p.expense);
          return (
            <g key={p.key}>
              <rect x={cx(i) - barW - 1} y={inc.y} width={barW} height={inc.h} fill={INCOME_COLOR} rx={barW / 2.5}>
                <title>{`${labels.monthLabel(p.key)}: ${labels.income} ${labels.format(p.income)}`}</title>
              </rect>
              <rect x={cx(i) + 1} y={fee.y} width={barW} height={fee.h} fill={EXPENSE_COLOR} rx={barW / 2.5}>
                <title>{`${labels.monthLabel(p.key)}: ${labels.expense} ${labels.format(p.expense)}`}</title>
              </rect>
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="currentColor">{labels.monthLabel(p.key)}</text>
            </g>
          );
        })}
        <polyline points={net} fill="none" stroke={NET_COLOR} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => (
          <circle key={p.key} cx={cx(i)} cy={y(p.net)} r="2.5" fill="#fff" stroke={NET_COLOR} strokeWidth="1.5">
            <title>{`${labels.monthLabel(p.key)}: ${labels.net} ${labels.format(p.net)}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />{labels.income}</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />{labels.expense}</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-px w-4" style={{ backgroundColor: NET_COLOR }} />{labels.net}</li>
      </ul>
      {/* The same numbers as text, for screen readers and for anyone who wants exact values. */}
      <details className="mx-auto w-full max-w-xl text-sm">
        <summary className="cursor-pointer text-center text-xs text-muted-foreground">{labels.title}</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead><tr><th className="py-1 pr-2 font-medium">{labels.month}</th><th className="py-1 pr-2 text-right font-medium">{labels.income}</th><th className="py-1 pr-2 text-right font-medium">{labels.expense}</th><th className="py-1 text-right font-medium">{labels.net}</th></tr></thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.key} className="border-t">
                <td className="py-1 pr-2">{labels.monthLabel(p.key)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{labels.format(p.income)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{labels.format(p.expense)}</td>
                <td className="py-1 text-right tabular-nums">{labels.format(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Share of each category as slim horizontal bars with the amount and the percentage written next to them. */
export function CategoryBars<K extends string>({ items, color, label, format, percent }: {
  items: { category: K; amount: number; share: number }[]; color: string; label: (c: K) => string; format: (minor: number) => string; percent: (share: number) => string;
}) {
  return (
    <ul className="mx-auto grid max-w-xl gap-3">
      {items.map((c) => (
        <li key={c.category} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{label(c.category)}</span>
            <span className="tabular-nums"><strong className="font-medium">{format(c.amount)}</strong> <span className="text-muted-foreground">· {percent(c.share)}</span></span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.max(c.share * 100, 1)}%`, backgroundColor: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
