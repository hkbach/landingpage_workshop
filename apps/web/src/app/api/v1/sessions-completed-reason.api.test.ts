import { beforeEach, describe, expect, it } from "vitest";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { outboxEmails, resetOutbox, type SessionClosedEmail } from "@/lib/mock/outbox-store";
import { POST as closed } from "./sessions/[id]/closed/route";
import { POST as reschedule } from "./sessions/[id]/reschedule/route";

// "The workshop has been completed" closes a session that is taking place (early); before it starts a session is closed for the other reasons. It is never a
// reason to re-schedule a session.

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const HOUR = 3_600_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
/** A session that is taking place now, and one that starts in two days. */
const taking = { startsAt: iso(-HOUR), endsAt: iso(HOUR) };
const later = { startsAt: iso(48 * HOUR), endsAt: iso(50 * HOUR) };

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("closing a session early because the workshop has been completed", () => {
  it("is accepted while the session is taking place, with no explanation, and the guests are emailed with that reason", async () => {
    const res = await closed(json({ ...taking, reason: { code: "WORKSHOP_COMPLETED" } }), ctxId("se-3"));
    expect(res.status).toBe(200);
    const mail = outboxEmails().filter((e): e is SessionClosedEmail => e.type === "SESSION_CLOSED");
    expect(mail.length).toBeGreaterThan(0);
    for (const m of mail) {
      expect(m.reason).toEqual({ code: "WORKSHOP_COMPLETED" });
      expect(m.auto).toBe(false);
      expect(m.html).toContain("the workshop has been completed. Thank you for joining us!");
      expect(m.html).not.toContain("It will not take place.");
    }
  });
  it("an explanation that is sent is not kept", async () => {
    await closed(json({ ...taking, reason: { code: "WORKSHOP_COMPLETED", note: "  extra  " } }), ctxId("se-3"));
    expect((outboxEmails()[0] as SessionClosedEmail).reason).toEqual({ code: "WORKSHOP_COMPLETED" });
  });
  it("is refused before the session starts", async () => {
    const res = await closed(json({ ...later, reason: { code: "WORKSHOP_COMPLETED" } }), ctxId("se-3"));
    expect(res.status).toBe(422);
    expect(outboxEmails()).toHaveLength(0);
  });
  it("while the session is taking place the other reasons are refused", async () => {
    for (const code of ["VENUE_ISSUE", "NOT_ENOUGH_GUESTS", "OTHER"]) {
      const res = await closed(json({ ...taking, reason: { code, note: "text" } }), ctxId("se-3"));
      expect(res.status, code).toBe(422);
    }
    expect(outboxEmails()).toHaveLength(0);
  });
  it("before it starts the other reasons are accepted", async () => {
    expect((await closed(json({ ...later, reason: { code: "VENUE_ISSUE" } }), ctxId("se-3"))).status).toBe(200);
  });
});

describe("re-scheduling a session", () => {
  const GOOD = { oldStartsAt: "2026-11-09T07:00:00Z", newStartsAt: "2026-11-12T07:00:00Z", newEndsAt: "2026-11-12T09:00:00Z" };
  it("does not take the workshop has been completed as a reason", async () => {
    const res = await reschedule(json({ ...GOOD, reason: { code: "WORKSHOP_COMPLETED" } }), ctxId("se-11"));
    expect(res.status).toBe(422);
    expect(outboxEmails()).toHaveLength(0);
  });
  it("still takes the other reasons", async () => {
    const res = await reschedule(json({ ...GOOD, reason: { code: "VENUE_ISSUE" } }), ctxId("se-11"));
    expect(res.status).toBe(200);
  });
});
