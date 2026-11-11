import { describe, expect, it } from "vitest";
import { publishAction, type Prerequisite } from "./publish-state";

const met = (value: boolean): Prerequisite[] => [
  { key: "identity", met: true }, { key: "hero", met: true }, { key: "contact", met: true }, { key: "workshop", met: value },
];
const base = { prerequisites: met(true), invalidSections: 0, invalidTheme: false };

describe("publishAction", () => {
  it("a live shop publishes immediately", () => {
    expect(publishAction({ ...base, status: "ACTIVE" })).toEqual({ kind: "publish", disabled: false, reason: null });
  });
  it("publishing is blocked by invalid sections or a failing theme", () => {
    expect(publishAction({ ...base, status: "ACTIVE", invalidSections: 2 })).toEqual({ kind: "publish", disabled: true, reason: "errors" });
    expect(publishAction({ ...base, status: "ACTIVE", invalidTheme: true })).toEqual({ kind: "publish", disabled: true, reason: "errors" });
  });
  it("publishing a live shop does not depend on the first-submission checklist", () => {
    expect(publishAction({ ...base, status: "ACTIVE", prerequisites: met(false) })).toEqual({ kind: "publish", disabled: false, reason: null });
  });
  it("a draft shop publishes (and goes live) once the checklist is complete: there is no review", () => {
    expect(publishAction({ ...base, status: "DRAFT" })).toEqual({ kind: "publish", disabled: false, reason: null });
  });
  it("the first publish waits for the checklist and reports it first", () => {
    expect(publishAction({ ...base, status: "DRAFT", prerequisites: met(false) })).toEqual({ kind: "publish", disabled: true, reason: "checklist" });
    expect(publishAction({ ...base, status: "DRAFT", prerequisites: met(false), invalidSections: 1 })).toEqual({ kind: "publish", disabled: true, reason: "checklist" });
  });
  it("the first publish is also blocked by errors once the checklist is complete", () => {
    expect(publishAction({ ...base, status: "DRAFT", invalidTheme: true })).toEqual({ kind: "publish", disabled: true, reason: "errors" });
  });
  it("a suspended shop cannot publish", () => {
    expect(publishAction({ ...base, status: "SUSPENDED" })).toEqual({ kind: "suspended" });
  });
});
