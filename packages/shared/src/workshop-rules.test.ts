import { describe, expect, it } from "vitest";
import { canActivateWorkshop, canDeactivateWorkshop, canEditWorkshop, checkWorkshopSwitch, openSessionCount } from "./workshop-rules";

describe("workshop rules", () => {
  it("a draft workshop can be activated, an active one cannot", () => {
    expect(canActivateWorkshop("DRAFT")).toBe(true);
    expect(canActivateWorkshop("ACTIVE")).toBe(false);
  });
  it("an active workshop can be deactivated only when every session is closed", () => {
    expect(canDeactivateWorkshop("ACTIVE", ["CLOSED", "CLOSED"])).toBe(true);
    expect(canDeactivateWorkshop("ACTIVE", ["CLOSED", "OPEN"])).toBe(false);
    for (const s of ["OPEN", "RUNNING", "PAUSED"] as const) expect(canDeactivateWorkshop("ACTIVE", ["CLOSED", s]), s).toBe(false);
  });
  it("a workshop without sessions can be deactivated", () => expect(canDeactivateWorkshop("ACTIVE", [])).toBe(true));
  it("a draft workshop is not deactivated", () => {
    expect(canDeactivateWorkshop("DRAFT", [])).toBe(false);
  });
  it("counts the sessions that are not closed", () => {
    expect(openSessionCount(["CLOSED", "OPEN", "RUNNING", "PAUSED", "CLOSED"])).toBe(3);
    expect(openSessionCount([])).toBe(0);
  });
  it("only a deactivated (draft) workshop can be edited", () => {
    expect(canEditWorkshop("DRAFT")).toBe(true);
    expect(canEditWorkshop("ACTIVE")).toBe(false);
  });
  it("says why a workshop cannot be switched", () => {
    expect(checkWorkshopSwitch("DRAFT", "ACTIVE", ["OPEN"])).toBeNull(); // activating never depends on the sessions
    expect(checkWorkshopSwitch("ACTIVE", "ACTIVE", [])).toBe("STATUS");
    expect(checkWorkshopSwitch("ACTIVE", "DRAFT", ["CLOSED"])).toBeNull();
    expect(checkWorkshopSwitch("ACTIVE", "DRAFT", ["CLOSED", "OPEN"])).toBe("SESSIONS_OPEN");
    expect(checkWorkshopSwitch("DRAFT", "DRAFT", [])).toBe("STATUS");
  });
});
