import { beforeEach, describe, expect, it } from "vitest";
import { resetBookingStore, setBookingStatus } from "@/lib/mock/booking-store";
import { bookings, sessions } from "@/lib/mock/data";
import { outboxEmails, resetOutbox } from "@/lib/mock/outbox-store";
import { resetSessionAdminStore } from "@/lib/mock/session-admin-store";
import { resetAutoClosed } from "@/lib/mock/session-mail";
import { POST as closed } from "./sessions/[id]/closed/route";
import { POST as autoClosed } from "./sessions/auto-closed/route";
import { POST as reschedule } from "./sessions/[id]/reschedule/route";
import { POST as adminChange } from "./admin/sessions/[id]/route";

// Every guest who booked a session is emailed when it is closed (by the owner, an administrator or the system) or re-scheduled, except the guests
// who cancelled their booking before.

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const dates = { startsAt: "2026-11-09T07:00:00Z", endsAt: "2026-11-09T09:00:00Z" };
const REASON = { code: "VENUE_ISSUE" };

/** Booking codes of a session that are not cancelled in the mock data. */
const live = (sessionId: string) => bookings.filter((b) => b.sessionId === sessionId && b.status !== "CANCELLED").map((b) => b.bookingCode).sort();
const sentTo = (type: string) => outboxEmails().filter((e) => e.type === type).flatMap((e) => ("bookingCode" in e ? [e.bookingCode] : [])).sort();

beforeEach(() => { resetBookingStore(); resetOutbox(); resetSessionAdminStore(); resetAutoClosed(); });

describe("POST /sessions/{id}/closed", () => {
  it("emails the guests who did not cancel, and not the one who cancelled", async () => {
    const cancelled = bookings.find((b) => b.sessionId === "se-3" && b.status === "CANCELLED")!;
    const res = await closed(json({ ...dates, reason: REASON }), ctxId("se-3"));
    expect(res.status).toBe(200);
    const codes = sentTo("SESSION_CLOSED");
    expect(codes).not.toContain(cancelled.bookingCode);
    expect(codes.every((c) => live("se-3").includes(c))).toBe(true);
    expect(codes.length).toBeGreaterThan(0);
    expect(outboxEmails()[0]).toMatchObject({ type: "SESSION_CLOSED", auto: false, reason: REASON, startsAt: dates.startsAt });
  });
  it("a guest who cancels after the booking is not emailed, a guest who checked in is", async () => {
    const [first] = bookings.filter((b) => b.sessionId === "se-11");
    setBookingStatus(first!.id, "CANCELLED", "Changed plans");
    await closed(json({ ...dates, reason: REASON }), ctxId("se-11"));
    expect(sentTo("SESSION_CLOSED")).not.toContain(first!.bookingCode);
    resetOutbox();
    resetBookingStore();
    setBookingStatus(first!.id, "CHECKED_IN");
    await closed(json({ ...dates, reason: REASON }), ctxId("se-11"));
    expect(sentTo("SESSION_CLOSED")).toContain(first!.bookingCode);
  });
  it("needs a reason", async () => {
    expect((await closed(json({ ...dates, reason: { code: "" } }), ctxId("se-3"))).status).toBe(422);
    expect((await closed(json({ ...dates, reason: { code: "OTHER", note: " " } }), ctxId("se-3"))).status).toBe(422);
    expect(outboxEmails()).toHaveLength(0);
  });
  it("a session without bookings emails nobody", async () => {
    expect(await (await closed(json({ ...dates, reason: REASON }), ctxId("se-7"))).json()).toEqual({ notified: 0, withoutEmail: 0 });
  });
});

describe("POST /sessions/auto-closed", () => {
  const ended = (id: string) => ({ id, startsAt: "2020-01-01T07:00:00Z", endsAt: "2020-01-01T09:00:00Z" });
  it("emails the guests once, as an automatic close without a reason", async () => {
    // Sessions that ended before the first check are taken as handled, so use a session the server does not count as ended yet.
    resetAutoClosed(new Date("2000-01-01T00:00:00Z"));
    const first = (await (await autoClosed(json({ sessions: [ended("se-3")] }))).json()) as { mailed: { id: string; notified: number }[] };
    expect(first.mailed).toHaveLength(1);
    expect(outboxEmails()[0]).toMatchObject({ type: "SESSION_CLOSED", auto: true });
    expect("reason" in outboxEmails()[0]!).toBe(false);
    expect(sentTo("SESSION_CLOSED").every((c) => live("se-3").includes(c))).toBe(true);
    const again = (await (await autoClosed(json({ sessions: [ended("se-3")] }))).json()) as { mailed: unknown[] };
    expect(again.mailed).toHaveLength(0);
    expect(outboxEmails().length).toBe(first.mailed[0]!.notified);
  });
  it("does not email again the sessions that ended before the server started checking", async () => {
    const past = sessions.find((s) => Date.parse(s.endsAt) < Date.now())!;
    resetAutoClosed();
    await autoClosed(json({ sessions: [{ id: past.id, startsAt: past.startsAt, endsAt: past.endsAt }] }));
    expect(outboxEmails()).toHaveLength(0);
  });
  it("ignores a session that has not ended", async () => {
    resetAutoClosed(new Date("2000-01-01T00:00:00Z"));
    const future = { id: "se-3", startsAt: "2999-01-01T07:00:00Z", endsAt: "2999-01-01T09:00:00Z" };
    expect(((await (await autoClosed(json({ sessions: [future] }))).json()) as { mailed: unknown[] }).mailed).toHaveLength(0);
  });
});

describe("a close by an administrator", () => {
  it("emails the guests too, except the one who cancelled", async () => {
    const target = sessions.find((s) => s.status !== "CLOSED" && Date.parse(s.endsAt) > Date.now() && live(s.id).length > 0)!;
    const res = await adminChange(json({ action: "close", reason: "Fraud report" }), ctxId(target.id));
    expect(res.status).toBe(200);
    expect(sentTo("SESSION_CLOSED")).toEqual(live(target.id).filter((c) => outboxEmails().some((e) => "bookingCode" in e && e.bookingCode === c)));
    expect(outboxEmails()[0]).toMatchObject({ auto: false, reason: { code: "OTHER", note: "Fraud report" } });
  });
});

describe("re-schedule emails", () => {
  it("reach every guest who did not cancel, not only the confirmed ones", async () => {
    const [b] = bookings.filter((x) => x.sessionId === "se-11" && x.status === "CONFIRMED");
    setBookingStatus(b!.id, "CHECKED_IN");
    await reschedule(json({ oldStartsAt: dates.startsAt, newStartsAt: "2026-11-12T07:00:00Z", newEndsAt: "2026-11-12T09:00:00Z", reason: REASON }), ctxId("se-11"));
    expect(sentTo("SESSION_RESCHEDULED")).toContain(b!.bookingCode);
  });
});
