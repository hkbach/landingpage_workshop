// Time zones without a library: the shop thinks in its own time ("every Saturday at 09:00 in Ho Chi Minh City"), the database holds UTC. Everything here uses Intl, which carries the
// real rules of every zone (daylight saving included).

export interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock of a zone at an instant. */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: WEEKDAYS[p.weekday ?? ""] ?? 0 };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of the wall clock of a zone at an instant (today in the shop). */
export function dateIn(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** A calendar date moved by whole days ("2026-11-30" + 1 = "2026-12-01"); no time zone is involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday of a calendar date. */
export const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** True for a real calendar date written "YYYY-MM-DD" (not "2026-02-30"). */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/**
 * The instant at which the wall clock of `timeZone` shows `date` and `time` ("HH:mm"). A time that does not exist (the hour skipped when the clocks go forward) gives null; a time that
 * happens twice (the hour repeated when the clocks go back) gives the first one.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number): number => {
    const p = localParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000;
  };
  // The offset a day before and a day after bracket the change (if any): try both, keep the instants whose wall clock is the one asked for.
  const candidates = new Set([guess - offsetAt(guess - 86_400_000), guess - offsetAt(guess + 86_400_000), guess - offsetAt(guess)]);
  const valid = [...candidates].filter((c) => {
    const p = localParts(new Date(c), timeZone);
    return p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi;
  });
  return valid.length ? new Date(Math.min(...valid)) : null;
}

export interface RuleLike { weekdays: readonly number[]; startTimes: readonly string[]; effectiveFrom: string; effectiveTo: string | null }

/**
 * The starts of a rule between `fromDate` and `fromDate + days` (the days of the shop, both inclusive of the first), later than `now`, in order, without duplicates. A start in the hour
 * that does not exist is skipped.
 */
export function ruleStarts(rule: RuleLike, timeZone: string, now: Date, days = 60): Date[] {
  const today = dateIn(now, timeZone);
  const out = new Map<number, Date>();
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    if (date < rule.effectiveFrom || (rule.effectiveTo !== null && date > rule.effectiveTo) || !rule.weekdays.includes(weekdayOf(date))) continue;
    for (const time of rule.startTimes) {
      const at = zonedToUtc(date, time, timeZone);
      if (at && at.getTime() > now.getTime()) out.set(at.getTime(), at);
    }
  }
  return [...out.values()].sort((a, b) => a.getTime() - b.getTime());
}
