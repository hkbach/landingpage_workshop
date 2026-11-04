import { beforeEach, describe, expect, it } from "vitest";
import { adminReports } from "@/lib/mock/admin";
import { REPORT_RATE_LIMIT, allReports, resetReportStore } from "@/lib/mock/report-store";
import { POST } from "./public/sites/[slug]/reports/route";
import { GET } from "./admin/reports/route";
import { PATCH } from "./admin/reports/[id]/route";

// The contract of the report endpoints (mock handlers today, apps/api later).

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const send = (slug: string, body: unknown, ip = "1.1.1.1", raw?: string) =>
  POST(new Request(`http://x/api/v1/public/sites/${slug}/reports`, { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: raw ?? JSON.stringify(body) }), ctx({ slug }));
const good = { reason: "SCAM", description: "They charged my card twice at the studio." };
const list = async (query = "") => (await GET(new Request(`http://x/api/v1/admin/reports${query}`))).json() as Promise<{ items: { id: string; status: string; shopSlug: string; reason: string; description: string; reporterEmail?: string; note?: string; handledAt?: string; handledBy?: string }[]; counts: Record<string, number>; shops: string[] }>;
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://x/api/v1/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx({ id }));

beforeEach(() => resetReportStore());

describe("POST /public/sites/{slug}/reports", () => {
  it("accepts a report, stores it as OPEN and answers 201 with its id", async () => {
    const res = await send("whiskladle", { ...good, email: "me@example.com" });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const stored = allReports().find((r) => r.id === id)!;
    expect(stored).toMatchObject({ shopSlug: "whiskladle", reason: "SCAM", status: "OPEN", reporterEmail: "me@example.com" });
    expect(stored.handledAt).toBeUndefined();
  });

  it("accepts an anonymous report (no email)", async () => {
    const { id } = await (await send("whiskladle", good)).json();
    expect(allReports().find((r) => r.id === id)!.reporterEmail).toBeUndefined();
  });

  it("rejects invalid input with 422 and per-field codes, and stores nothing", async () => {
    const before = allReports().length;
    const res = await send("whiskladle", { reason: "SPAM", description: "short", email: "nope" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details.fields).toEqual({ reason: "required", description: "descriptionShort", email: "email" });
    expect(allReports()).toHaveLength(before);
  });

  it("answers 404 for a site that is unknown, not yet published or suspended", async () => {
    for (const slug of ["nope", "sugarsift", "goldennoodle"]) {
      const res = await send(slug, good);
      expect(res.status, slug).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
  });

  it("answers 400 for a body that is not JSON and 413 for an oversized one", async () => {
    expect((await send("whiskladle", null, "2.2.2.2", "not json")).status).toBe(400);
    const big = await send("whiskladle", null, "2.2.2.2", JSON.stringify({ ...good, description: "x".repeat(11_000) }));
    expect(big.status).toBe(413);
  });

  it("keeps submitted text as plain text (it is escaped when displayed, never interpreted)", async () => {
    const description = "<script>alert(1)</script> charged me twice";
    const { id } = await (await send("whiskladle", { ...good, description })).json();
    expect(allReports().find((r) => r.id === id)!.description).toBe(description);
  });

  it("limits a client to 5 accepted reports per hour with 429 and Retry-After", async () => {
    for (let i = 0; i < REPORT_RATE_LIMIT.max; i++) expect((await send("whiskladle", good, "9.9.9.9")).status).toBe(201);
    const blocked = await send("whiskladle", good, "9.9.9.9");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await blocked.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await send("whiskladle", good, "8.8.8.8")).status).toBe(201); // another client is not affected
  });

  it("does not count rejected submissions, so a typo never locks anybody out", async () => {
    for (let i = 0; i < 8; i++) expect((await send("whiskladle", { reason: "SCAM", description: "x" }, "7.7.7.7")).status).toBe(422);
    expect((await send("whiskladle", good, "7.7.7.7")).status).toBe(201);
  });
});

