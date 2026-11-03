import { addDaysToKey, isDayKey, MAX_RANGE_DAYS } from "@workshop/shared";

export interface DayBounds { min: string | undefined; max: string }

/**
 * The days the two date pickers of the Income page offer (the others are greyed out, like the future): never after today, From never after To
 * and To never before From, and the two never more than MAX_RANGE_DAYS apart. A day that is not set (or not a real date) sets no limit.
 */
export function dateBounds(from: string, to: string, today: string): { from: DayBounds; to: DayBounds } {
  const end = isDayKey(to) ? to : null;
  const start = isDayKey(from) ? from : null;
  const latestTo = start ? addDaysToKey(start, MAX_RANGE_DAYS - 1) : null;
  return {
    from: { min: end ? addDaysToKey(end, -(MAX_RANGE_DAYS - 1)) : undefined, max: end && end < today ? end : today },
    to: { min: start ?? undefined, max: latestTo && latestTo < today ? latestTo : today },
  };
}
