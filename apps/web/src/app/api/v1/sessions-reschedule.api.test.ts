import { beforeEach, describe, expect, it } from "vitest";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { outboxEmails, resetOutbox } from "@/lib/mock/outbox-store";
import { POST } from "./sessions/[id]/reschedule/route";
import { GET as listOutbox } from "./outbox/route";

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const call = (id: string, body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctxId(id));
const GOOD = { oldStartsAt: "2026-11-09T07:00:00Z", newStartsAt: "2026-11-12T07:00:00Z", newEndsAt: "2026-11-12T09:00:00Z", reason: { code: "SCHEDULE_CHANGE" } };

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("POST /sessions/{id}/reschedule", () => {
  it("queues one email for each confirmed booking whose guest has an email, in the language of the guest", async () => {
    const res = await call("se-11", GOOD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notified: 1, withoutEmail: 1 }); // bk-9 has an email, bk-10 is a walk-in
    const mail = outboxEmails();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ type: "SESSION_RESCHEDULED", to: "emma@example.com", locale: "en", bookingCode: "SES-0011-001", newStartsAt: GOOD.newStartsAt, reason: { code: "SCHEDULE_CHANGE" } });
    expect(((await (await listOutbox()).json()) as { items: unknown[] }).items).toHaveLength(1);
  });
  it("a session without bookings, or one the server does not know, emails nobody", async () => {
    expect(await (await call("se-7", GOOD)).json()).toEqual({ notified: 0, withoutEmail: 0 });
    expect(await (await call("se-local-1", GOOD)).json()).toEqual({ notified: 0, withoutEmail: 0 });
    expect(outboxEmails()).toHaveLength(0);
  });
  it("keeps the explanation of the reason Other", async () => {
    await call("se-11", { ...GOOD, reason: { code: "OTHER", note: "The kiln broke" } });
    expect(outboxEmails()[0]).toMatchObject({ reason: { code: "OTHER", note: "The kiln broke" } });
  });
  it("refuses a missing reason, Other without a text, and bad dates", async () => {
    expect((await call("se-11", { ...GOOD, reason: { code: "" } })).status).toBe(422);
    expect((await call("se-11", { ...GOOD, reason: { code: "OTHER", note: "  " } })).status).toBe(422);
    expect((await call("se-11", { ...GOOD, newStartsAt: "nope" })).status).toBe(422);
    expect((await call("se-11", { ...GOOD, newEndsAt: GOOD.newStartsAt })).status).toBe(422);
    expect(outboxEmails()).toHaveLength(0);
  });
});
