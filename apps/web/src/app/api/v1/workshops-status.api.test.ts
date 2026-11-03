import { beforeEach, describe, expect, it } from "vitest";
import { closeIfEnded } from "@workshop/shared";
import { sessions, workshops } from "@/lib/mock/data";
import { adminChangeSession, resetSessionAdminStore, withAdminChanges } from "@/lib/mock/session-admin-store";
import { resetWorkshopStatusStore, withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { POST } from "./workshops/[id]/status/route";

// Activate / Deactivate in the workshop list: a workshop is only deactivated when every one of its sessions is Closed.

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const call = (id: string, body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(id));
const statusOf = (id: string) => withWorkshopStatus(workshops).find((w) => w.id === id)!.status;
const code = async (res: Response) => ((await res.json()) as { error: { code: string; details: { open?: number } } }).error;

const ACTIVE_WITH_OPEN_SESSIONS = "ws-1";
const DRAFT_WITHOUT_SESSIONS = "ws-3";

beforeEach(() => { resetWorkshopStatusStore(); resetSessionAdminStore(); });

describe("the demo data", () => {
  it("has an active workshop with sessions that are not closed, and a draft one without sessions", () => {
    expect(statusOf(ACTIVE_WITH_OPEN_SESSIONS)).toBe("ACTIVE");
    expect(sessions.some((s) => s.workshopId === ACTIVE_WITH_OPEN_SESSIONS && closeIfEnded(s, new Date()).status !== "CLOSED")).toBe(true);
    expect(statusOf(DRAFT_WITHOUT_SESSIONS)).toBe("DRAFT");
    expect(sessions.some((s) => s.workshopId === DRAFT_WITHOUT_SESSIONS)).toBe(false);
  });
});

describe("POST /workshops/{id}/status", () => {
  it("refuses to deactivate a workshop that has sessions that are not closed, and says how many", async () => {
    const res = await call(ACTIVE_WITH_OPEN_SESSIONS, { status: "DRAFT" });
    expect(res.status).toBe(409);
    const err = await code(res);
    expect(err.code).toBe("SESSIONS_OPEN");
    expect(err.details.open).toBeGreaterThan(0);
    expect(statusOf(ACTIVE_WITH_OPEN_SESSIONS)).toBe("ACTIVE");
  });
  it("deactivates it once every session is closed", async () => {
    for (const s of withAdminChanges(sessions).filter((x) => x.workshopId === ACTIVE_WITH_OPEN_SESSIONS)) {
      if (closeIfEnded(s, new Date()).status !== "CLOSED") expect(adminChangeSession(s.id, "close", "closing for the test").ok, s.id).toBe(true);
    }
    const res = await call(ACTIVE_WITH_OPEN_SESSIONS, { status: "DRAFT" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { workshop: { status: string } }).workshop.status).toBe("DRAFT");
    expect(statusOf(ACTIVE_WITH_OPEN_SESSIONS)).toBe("DRAFT");
  });
  it("a draft workshop is activated whatever its sessions, and deactivated again when it has none", async () => {
    expect((await call(DRAFT_WITHOUT_SESSIONS, { status: "ACTIVE" })).status).toBe(200);
    expect(statusOf(DRAFT_WITHOUT_SESSIONS)).toBe("ACTIVE");
    expect((await call(DRAFT_WITHOUT_SESSIONS, { status: "DRAFT" })).status).toBe(200);
    expect(statusOf(DRAFT_WITHOUT_SESSIONS)).toBe("DRAFT");
  });
  it("refuses a switch to the status it already has", async () => {
    expect((await code(await call(ACTIVE_WITH_OPEN_SESSIONS, { status: "ACTIVE" }))).code).toBe("STATUS");
    expect((await code(await call(DRAFT_WITHOUT_SESSIONS, { status: "DRAFT" }))).code).toBe("STATUS");
  });
  it("refuses an unknown workshop, a wrong status and a body that is not JSON", async () => {
    expect((await call("ws-nope", { status: "ACTIVE" })).status).toBe(404);
    expect((await call(DRAFT_WITHOUT_SESSIONS, { status: "ARCHIVED" })).status).toBe(422) // there is no such status any more;
    expect((await call(DRAFT_WITHOUT_SESSIONS, {})).status).toBe(422);
    expect((await POST(new Request("http://x", { method: "POST", body: "nope" }), ctx(DRAFT_WITHOUT_SESSIONS))).status).toBe(400);
  });
});