describe("GET /admin/reports", () => {
  it("lists the seed reports newest first with counts that ignore the filters", async () => {
    const all = await list();
    expect(all.items).toHaveLength(adminReports.length);
    const dates = all.items.map((r) => (r as unknown as { createdAt: string }).createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    const open = await list("?status=OPEN");
    expect(open.items.every((r) => r.status === "OPEN")).toBe(true);
    expect(open.counts).toEqual(all.counts); // the summary does not shrink while filtering
    expect(all.counts.total).toBe(adminReports.length);
  });

  it("a report sent from the landing page shows up first, as OPEN, and in the counters", async () => {
    const before = await list();
    const { id } = await (await send("whiskladle", { ...good, reason: "PHISHING", email: "new@example.com" })).json();
    const after = await list();
    expect(after.items[0]).toMatchObject({ id, status: "OPEN", shopSlug: "whiskladle", reason: "PHISHING", reporterEmail: "new@example.com" });
    expect(after.counts.OPEN).toBe(before.counts.OPEN + 1);
    expect(after.counts.total).toBe(before.counts.total + 1);
  });

  it("filters by reason, shop and text, and sorts oldest first on request", async () => {
    const scam = await list("?reason=SCAM");
    expect(scam.items.length).toBeGreaterThan(0);
    expect(scam.items.every((r) => r.reason === "SCAM")).toBe(true);
    const shop = await list("?shop=goldennoodle");
    expect(shop.items.every((r) => r.shopSlug === "goldennoodle")).toBe(true);
    expect((await list("?q=CHARGED%20ME%20TWICE")).items.length).toBeGreaterThan(0);
    expect((await list("?q=zzzz-no-match")).items).toEqual([]);
    const oldest = await list("?sort=oldest");
    const newest = await list("?sort=newest");
    expect(oldest.items.map((r) => r.id)).toEqual([...newest.items.map((r) => r.id)].reverse());
  });

  it("lists the shops that have reports, for the filter", async () => {
    const { shops } = await list();
    expect(shops).toEqual([...new Set(adminReports.map((r) => r.shopSlug))].sort());
  });

  it("answers 422 for an unknown status, reason or sort", async () => {
    for (const q of ["?status=DONE", "?reason=SPAM", "?sort=random"]) {
      const res = await GET(new Request(`http://x/api/v1/admin/reports${q}`));
      expect(res.status, q).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION");
    }
  });
});

describe("PATCH /admin/reports/{id}", () => {
  const openId = async () => (await list("?status=OPEN")).items[0]!.id;

  it("resolves an open report, recording who, when and the note", async () => {
    const id = await openId();
    const res = await patch(id, { status: "RESOLVED", note: "Shop contacted and fixed." });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, status: "RESOLVED", note: "Shop contacted and fixed.", handledBy: "Platform Admin" });
    const row = (await list()).items.find((r) => r.id === id)!;
    expect(row.status).toBe("RESOLVED");
    expect(row.handledAt).toBeTruthy();
  });

  it("dismisses an open report without a note", async () => {
    const id = await openId();
    const res = await patch(id, { status: "DISMISSED" });
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBeUndefined();
  });

  it("a report that was handled cannot be handled again (409)", async () => {
    const id = await openId();
    await patch(id, { status: "RESOLVED" });
    const again = await patch(id, { status: "DISMISSED" });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("INVALID_TRANSITION");
    expect((await list()).items.find((r) => r.id === id)!.status).toBe("RESOLVED");
  });

  it("answers 404 for an unknown report and 422 for a bad decision or a note that is too long", async () => {
    expect((await patch("rp-nope", { status: "RESOLVED" })).status).toBe(404);
    const id = await openId();
    expect((await patch(id, { status: "OPEN" })).status).toBe(422);
    expect((await patch(id, { status: "RESOLVED", note: "x".repeat(501) })).status).toBe(422);
    expect((await patch(id, { status: "RESOLVED" }))).toHaveProperty("status", 200);
  });

  it("answers 400 when the body is not JSON", async () => {
    const res = await PATCH(new Request("http://x/api/v1/admin/reports/x", { method: "PATCH", body: "oops" }), ctx({ id: "x" }));
    expect(res.status).toBe(400);
  });

  it("the counters follow the decisions", async () => {
    const before = (await list()).counts;
    await patch(await openId(), { status: "RESOLVED" });
    const after = (await list()).counts;
    expect(after.OPEN).toBe(before.OPEN - 1);
    expect(after.RESOLVED).toBe(before.RESOLVED + 1);
    expect(after.total).toBe(before.total);
  });
});
