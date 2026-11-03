import { beforeEach, describe, expect, it } from "vitest";
import { canCloseAgain, closeCount, closedForGood } from "@workshop/shared";
import { sessions } from "./data";
import { adminChangeSession, resetSessionAdminStore, withAdminChanges } from "./session-admin-store";

// A system administrator closes and opens sessions without the limits of the owner; the change shows in what the owner pages read.

const NOW = new Date();
const find = (id: string) => withAdminChanges(sessions).find((s) => s.id === id)!;
const upcoming = () => sessions.find((s) => s.status === "OPEN" && new Date(s.startsAt) > NOW)!;
const forGood = () => sessions.find((s) => closedForGood(s) && new Date(s.startsAt) > NOW)!;

beforeEach(resetSessionAdminStore);

describe("adminChangeSession", () => {
  it("closes an open session only with a reason, and adds an admin note", () => {
    const s = upcoming();
    expect(adminChangeSession(s.id, "close", "  ", NOW)).toEqual({ ok: false, code: "REASON_REQUIRED" });
    const res = adminChangeSession(s.id, "close", "  Fraud report  ", NOW);
    expect(res.ok).toBe(true);
    const after = find(s.id);
    expect(after.status).toBe("CLOSED");
    const note = after.notes!.at(-1)!;
    expect(note).toMatchObject({ type: "CLOSED", by: "ADMIN", reason: { code: "OTHER", note: "Fraud report" } });
  });

  it("opens a session closed for good, which the owner cannot", () => {
    const s = forGood();
    expect(adminChangeSession(s.id, "reopen", "", NOW).ok).toBe(true);
    const after = find(s.id);
    expect(after.status).toBe("OPEN");
    expect(after.notes!.at(-1)).toMatchObject({ type: "REOPENED", by: "ADMIN" });
  });

  it("does not count the notes of the admin in the limits of the owner", () => {
    const s = upcoming();
    const before = closeCount(s.notes);
    for (let i = 0; i < 6; i++) {
      expect(adminChangeSession(s.id, "close", "again", NOW).ok).toBe(true);
      expect(adminChangeSession(s.id, "reopen", "", NOW).ok).toBe(true);
    }
    const after = find(s.id);
    expect(after.status).toBe("OPEN");
    expect(closeCount(after.notes)).toBe(before);
    expect(canCloseAgain(after.notes)).toBe(canCloseAgain(s.notes));
  });

  it("refuses a change that makes no sense", () => {
    const s = upcoming();
    expect(adminChangeSession(s.id, "reopen", "", NOW)).toEqual({ ok: false, code: "NOT_ALLOWED" }); // not closed
    expect(adminChangeSession("nope", "close", "x", NOW)).toEqual({ ok: false, code: "NOT_FOUND" });
    const ended = sessions.find((x) => new Date(x.endsAt) < NOW)!;
    expect(adminChangeSession(ended.id, "close", "x", NOW)).toEqual({ ok: false, code: "NOT_ALLOWED" }); // closed automatically
    expect(adminChangeSession(ended.id, "reopen", "", NOW)).toEqual({ ok: false, code: "NOT_ALLOWED" }); // it has ended
  });
});
