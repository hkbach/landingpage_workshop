import { describe, expect, it } from "vitest";
import { BOOKING_CODE_RE, BOOKING_STATUSES, closedForGood, SESSION_CLOSE_REASONS, wasRescheduled, SESSION_CODE_RE, SESSION_STATUSES, closeIfEnded, isInSessionTime, isValidBookingCutoff } from "@workshop/shared";
import { reservedSeats } from "@/lib/booking-state";
import { bookings, sessions, workshops } from "./data";

// The demo sessions cover every situation of the Sessions page: if one of these cases is lost, a screen can no longer be tried out with the demo data.

const NOW = new Date();
const DAY = 86_400_000;
const shown = sessions.map((s) => closeIfEnded(s, NOW)); // what the page shows (a session whose time is over is Closed)

describe("demo sessions: well formed", () => {
  it("every id and code is unique, a code is SES-<number of the id>, and the workshop exists", () => {
    expect(new Set(sessions.map((s) => s.id)).size).toBe(sessions.length);
    expect(new Set(sessions.map((s) => s.code)).size).toBe(sessions.length);
    for (const s of sessions) {
      expect(SESSION_CODE_RE.test(s.code), s.code).toBe(true);
      expect(s.code, s.id).toBe(`SES-${s.id.slice(3).padStart(4, "0")}`);
      expect(workshops.some((w) => w.id === s.workshopId), s.id).toBe(true);
      expect(new Date(s.endsAt).getTime(), s.id).toBeGreaterThan(new Date(s.startsAt).getTime());
      expect(isValidBookingCutoff(s.bookingCutoffMinutes), s.id).toBe(true);
    }
  });
  it("no two sessions of a workshop start at the same time", () => {
    const keys = sessions.map((s) => `${s.workshopId}|${s.startsAt}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("the seats of a session are the seats of its bookings that hold seats, never more than its capacity", () => {
    for (const s of sessions) {
      expect(s.reservedCount, s.id).toBe(reservedSeats(bookings, s.id));
      expect(s.reservedCount, s.id).toBeLessThanOrEqual(s.capacity);
    }
  });
  it("the notes of a session are in order; a close or a re-schedule has its reason (a text for Other only) and happens before the session starts", () => {
    for (const s of sessions) {
      const notes = s.notes ?? [];
      expect(notes.map((n) => n.at), s.id).toEqual([...notes.map((n) => n.at)].sort());
      for (const n of notes) {
        expect(new Date(n.at).getTime(), s.id).toBeLessThan(new Date(s.startsAt).getTime());
        if (n.type === "REOPENED") expect(n.reason, s.id).toBeUndefined();
        else {
          expect(n.reason, s.id).toBeDefined();
          expect(Boolean(n.reason!.note), s.id).toBe(n.reason!.code === "OTHER");
        }
      }
    }
  });
  it("a closed session was last closed by its owner (or by the system); a session has been re-scheduled and closed at most 4 times", () => {
    for (const s of sessions) {
      expect(s.notes?.filter((n) => n.type === "RESCHEDULED").length ?? 0, s.id).toBeLessThanOrEqual(3);
      expect(s.notes?.filter((n) => n.type === "CLOSED").length ?? 0, s.id).toBeLessThanOrEqual(4);
      if (s.status === "CLOSED" && s.notes?.length) expect(s.notes[s.notes.length - 1]!.type, s.id).toBe("CLOSED");
    }
  });
  it("a session with a history of several notes (closed, re-opened, closed again) and one re-scheduled before it was closed", () => {
    expect(sessions.some((s) => (s.notes ?? []).map((n) => n.type).join() === "CLOSED,REOPENED,CLOSED")).toBe(true);
    expect(sessions.some((s) => (s.notes ?? []).map((n) => n.type).join() === "RESCHEDULED,CLOSED")).toBe(true);
  });
  it("a session that used its three re-schedules (their button is read-only)", () => {
    expect(sessions.some((s) => s.notes?.filter((n) => n.type === "RESCHEDULED").length === 3)).toBe(true);
  });
  it("a session closed for good (4 closes, in the future) to try the system administrator", () => {
    expect(sessions.some((s) => s.status === "CLOSED" && closedForGood(s) && new Date(s.startsAt) > new Date())).toBe(true);
  });
  it("a session closed by a system administrator, and one opened again by an administrator after the owner used all 4 closes", () => {
    const byAdmin = sessions.find((s) => s.status === "CLOSED" && s.notes?.at(-1)?.by === "ADMIN");
    expect(byAdmin, "closed by an administrator").toBeDefined();
    expect(byAdmin!.notes!.at(-1)).toMatchObject({ type: "CLOSED", reason: { code: "OTHER" } });
    const reopened = sessions.find((s) => s.status === "OPEN" && s.notes?.at(-1)?.type === "REOPENED" && s.notes.at(-1)!.by === "ADMIN");
    expect(reopened, "opened again by an administrator").toBeDefined();
    expect(reopened!.notes!.filter((n) => n.type === "CLOSED" && n.by !== "ADMIN")).toHaveLength(4);
  });
  it("a clone points at a session that exists, of the same workshop", () => {
    for (const s of sessions.filter((x) => x.clonedFrom)) {
      const source = sessions.find((x) => x.code === s.clonedFrom!.code);
      expect(source, s.id).toBeDefined();
      expect(source!.workshopId, s.id).toBe(s.clonedFrom!.workshopId);
    }
  });
});

describe("demo sessions: every case", () => {
  const has = (f: (s: (typeof sessions)[number]) => boolean) => sessions.some(f);
  it("every stored status", () => {
    for (const st of SESSION_STATUSES) expect(has((s) => s.status === st), st).toBe(true);
  });
  it("every status as the page shows it, and sessions closed by the system from Open, Paused and Running", () => {
    for (const st of SESSION_STATUSES) expect(shown.some((s) => s.status === st), st).toBe(true);
    for (const st of ["OPEN", "PAUSED", "RUNNING"] as const) expect(sessions.some((s) => s.status === st && shown.find((x) => x.id === s.id)!.autoClosed), st).toBe(true);
  });
  it("past, today, coming days, far ahead (inside and beyond the 60 days of the default range)", () => {
    const t = NOW.getTime();
    expect(has((s) => new Date(s.endsAt).getTime() < t - 8 * DAY)).toBe(true);
    expect(has((s) => new Date(s.endsAt).getTime() < t)).toBe(true);
    expect(has((s) => new Date(s.startsAt).getTime() > t + DAY && new Date(s.startsAt).getTime() < t + 14 * DAY)).toBe(true);
    expect(has((s) => new Date(s.startsAt).getTime() > t + 40 * DAY && new Date(s.startsAt).getTime() < t + 60 * DAY)).toBe(true);
    expect(has((s) => new Date(s.startsAt).getTime() > t + 70 * DAY)).toBe(true);
  });
  it("taking place now: Running and Paused", () => {
    expect(shown.some((s) => s.status === "RUNNING" && isInSessionTime(s, NOW))).toBe(true);
    expect(shown.some((s) => s.status === "PAUSED" && isInSessionTime(s, NOW))).toBe(true);
  });
  it("Paused and not started yet (it can be closed and re-scheduled), also one that was already re-scheduled", () => {
    expect(shown.some((s) => s.status === "PAUSED" && new Date(s.startsAt) > NOW && !wasRescheduled(s.notes))).toBe(true);
    expect(shown.some((s) => s.status === "PAUSED" && new Date(s.startsAt) > NOW && wasRescheduled(s.notes))).toBe(true);
  });
  it("inside its booking cut-off, with a cut-off of 0, and with different cut-offs", () => {
    expect(shown.some((s) => s.status === "RUNNING" && new Date(s.startsAt) > NOW && new Date(s.startsAt).getTime() - NOW.getTime() <= s.bookingCutoffMinutes * 60_000)).toBe(true);
    expect(has((s) => s.bookingCutoffMinutes === 0)).toBe(true);
    expect(new Set(sessions.map((s) => s.bookingCutoffMinutes)).size).toBeGreaterThanOrEqual(5);
  });
  it("sold out, partly booked, and without any booking", () => {
    expect(has((s) => s.status === "RUNNING" && s.reservedCount === s.capacity)).toBe(true);
    expect(has((s) => s.reservedCount > 0 && s.reservedCount < s.capacity)).toBe(true);
    expect(has((s) => s.reservedCount === 0)).toBe(true);
  });
  it("with and without a picture, a clone, and both workshops", () => {
    expect(has((s) => Boolean(s.imageUrl))).toBe(true);
    expect(has((s) => !s.imageUrl)).toBe(true);
    expect(has((s) => Boolean(s.clonedFrom))).toBe(true);
    expect(new Set(sessions.map((s) => s.workshopId)).size).toBe(2);
  });
  it("every reason of closing, and Other with its explanation", () => {
    for (const r of SESSION_CLOSE_REASONS) expect(has((s) => (s.notes ?? []).some((n) => n.type === "CLOSED" && n.reason?.code === r)), r).toBe(true);
  });
  it("several sessions on one day", () => {
    const perDay = new Map<string, number>();
    for (const s of sessions) perDay.set(s.startsAt.slice(0, 10), (perDay.get(s.startsAt.slice(0, 10)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeGreaterThanOrEqual(3);
  });
});

describe("demo bookings of the sessions", () => {
  it("every booking belongs to a session, has a code made from it, and a quantity", () => {
    expect(new Set(bookings.map((b) => b.id)).size).toBe(bookings.length);
    expect(new Set(bookings.map((b) => b.bookingCode)).size).toBe(bookings.length);
    for (const b of bookings) {
      const s = sessions.find((x) => x.id === b.sessionId);
      expect(s, b.id).toBeDefined();
      expect(BOOKING_CODE_RE.test(b.bookingCode), b.bookingCode).toBe(true);
      expect(b.bookingCode.startsWith(`${s!.code}-`), b.id).toBe(true);
      expect(b.quantity, b.id).toBeGreaterThan(0);
      expect(b.startsAt, b.id).toBe(s!.startsAt);
    }
  });
  it("every status the check-in list shows, and a cancelled booking always has its reason", () => {
    for (const st of BOOKING_STATUSES) expect(bookings.some((b) => b.status === st), st).toBe(true);
    for (const b of bookings.filter((x) => x.status === "CANCELLED")) expect(b.cancelReason, b.id).toBeTruthy();
  });
  it("a guest without an email (walk-in) and guests of different languages", () => {
    expect(bookings.some((b) => b.source === "WALK_IN")).toBe(true);
  });
  it("closed sessions with guests: one who gets an email, a walk-in without one, and one who cancelled (not emailed); also a session closed by the system", () => {
    const closedWithGuests = shown.filter((s) => s.status === "CLOSED" && bookings.some((b) => b.sessionId === s.id));
    const kinds = (s: (typeof shown)[number]) => bookings.filter((b) => b.sessionId === s.id);
    expect(closedWithGuests.some((s) => kinds(s).some((b) => b.status === "CANCELLED") && kinds(s).some((b) => b.status !== "CANCELLED"))).toBe(true);
    expect(closedWithGuests.some((s) => kinds(s).some((b) => b.source === "WALK_IN"))).toBe(true);
    expect(closedWithGuests.some((s) => s.autoClosed)).toBe(true);
    expect(closedWithGuests.some((s) => !s.autoClosed && closedForGood(s))).toBe(true);
  });
});
