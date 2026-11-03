import { beforeEach, describe, expect, it } from "vitest";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { outboxEmails, resetOutbox, type SessionClosedEmail } from "@/lib/mock/outbox-store";
import { POST as closed } from "./sessions/[id]/closed/route";
import { POST as reschedule } from "./sessions/[id]/reschedule/route";

// "The workshop has been completed" is a reason to close a session (its guests are told so), and not a reason to re-schedule one.

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const dates = { startsAt: "2026-11-09T07:00:00Z", endsAt: "2026-11-09T09:00:00Z" };

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("closing a session because the workshop has been completed", () => {
  it("is accepted with no explanation, and the guests are emailed with that reason", async () => {
    const res = await closed(json({ ...dates, reason: { code: "WORKSHOP_COMPLETED" } }), ctxId("se-3"));
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
    await closed(json({ ...dates, reason: { code: "WORKSHOP_COMPLETED", note: "  extra  " } }), ctxId("se-3"));
    expect((outboxEmails()[0] as SessionClosedEmail).reason).toEqual({ code: "WORKSHOP_COMPLETED" });
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
