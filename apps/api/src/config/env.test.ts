import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const URL = "postgres://workshop:not-a-real-password@localhost:5432/workshop";

describe("parseEnv", () => {
  it("applies the defaults and keeps the database url", () => {
    expect(parseEnv({ DATABASE_URL: URL })).toMatchObject({
      NODE_ENV: "development", API_PORT: 4000, LOG_LEVEL: "info", DATABASE_URL: URL, SESSION_COOKIE_NAME: "wsp_sid", SESSION_TTL_DAYS: 14, TRUST_PROXY_HOPS: 0,
      REQUIRE_EMAIL_VERIFICATION: false, PLATFORM_DOMAIN: "localtest.me", RESET_LINK_HOURS: 24, EMAIL_PROVIDER: "mailpit", JOBS_ENABLED: true,
    });
  });

  it("reads the port as a number and accepts the postgresql:// scheme", () => {
    expect(parseEnv({ DATABASE_URL: URL.replace("postgres://", "postgresql://"), API_PORT: "4100" })).toMatchObject({ API_PORT: 4100 });
  });

  it("reads switches written as true / false / 1 / 0", () => {
    expect(parseEnv({ DATABASE_URL: URL, REQUIRE_EMAIL_VERIFICATION: "true", JOBS_ENABLED: "0" })).toMatchObject({ REQUIRE_EMAIL_VERIFICATION: true, JOBS_ENABLED: false });
    expect(() => parseEnv({ DATABASE_URL: URL, JOBS_ENABLED: "maybe" })).toThrow(/JOBS_ENABLED/);
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

  it("production needs Turnstile, a verified email and an https app url; resend needs its key", () => {
    expect(() => parseEnv({ DATABASE_URL: URL, NODE_ENV: "production" })).toThrow(/TURNSTILE_SECRET_KEY.*REQUIRE_EMAIL_VERIFICATION.*APP_URL/);
    expect(parseEnv({ DATABASE_URL: URL, NODE_ENV: "production", TURNSTILE_SECRET_KEY: "k", REQUIRE_EMAIL_VERIFICATION: "true", APP_URL: "https://app.example.com" })).toMatchObject({ NODE_ENV: "production" });
    expect(() => parseEnv({ DATABASE_URL: URL, EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });
});
