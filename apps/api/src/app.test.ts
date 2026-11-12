import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "./app";

// The whole application is started (modules, injection, filter) with a database address that nobody listens on: it proves the wiring without needing Docker.
describe("the API application", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://nobody:not-a-real-password@127.0.0.1:1/none";
    app = await createApp({ NODE_ENV: "test", LOG_LEVEL: "silent" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });

  it("answers /health without the database", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("answers /ready with 503 NOT_READY when the database cannot be reached, without saying why", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({ code: "NOT_READY" });
    expect(res.body).not.toContain("127.0.0.1");
    expect(res.body).not.toContain("not-a-real-password");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("uses the standard error for an unknown path and echoes a plain request id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/nothing-here", headers: { "x-request-id": "abc-12345678" } });
    expect(res.statusCode).toBe(404);
    expect(res.headers["x-request-id"]).toBe("abc-12345678");
    expect(res.json().error).toMatchObject({ code: "NOT_FOUND", requestId: "abc-12345678" });
  });

  it("sets the security headers on every answer, an error included, and never caches", async () => {
    for (const url of ["/health", "/api/v1/nothing-here", "/ready"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.headers["x-content-type-options"], url).toBe("nosniff");
      expect(res.headers["referrer-policy"], url).toBe("no-referrer");
      expect(res.headers["content-security-policy"], url).toContain("frame-ancestors 'none'");
      expect(res.headers["cache-control"], url).toBe("no-store");
      expect(res.headers["strict-transport-security"], url).toBeUndefined(); // only in production (http in development)
      expect(res.headers["x-powered-by"], url).toBeUndefined();
    }
  });

  it("replaces a request id that is not a plain token, and keeps the product under /api/v1 only", async () => {
    const own = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": "bad id with spaces" } });
    expect(own.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect((await app.inject({ method: "GET", url: "/api/v1/health" })).statusCode).toBe(404); // the checks are not under the prefix
  });
});
