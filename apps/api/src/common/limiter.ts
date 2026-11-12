/**
 * A small in-memory rate limiter (a sliding window of timestamps per key). Enough for ONE instance of the API (REQUIREMENTS 2.2: `@nestjs/throttler` in memory); with several instances
 * the counters would have to move to the database. Old keys are dropped as new ones arrive, so the map does not grow without end.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  private recent(key: string, now: number): number[] {
    const times = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (times.length === 0) this.hits.delete(key);
    else this.hits.set(key, times);
    return times;
  }

  /** Seconds to wait before the next try, or 0 when the key is under its limit. Does not count. */
  retryAfter(key: string, now = Date.now()): number {
    const times = this.recent(key, now);
    return times.length < this.max ? 0 : Math.max(1, Math.ceil(((times[0] ?? now) + this.windowMs - now) / 1000));
  }

  /** Counts one event for the key. */
  hit(key: string, now = Date.now()): void {
    if (this.hits.size > 10_000) for (const k of [...this.hits.keys()].slice(0, 1_000)) this.recent(k, now);
    this.hits.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
