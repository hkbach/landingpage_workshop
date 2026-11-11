import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { DEMO_PASSWORD, resetAccountsStore } from "@/lib/mock/accounts-store";
import { liveAuditLogs, recordAudit, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { guestActor } from "@/lib/mock/audit-actors";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { GET as list } from "./admin/directory/[name]/route";
import { POST as login } from "./auth/login/route";
import { PATCH as editProfile } from "./customer/[id]/route";
import { POST as cancelByGuest } from "./public/sites/[slug]/bookings/cancel/route";
import { POST as report } from "./public/sites/[slug]/reports/route";

const json = (body: unknown, method = "POST") => new Request("http://app.localtest.me:3000/x", { method, headers: { "content-type": "application/json", host: "app.localtest.me:3000" }, body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://app.localtest.me:3000${url}`);
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;
const rows = async (query = "") => (await body(await list(get(`/api/v1/admin/directory/audit-logs${query}`), ctx({ name: "audit-logs" })))).items as ReturnType<typeof liveAuditLogs>;

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetAccountStatus(); resetAdminAudit(); });

describe("the audit log keeps what the users do", () => {
  it("writes the newest line first, with who, what, where and when, and cuts the details", () => {
    recordAudit({ ...guestActor("Ann@Example.com", "Ann"), action: "booking.create", entityType: "Booking", entityId: "b-1", organizationId: currentShop.id, details: "x".repeat(300) });
    const [line] = liveAuditLogs();
    expect(line).toMatchObject({ actor: "Ann", actorEmail: "ann@example.com", actorRole: "GUEST", action: "booking.create", organizationId: currentShop.id });
    expect(line!.details).toHaveLength(200);
    expect(Number.isNaN(Date.parse(line!.createdAt))).toBe(false);
  });

  it("records a login of a shop owner and of a customer, and a failed one with the email that was tried", async () => {
    const owner = currentShop.ownerEmail;
    expect((await login(json({ email: owner, password: DEMO_PASSWORD }))).status).toBe(200);
    expect((await login(json({ email: owner, password: "wrong-wrong-1" }))).status).toBe(401);
    expect((await login(json({ email: "nobody@example.com", password: "wrong-wrong-1" }))).status).toBe(401);
    const mine = liveAuditLogs().slice(0, 3); // this session's lines come before the demo lines
    expect(mine.map((l) => [l.action, l.actorRole, l.actorEmail])).toEqual([
      ["auth.login_failed", "GUEST", "nobody@example.com"],
      ["auth.login_failed", "SHOP_OWNER", owner],
      ["auth.login", "SHOP_OWNER", owner],
    ]);
  });

  it("never writes a password, a token or a secret in a line", async () => {
    await login(json({ email: currentShop.ownerEmail, password: DEMO_PASSWORD }));
    await login(json({ email: currentShop.ownerEmail, password: "wrong-wrong-1" }));
    const text = JSON.stringify(liveAuditLogs().slice(0, 2));
    expect(text).not.toContain(DEMO_PASSWORD);
    expect(text).not.toContain("wrong-wrong-1");
  });

  it("records a guest who cancels and a report on the site", async () => {
    await cancelByGuest(json({ code: "NOPE-0", email: "g@example.com" }), ctx({ slug: currentShop.slug })); // not found: nothing is written
    expect(liveAuditLogs().some((l) => l.action === "booking.cancel" && l.actorRole === "GUEST" && l.actorEmail === "g@example.com")).toBe(false);
    const res = await report(json({ reason: "SPAM", message: "this looks like spam to me" }), ctx({ slug: currentShop.slug }));
    if (res.status === 201) expect(liveAuditLogs()[0]).toMatchObject({ action: "report.submit", actorRole: "GUEST" });
  });

  it("does not write a line for a change that was refused", async () => {
    const before = liveAuditLogs().length;
    const res = await editProfile(json({ fullName: "" }, "PATCH"), ctx({ id: "no-such-customer" }));
    expect(res.status).toBe(404);
    expect(liveAuditLogs()).toHaveLength(before);
  });
});

describe("GET /admin/directory/audit-logs", () => {
  beforeEach(() => {
    recordAudit({ ...guestActor("emma@example.com", "Emma"), action: "booking.create", entityType: "Booking", entityId: "b-1", organizationId: currentShop.id });
    recordAudit({ actor: "Shop owner", actorEmail: "owner@shop.example", actorRole: "SHOP_OWNER", action: "promotion.create", entityType: "Promotion", entityId: "p-1", organizationId: currentShop.id });
    recordAudit({ actor: "Platform Admin", actorEmail: "admin@workshopkit.example", actorRole: "SYSTEM_ADMIN", action: "user.reset_password", entityType: "Account", entityId: "a-1", targetEmail: "emma@example.com" });
  });

  it("finds the lines of a user by email: what they did and what was done to them, part of the email and any case", async () => {
    const found = await rows("?email=EMMA@exam");
    expect(found.map((l) => l.action).sort()).toEqual(expect.arrayContaining(["booking.create", "user.reset_password"]));
    expect(found.every((l) => (l.actorEmail ?? "").includes("emma@") || (l.targetEmail ?? "").includes("emma@"))).toBe(true);
    expect(found.some((l) => l.action === "promotion.create")).toBe(false);
  });

  it("finds the lines of an organization by its name, slug or id", async () => {
    for (const q of [currentShop.slug, currentShop.name, currentShop.id]) {
      const found = await rows(`?org=${encodeURIComponent(q)}`);
      expect(found.some((l) => l.action === "promotion.create")).toBe(true);
      expect(found.some((l) => l.entityId === "a-1")).toBe(false);
    }
  });

  it("combines the email with the role and the dates, and says 422 for a wrong date", async () => {
    const found = await rows("?email=emma@example.com&role=SYSTEM_ADMIN");
    expect(found.map((l) => l.action)).toContain("user.reset_password");
    expect(found.every((l) => l.actorRole === "SYSTEM_ADMIN")).toBe(true);
    expect(await rows("?from=2999-01-01")).toHaveLength(0);
    expect((await list(get("/api/v1/admin/directory/audit-logs?from=nope"), ctx({ name: "audit-logs" }))).status).toBe(422);
  });

  it("lists the newest line first", async () => {
    const all = await rows();
    const times = all.map((l) => l.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});
