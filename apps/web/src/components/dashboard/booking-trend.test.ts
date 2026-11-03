import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { bookingSeries, TREND_PERIODS, type TrendBucket, type TrendPeriod } from "@workshop/shared";
import dashboard from "../../../messages/en/dashboard.json";
import { bookingHistory, bookings } from "@/lib/mock/data";
import { BookingTrend } from "./booking-trend";

const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; timeZone: string; messages: { dashboard: typeof dashboard }; children?: ReactNode }>;
const NOW = new Date();
const points = [...bookingHistory, ...bookings.map((b) => ({ startsAt: b.startsAt, status: b.status, guests: b.quantity }))];
const series = Object.fromEntries(TREND_PERIODS.map((p) => [p, bookingSeries(points, p, NOW, "Asia/Ho_Chi_Minh")])) as Record<TrendPeriod, TrendBucket[]>;
const html = renderToStaticMarkup(createElement(Provider, { locale: "en", timeZone: "UTC", messages: { dashboard } }, createElement(BookingTrend, { series })));

describe("booking trend", () => {
  it("offers the four periods, starting with 3 months", () => {
    for (const label of ["Last month (by day)", "Last 3 months", "Last 6 months", "Last year"]) expect(html).toContain(label);
    expect(html).toMatch(/<option value="3m" selected/);
  });
  it("is an image with a text summary and a table with the same numbers", () => {
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Bookings for the last 3 months: \d+ in total/);
    expect(html).toContain("<table");
  });
  it("shows the totals of the period", () => {
    for (const k of ["Bookings", "Guests", "Attended", "Cancelled or no-show rate"]) expect(html).toContain(k);
  });
  it("draws bars only where there are bookings, split in at most three colours", () => {
    const rects = html.match(/<rect /g)?.length ?? 0;
    expect(rects).toBeGreaterThan(0);
    expect(rects).toBeLessThanOrEqual(3 * series["3m"].length);
  });
});

describe("mock booking history", () => {
  it("covers the last 12 months, with every month busy, and nothing after today", () => {
    expect(series["12m"].every((b, i, a) => b.total > 0 || i === a.length - 1)).toBe(true);
    expect(bookingHistory.every((b) => new Date(b.startsAt).getTime() < NOW.getTime())).toBe(true);
  });
  it("has the two kinds of outcome of a past booking: checked in and cancelled", () => {
    expect(new Set(bookingHistory.map((b) => b.status))).toEqual(new Set(["CHECKED_IN", "CANCELLED"]));
  });
});
