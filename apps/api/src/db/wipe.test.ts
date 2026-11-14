import { describe, expect, it } from "vitest";
import { checkTarget } from "./wipe";

describe("the wipe of the database refuses what it should", () => {
  const local = "postgres://u:p@localhost:5432/workshop";
  it("needs --yes", () => {
    expect(() => checkTarget(local, [])).toThrow(/--yes/);
    expect(checkTarget(local, ["--yes"])).toEqual({ database: "workshop", host: "localhost" });
  });
  it("never runs in production", () => {
    expect(() => checkTarget(local, ["--yes"], { NODE_ENV: "production" })).toThrow(/production/);
  });
  it("only on this machine, unless --allow-remote is added too", () => {
    const remote = "postgres://u:p@db.example.com:5432/workshop";
    expect(() => checkTarget(remote, ["--yes"])).toThrow(/not on this machine/);
    expect(checkTarget(remote, ["--yes", "--allow-remote"]).host).toBe("db.example.com");
    expect(checkTarget("postgres://u:p@127.0.0.1:5432/x", ["--yes"]).host).toBe("127.0.0.1");
  });
});
