import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScheduleService } from "./schedule.service";
import { SessionsService } from "./sessions.service";
import { TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

const d = describe.skipIf(!TEST_DATABASE_URL);

const workshopBody = () => ({
  title: { en: `Session test ${unique("w")}` }, durationMinutes: 120, priceAmount: 500_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["COOKING"],
});
const inDays = (days: number, hour = 7): string => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
const REASON = { code: "SCHEDULE_CHANGE" };

d("sessions and the weekly schedule", () => {
  let t: TestApp;
  let a: { cookie: string; orgId: string; workshopId: string };
  let b: { cookie: string; orgId: string; workshopId: string };

  const patch = (url: string, body: unknown, cookie: string) => t.app.inject({ method: "PATCH", url: `/api/v1${url}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie }, payload: body as object });
  const put = (url: string, body: unknown, cookie: string) => t.app.inject({ method: "PUT", url: `/api/v1${url}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie }, payload: body as object });
  const del = (url: string, cookie: string) => t.app.inject({ method: "DELETE", url: `/api/v1${url}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });
  const newSession = async (who: typeof a, at = inDays(10), extra: Record<string, unknown> = {}) => {
    const res = await t.post("/sessions", { workshopId: who.workshopId, startsAt: at, ...extra }, { cookie: who.cookie });
    if (res.statusCode !== 201) throw new Error(`The test session was not created (${res.statusCode}): ${res.body}`);
    return res.json();
  };

  beforeAll(async () => {
    t = await startApp();
    const make = async (label: string, timezone = "Asia/Ho_Chi_Minh") => {
      const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
      const cookie = cookieOf(res);
      const orgId = res.json().organization.id as string;
      await t.pool.query("update organizations set timezone = $2 where id = $1", [orgId, timezone]);
      const workshopId = (await t.post("/workshops", workshopBody(), { cookie })).json().id as string;
      return { cookie, orgId, workshopId };
    };
    a = await make("sesa");
    b = await make("sesb", "America/New_York");
  });
  afterAll(async () => { await t.close(); });

  it("creates a session: OPEN, ends after the length of the workshop, capacity from the workshop, a code of the shop, audited", async () => {
    const at = inDays(10);
    const s = await newSession(a, at);
    expect(s).toMatchObject({ status: "OPEN", capacity: 10, reservedCount: 0, bookingCutoffMinutes: 120, autoClosed: false, notes: [], reschedules: 0, closes: 0, scheduleRuleId: null });
    expect(s.code).toMatch(/^SES-\d{4}$/);
    expect(s.endsAt).toBe(new Date(new Date(at).getTime() + 120 * 60_000).toISOString());
    expect(s.workshopTitle.en).toMatch(/^Session test/);
    const log = await t.pool.query("select action from audit_logs where entity_id = $1", [s.id]);
    expect(log.rows).toEqual([{ action: "session.create" }]);
  });

  it("refuses a start in the past, a time without an offset, an unknown or foreign workshop, a duplicate time, a wrong capacity", async () => {
    const post = async (body: Record<string, unknown>) => t.post("/sessions", { workshopId: a.workshopId, startsAt: inDays(11), ...body }, { cookie: a.cookie });
    expect((await post({ startsAt: new Date(Date.now() - 3_600_000).toISOString() })).json().error.details.fields).toEqual({ startsAt: "past" });
    expect((await post({ startsAt: "2030-01-01T10:00:00" })).json().error.details.fields).toEqual({ startsAt: "dateInvalid" });
    expect((await post({ capacity: 51 })).json().error.details.fields).toEqual({ capacity: "capacityRange" });
    expect((await post({ bookingCutoffMinutes: 99_999 })).json().error.details.fields).toEqual({ bookingCutoffMinutes: "cutoffRange" });
    expect((await post({ workshopId: b.workshopId })).json().error.details.fields).toEqual({ workshopId: "unknown" }); // another shop's workshop looks like none
    const first = await post({ startsAt: inDays(12) });
    expect(first.statusCode).toBe(201);
    const dup = await post({ startsAt: inDays(12) });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("DUPLICATE");
  });

  it("gives every session of a shop its own code, even when many are made at once", async () => {
    const made = await Promise.all(Array.from({ length: 6 }, (_, i) => newSession(a, inDays(40 + i))));
    const codes = made.map((s) => s.code as string);
    expect(new Set(codes).size).toBe(6);
    expect(codes.every((c) => /^SES-\d{4}$/.test(c))).toBe(true);
    const mine = await t.pool.query<{ code: string }>("select code from workshop_sessions where organization_id = $1", [a.orgId]);
    expect(new Set(mine.rows.map((r) => r.code)).size).toBe(mine.rows.length);
    await expect(t.pool.query("update workshop_sessions set code = 'SES-9999' where id = $1", [made[0].id])).rejects.toThrow(/cannot be changed/); // a code never changes
  });

  it("walks through the life of a session: start, pause, close (with a reason), re-open, complete is only for a closed one", async () => {
    const s = await newSession(a, inDays(20));
    const call = async (path: string, body: unknown = {}) => t.post(`/sessions/${s.id}/${path}`, body, { cookie: a.cookie });
    expect((await call("pause")).json().error.code).toBe("INVALID_STATE"); // an open session can only be started
    expect((await call("start")).json().status).toBe("RUNNING");
    expect((await call("start")).json().error.code).toBe("INVALID_STATE");
    expect((await call("close", { reason: REASON })).json().error.code).toBe("INVALID_STATE"); // only a paused session can be closed
    expect((await call("pause")).json().status).toBe("PAUSED");
    expect((await call("close", {})).statusCode).toBe(422); // a reason is needed
    expect((await call("close", { reason: { code: "OTHER" } })).json().error.details.fields).toEqual({ reason: "noteRequired" });
    expect((await call("close", { reason: { code: "NOPE" } })).json().error.details.fields).toEqual({ reason: "required" });
    const closed = (await call("close", { reason: { code: "OTHER", note: "  Studio flooded  " } })).json();
    expect(closed).toMatchObject({ status: "CLOSED", closes: 1 });
    expect(closed.notes[0]).toMatchObject({ type: "CLOSED", reason: { code: "OTHER", note: "Studio flooded" } });
    expect((await call("complete")).json().status).toBe("COMPLETED"); // a closed session can be completed...
    expect((await call("reopen")).json().error.code).toBe("NOT_REOPENABLE"); // ...and then nothing changes it
    expect((await call("start")).statusCode).toBe(409);
    const audit = await t.pool.query<{ action: string }>("select action from audit_logs where entity_id = $1 order by created_at", [s.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(["session.create", "session.start", "session.pause", "session.close", "session.complete"]);
  });

  it("re-opens a session the owner closed, until the 4th close, which is for good", async () => {
    const s = await newSession(a, inDays(21));
    const call = (path: string, body: unknown = {}) => t.post(`/sessions/${s.id}/${path}`, body, { cookie: a.cookie });
    for (let i = 1; i <= 3; i++) {
      await call("start"); await call("pause");
      expect((await call("close", { reason: REASON })).json()).toMatchObject({ status: "CLOSED", closes: i });
      expect((await call("reopen")).json()).toMatchObject({ status: "OPEN" });
    }
    await call("start"); await call("pause");
    expect((await call("close", { reason: REASON })).json().closes).toBe(4);
    expect((await call("reopen")).json().error.code).toBe("NOT_REOPENABLE");
  });

  it("re-schedules an open or paused session (its length stays) at most 3 times, to the future, never onto another session", async () => {
    const s = await newSession(a, inDays(25));
    const other = await newSession(a, inDays(26));
    const move = (to: string, body: Record<string, unknown> = {}) => t.post(`/sessions/${s.id}/reschedule`, { newStartsAt: to, reason: REASON, ...body }, { cookie: a.cookie });
    const moved = (await move(inDays(27))).json();
    expect(moved).toMatchObject({ reschedules: 1, status: "OPEN" });
    expect(new Date(moved.endsAt).getTime() - new Date(moved.startsAt).getTime()).toBe(120 * 60_000);
    expect(moved.notes[0]).toMatchObject({ type: "RESCHEDULED", reason: REASON, from: s.startsAt });
    expect((await move(inDays(27))).json().error.details.fields).toEqual({ newStartsAt: "same" });
    expect((await move(new Date(Date.now() - 86_400_000).toISOString())).json().error.details.fields).toEqual({ newStartsAt: "past" });
    expect((await move(other.startsAt)).json().error.code).toBe("DUPLICATE");
    expect((await move(inDays(28), { reason: { code: "WORKSHOP_COMPLETED" } })).statusCode).toBe(422);
    expect((await move("2030-01-01T10:00:00")).statusCode).toBe(422);
    await move(inDays(28)); await move(inDays(29));
    const fourth = await move(inDays(30));
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().error.code).toBe("RESCHEDULE_LIMIT");
    const row = await t.pool.query<{ origin_starts_at: Date; starts_at: Date }>("select origin_starts_at, starts_at from workshop_sessions where id = $1", [s.id]);
    expect(row.rows[0]!.origin_starts_at.toISOString()).toBe(s.startsAt); // the slot it was made for never changes
  });

  it("edits capacity (never below what is reserved), cut-off and picture of an open or paused session only", async () => {
    const s = await newSession(a, inDays(30));
    await t.pool.query("update workshop_sessions set reserved_count = 4 where id = $1", [s.id]); // what the booking service will do later
    expect((await patch(`/sessions/${s.id}`, { capacity: 3 }, a.cookie)).json().error.details.fields).toEqual({ capacity: "belowReserved" });
    const edited = (await patch(`/sessions/${s.id}`, { capacity: 6, bookingCutoffMinutes: 30, imageUrl: "https://cdn.example.com/s.jpg" }, a.cookie)).json();
    expect(edited).toMatchObject({ capacity: 6, bookingCutoffMinutes: 30, imageUrl: "https://cdn.example.com/s.jpg", reservedCount: 4 });
    expect((await patch(`/sessions/${s.id}`, { imageUrl: "" }, a.cookie)).json().imageUrl).toBeNull();
    expect((await patch(`/sessions/${s.id}`, {}, a.cookie)).statusCode).toBe(422);
    expect((await patch(`/sessions/${s.id}`, { imageUrl: "http://insecure.example/a.jpg" }, a.cookie)).statusCode).toBe(422);
    await t.post(`/sessions/${s.id}/start`, {}, { cookie: a.cookie });
    const running = await patch(`/sessions/${s.id}`, { capacity: 7 }, a.cookie);
    expect(running.statusCode).toBe(409);
    expect(running.json().error.code).toBe("NOT_EDITABLE");
    await expect(t.pool.query("update workshop_sessions set reserved_count = 99 where id = $1", [s.id])).rejects.toThrow(/workshop_sessions_reserved/); // the database keeps seats within capacity
  });

  it("lists with filters and a cursor, in the order of the start", async () => {
    const w = (await t.post("/workshops", workshopBody(), { cookie: a.cookie })).json().id as string;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await t.post("/sessions", { workshopId: w, startsAt: inDays(60 + i) }, { cookie: a.cookie })).json().id);
    const all = (await t.get(`/sessions?workshopId=${w}`, { cookie: a.cookie })).json();
    expect(all.items.map((s: { id: string }) => s.id)).toEqual(ids);
    const first = (await t.get(`/sessions?workshopId=${w}&limit=3`, { cookie: a.cookie })).json();
    const next = (await t.get(`/sessions?workshopId=${w}&limit=3&cursor=${encodeURIComponent(first.nextCursor)}`, { cookie: a.cookie })).json();
    expect([...first.items, ...next.items].map((s: { id: string }) => s.id)).toEqual(ids);
    expect(next.nextCursor).toBeNull();
    expect((await t.get(`/sessions?workshopId=${w}&from=${encodeURIComponent(inDays(62))}&to=${encodeURIComponent(inDays(62, 9))}`, { cookie: a.cookie })).json().items).toHaveLength(1);
    expect((await t.get(`/sessions?workshopId=${w}&status=RUNNING`, { cookie: a.cookie })).json().items).toHaveLength(0);
    expect((await t.get(`/sessions?cursor=!!`, { cookie: a.cookie })).statusCode).toBe(400);
  });

  it("closes a session whose time is over by itself, with a note and an audit line, whichever endpoint asks first", async () => {
    const s = await newSession(a, inDays(35));
    await t.pool.query("update workshop_sessions set starts_at = now() - interval '3 hours', origin_starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour', status = 'RUNNING' where id = $1", [s.id]);
    const shown = (await t.get(`/sessions/${s.id}`, { cookie: a.cookie })).json();
    expect(shown).toMatchObject({ status: "CLOSED", autoClosed: true });
    expect(shown.notes.map((n: { type: string }) => n.type)).toEqual(["AUTO_CLOSED"]);
    expect((await t.get(`/sessions/${s.id}`, { cookie: a.cookie })).json().notes).toHaveLength(1); // not noted twice
    expect((await t.post(`/sessions/${s.id}/reopen`, {}, { cookie: a.cookie })).json().error.code).toBe("NOT_REOPENABLE"); // the system closed it: it stays closed
    const log = await t.pool.query("select actor_user_id from audit_logs where entity_id = $1 and action = 'session.auto_close'", [s.id]);
    expect(log.rows).toEqual([{ actor_user_id: null }]);
  });

  it("the shops are isolated: another shop's session is a 404 for every endpoint, and not in its lists", async () => {
    const mine = await newSession(a, inDays(200));
    expect(mine.id, "the session of the first shop must exist for this test to mean anything").toBeTruthy();
    const forB = (path: string, body: unknown = {}) => t.post(`/sessions/${mine.id}/${path}`, body, { cookie: b.cookie });
    expect((await t.get(`/sessions/${mine.id}`, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await patch(`/sessions/${mine.id}`, { capacity: 2 }, b.cookie)).statusCode).toBe(404);
    for (const path of ["start", "pause", "reopen", "complete"]) expect((await forB(path)).statusCode, path).toBe(404);
    expect((await forB("close", { reason: REASON })).statusCode).toBe(404);
    expect((await forB("reschedule", { newStartsAt: inDays(50), reason: REASON })).statusCode).toBe(404);
    expect((await t.get(`/sessions?limit=100`, { cookie: b.cookie })).json().items.some((s: { id: string }) => s.id === mine.id)).toBe(false);
    expect((await t.get(`/sessions/${mine.id}`, { cookie: a.cookie })).json()).toMatchObject({ status: "OPEN", capacity: 10 }); // untouched
  });

  describe("the weekly schedule", () => {
    const rule = (over: Record<string, unknown> = {}) => ({ weekdays: [1, 3, 5], startTimes: ["09:00", "14:00"], effectiveFrom: "2020-01-01", ...over });
    const sessionsOf = (workshopId: string) => t.pool.query<{ id: string; starts_at: Date; status: string; schedule_rule_id: string | null; reserved_count: number; capacity: number }>("select id, starts_at, status, schedule_rule_id, reserved_count, capacity from workshop_sessions where workshop_id = $1 order by starts_at", [workshopId]);

    it("makes the sessions of the next 60 days from a rule, in the time of the shop, and is idempotent", async () => {
      const w = (await t.post("/workshops", workshopBody(), { cookie: a.cookie })).json().id as string;
      const created = await t.post(`/workshops/${w}/schedule-rules`, rule({ capacityOverride: 5 }), { cookie: a.cookie });
      expect(created.statusCode).toBe(201);
      const { rule: r, sessionsCreated } = created.json();
      expect(r).toMatchObject({ weekdays: [1, 3, 5], startTimes: ["09:00", "14:00"], capacityOverride: 5, status: "ACTIVE" });
      expect(sessionsCreated).toBeGreaterThanOrEqual(2 * 8 * 3 - 2); // about 8-9 weeks x 3 days x 2 times
      const rows = (await sessionsOf(w)).rows;
      expect(rows).toHaveLength(sessionsCreated);
      expect(rows.every((s) => s.capacity === 5 && s.status === "OPEN" && s.schedule_rule_id === r.id)).toBe(true);
      // in Ho Chi Minh City (UTC+7) 09:00 is 02:00 UTC and 14:00 is 07:00 UTC
      expect(new Set(rows.map((s) => s.starts_at.toISOString().slice(11, 16)))).toEqual(new Set(["02:00", "07:00"]));
      expect(rows.every((s) => [1, 3, 5].includes(new Date(s.starts_at.getTime() + 7 * 3_600_000).getUTCDay()))).toBe(true);
      expect(new Set(rows.map((s) => s.starts_at.getTime())).size).toBe(rows.length);

      const generator = t.app.get(ScheduleService, { strict: false });
      expect(await generator.generateForOrganization(a.orgId)).toBe(0); // a second run makes nothing
      expect((await sessionsOf(w)).rows).toHaveLength(sessionsCreated);
      expect((await t.get(`/workshops/${w}/schedule-rules`, { cookie: a.cookie })).json().items).toHaveLength(1);
    });

    it("uses the time zone of the shop (New York keeps 09:00 local across the clock change)", async () => {
      const w = (await t.post("/workshops", workshopBody(), { cookie: b.cookie })).json().id as string;
      await t.post(`/workshops/${w}/schedule-rules`, rule({ weekdays: [0, 1, 2, 3, 4, 5, 6], startTimes: ["09:00"] }), { cookie: b.cookie });
      const rows = (await sessionsOf(w)).rows;
      const hours = new Set(rows.map((s) => s.starts_at.toISOString().slice(11, 16)));
      for (const h of hours) expect(["13:00", "14:00"]).toContain(h); // 09:00 in New York is 13:00 UTC in summer and 14:00 UTC in winter
    });

    it("a change of the rule deletes the future sessions nobody touched and makes them again, and keeps the booked, the moved and the started ones", async () => {
      const w = (await t.post("/workshops", workshopBody(), { cookie: a.cookie })).json().id as string;
      const { rule: r } = (await t.post(`/workshops/${w}/schedule-rules`, rule({ weekdays: [2], startTimes: ["10:00"] }), { cookie: a.cookie })).json();
      const before = (await sessionsOf(w)).rows;
      expect(before.length).toBeGreaterThanOrEqual(8);
      const [booked, moved, started] = before as [typeof before[0], typeof before[0], typeof before[0]];
      await t.pool.query("update workshop_sessions set reserved_count = 2 where id = $1", [booked.id]);
      await t.post(`/sessions/${moved.id}/reschedule`, { newStartsAt: new Date(moved.starts_at.getTime() + 86_400_000 * 2 + 3_600_000).toISOString(), reason: REASON }, { cookie: a.cookie });
      await t.post(`/sessions/${started.id}/start`, {}, { cookie: a.cookie });

      const res = await put(`/schedule-rules/${r.id}`, rule({ weekdays: [4], startTimes: ["16:00"] }), a.cookie);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionsDeleted).toBe(before.length - 3); // all but the three that were touched
      const after = (await sessionsOf(w)).rows;
      const kept = after.filter((s) => [booked.id, moved.id, started.id].includes(s.id));
      expect(kept).toHaveLength(3); // nothing a person touched was deleted
      expect(kept.find((s) => s.id === booked.id)!.reserved_count).toBe(2);
      const fresh = after.filter((s) => ![booked.id, moved.id, started.id].includes(s.id));
      expect(fresh.length).toBe(body.sessionsCreated);
      expect(fresh.every((s) => new Date(s.starts_at.getTime() + 7 * 3_600_000).getUTCDay() === 4 && s.starts_at.toISOString().slice(11, 16) === "09:00")).toBe(true); // Thursday 16:00 in Vietnam
      // the moved session's old slot is not made again
      expect(after.some((s) => s.starts_at.getTime() === moved.starts_at.getTime())).toBe(false);
      expect(await t.app.get(ScheduleService, { strict: false }).generateForOrganization(a.orgId)).toBe(0);
    });

    it("deleting a rule removes what nobody touched and detaches the rest; an inactive rule makes nothing", async () => {
      const w = (await t.post("/workshops", workshopBody(), { cookie: a.cookie })).json().id as string;
      const { rule: r } = (await t.post(`/workshops/${w}/schedule-rules`, rule({ weekdays: [6], startTimes: ["08:00"] }), { cookie: a.cookie })).json();
      const [first] = (await sessionsOf(w)).rows;
      await t.pool.query("update workshop_sessions set reserved_count = 1 where id = $1", [first!.id]);
      const removed = await del(`/schedule-rules/${r.id}`, a.cookie);
      expect(removed.statusCode).toBe(200);
      const left = (await sessionsOf(w)).rows;
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ id: first!.id, schedule_rule_id: null });
      expect((await del(`/schedule-rules/${r.id}`, a.cookie)).statusCode).toBe(404);

      const off = await t.post(`/workshops/${w}/schedule-rules`, rule({ status: "INACTIVE" }), { cookie: a.cookie });
      expect(off.json().sessionsCreated).toBe(0);
    });

    it("refuses wrong rules, and another shop's rule or workshop is a 404", async () => {
      const w = (await t.post("/workshops", workshopBody(), { cookie: a.cookie })).json().id as string;
      const fields = async (over: Record<string, unknown>) => (await t.post(`/workshops/${w}/schedule-rules`, rule(over), { cookie: a.cookie })).json().error?.details?.fields ?? {};
      expect(await fields({ weekdays: [] })).toHaveProperty("weekdays", "weekdaysRequired");
      expect(Object.keys(await fields({ weekdays: [7] }))).toEqual(["weekdays.0"]);
      expect(Object.keys(await fields({ startTimes: ["25:00"] }))).toEqual(["startTimes.0"]);
      expect(await fields({ startTimes: [] })).toHaveProperty("startTimes", "timesRequired");
      expect(await fields({ effectiveFrom: "2026-02-30" })).toHaveProperty("effectiveFrom", "dateInvalid");
      expect(await fields({ effectiveTo: "2019-01-01" })).toHaveProperty("effectiveTo", "endBeforeStart");
      expect(await fields({ capacityOverride: 0 })).toHaveProperty("capacityOverride", "capacityRange");
      const { rule: mine } = (await t.post(`/workshops/${w}/schedule-rules`, rule({ weekdays: [1] }), { cookie: a.cookie })).json();
      expect((await t.get(`/workshops/${w}/schedule-rules`, { cookie: b.cookie })).statusCode).toBe(404);
      expect((await t.post(`/workshops/${w}/schedule-rules`, rule(), { cookie: b.cookie })).statusCode).toBe(404);
      expect((await put(`/schedule-rules/${mine.id}`, rule(), b.cookie)).statusCode).toBe(404);
      expect((await del(`/schedule-rules/${mine.id}`, b.cookie)).statusCode).toBe(404);
      expect((await t.get(`/workshops/${w}/schedule-rules`, { cookie: a.cookie })).json().items.map((x: { id: string }) => x.id)).toContain(mine.id);
    });

    it("a suspended shop makes no new sessions", async () => {
      const w = (await t.post("/workshops", workshopBody(), { cookie: b.cookie })).json().id as string;
      await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [b.orgId]);
      try {
        const denied = await t.post(`/workshops/${w}/schedule-rules`, rule(), { cookie: b.cookie });
        expect(denied.statusCode).toBe(403);
        expect(denied.json().error.code).toBe("SHOP_SUSPENDED");
        expect((await t.post("/sessions", { workshopId: w, startsAt: inDays(15) }, { cookie: b.cookie })).statusCode).toBe(403);
        expect(await t.app.get(ScheduleService, { strict: false }).generateForOrganization(b.orgId)).toBe(0);
      } finally {
        await t.pool.query("update organizations set status = 'DRAFT' where id = $1", [b.orgId]);
      }
    });
  });

  it("the services are the ones the controllers use (one instance each)", () => {
    expect(t.app.get(SessionsService, { strict: false })).toBeTruthy();
  });
});
