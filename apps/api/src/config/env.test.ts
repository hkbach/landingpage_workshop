import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const URL = "postgres://workshop:not-a-real-password@localhost:5432/workshop";

describe("parseEnv", () => {
  it("applies the defaults and keeps the database url", () => {
    expect(parseEnv({ DATABASE_URL: URL })).toEqual({ NODE_ENV: "development", API_PORT: 4000, LOG_LEVEL: "info", DATABASE_URL: URL });
  });

  it("reads the port as a number and accepts the postgresql:// scheme", () => {
    expect(parseEnv({ DATABASE_URL: URL.replace("postgres://", "postgresql://"), API_PORT: "4100", NODE_ENV: "production" })).toMatchObject({ API_PORT: 4100, NODE_ENV: "production" });
  });

  it("refuses a missing or wrong database url and never prints its value", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    let message = "";
    try {
      parseEnv({ DATABASE_URL: "mysql://root:secret-value@localhost/x" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL must start with postgres/);
    expect(message).not.toContain("secret-value");
  });

  it("refuses a port out of range and an unknown log level", () => {
    expect(() => parseEnv({ DATABASE_URL: URL, API_PORT: "70000" })).toThrow(/API_PORT/);
    expect(() => parseEnv({ DATABASE_URL: URL, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});
