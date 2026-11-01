import { minorDigits, niceScale, type CategoryShare, type MonthPoint } from "@workshop/shared";

// Charts are drawn with plain SVG / CSS: no chart library (a new dependency needs approval). Colours: blue for income, orange for
// expenses (distinguishable without relying on hue alone: the legend names them, bars sit in a fixed order, the net result is a
// dark line with markers). Every chart has a text alternative.
export const INCOME_COLOR = "#1d4ed8";
export const EXPENSE_COLOR = "#c2410c";
const NET_COLOR = "#1f2937";

const W = 640, H = 280, LEFT = 60, RIGHT = 10, TOP = 14, BOTTOM = 34;
const PLOT_W = W - LEFT - RIGHT, PLOT_H = H - TOP - BOTTOM;

export function compactMoney(minor: number, currency: string, locale: string): string {
  const major = minor / 10 ** minorDigits(currency);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(major);
}

export interface MonthlyChartLabels {
  title: string; income: string; expense: string; net: string; month: string; summary: string;
  format: (minor: number) => string; monthLabel: (key: string) => string;
}

/** Income and expenses per month as grouped bars, with the net result as a line. */
export function MonthlyChart({ series, currency, locale, labels }: { series: MonthPoint[]; currency: string; locale: string; labels: MonthlyChartLabels }) {
  const peak = Math.max(0, ...series.flatMap((p) => [p.income, p.expense]));
  const minNet = Math.min(0, ...series.map((p) => p.net));
  const { top, bottom, step } = niceScale(peak, minNet);
  const range = top - bottom;
  const y = (v: number) => TOP + ((top - v) / range) * PLOT_H;
  const group = PLOT_W / Math.max(series.length, 1);
  const barW = Math.min(26, group * 0.3);
  const ticks = Array.from({ length: Math.round(range / step) + 1 }, (_, i) => bottom + step * i);
  const cx = (i: number) => LEFT + group * i + group / 2;
  const net = series.map((p, i) => `${cx(i)},${y(p.net)}`).join(" ");

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.summary} className="h-auto w-full text-muted-foreground">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.6 : 0.2} />
            <text x={LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="currentColor">{compactMoney(t, currency, locale)}</text>
          </g>
        ))}
        {series.map((p, i) => (
          <g key={p.key}>
            <rect x={cx(i) - barW - 1} y={Math.min(y(p.income), y(0))} width={barW} height={Math.abs(y(p.income) - y(0))} fill={INCOME_COLOR} rx="2">
              <title>{`${labels.monthLabel(p.key)}: ${labels.income} ${labels.format(p.income)}`}</title>
            </rect>
            <rect x={cx(i) + 1} y={Math.min(y(p.expense), y(0))} width={barW} height={Math.abs(y(p.expense) - y(0))} fill={EXPENSE_COLOR} rx="2">
              <title>{`${labels.monthLabel(p.key)}: ${labels.expense} ${labels.format(p.expense)}`}</title>
            </rect>
            <text x={cx(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="currentColor">{labels.monthLabel(p.key)}</text>
          </g>
        ))}
        <polyline points={net} fill="none" stroke={NET_COLOR} strokeWidth="2" strokeLinejoin="round" />
        {series.map((p, i) => (
          <circle key={p.key} cx={cx(i)} cy={y(p.net)} r="3.5" fill="#fff" stroke={NET_COLOR} strokeWidth="2">
            <title>{`${labels.monthLabel(p.key)}: ${labels.net} ${labels.format(p.net)}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />{labels.income}</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />{labels.expense}</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ backgroundColor: NET_COLOR }} />{labels.net}</li>
      </ul>
      {/* The same numbers as text, for screen readers and for anyone who wants exact values. */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">{labels.title}</summary>
        <table className="mt-2 w-full text-left text-sm">
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

/** Share of each category as horizontal bars with the amount and the percentage written next to them. */
export function CategoryBars({ items, color, label, format, percent }: {
  items: CategoryShare[]; color: string; label: (c: CategoryShare["category"]) => string; format: (minor: number) => string; percent: (share: number) => string;
}) {
  return (
    <ul className="grid gap-3">
      {items.map((c) => (
        <li key={c.category} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{label(c.category)}</span>
            <span className="tabular-nums"><strong className="font-medium">{format(c.amount)}</strong> <span className="text-muted-foreground">· {percent(c.share)}</span></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.max(c.share * 100, 1)}%`, backgroundColor: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
