import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HealthController } from "../health/health.controller";
import { ZodPipe } from "./zod.pipe";
import { toErrorBody } from "./error.filter";
import type { Database } from "../db/db.module";

describe("toErrorBody: the standard error of every endpoint", () => {
  it("answers a validation error with 422 and the wrong fields", () => {
    const schema = z.object({ email: z.email(), quantity: z.number().int().min(1) });
    let error: unknown;
    try {
      new ZodPipe(schema).transform({ email: "nope", quantity: 0 });
    } catch (e) {
      error = e;
    }
    const { status, body } = toErrorBody(error, "req-12345678");
    expect(status).toBe(422);
    expect(body.error).toMatchObject({ code: "VALIDATION", requestId: "req-12345678" });
    expect(Object.keys(body.error.details.fields as object).sort()).toEqual(["email", "quantity"]);
  });

  it("gives an HTTP exception its status and a code (its own, or one from the status)", () => {
    expect(toErrorBody(new NotFoundException("No such shop")).body.error).toMatchObject({ code: "NOT_FOUND", message: "No such shop" });
    expect(toErrorBody(new ForbiddenException()).status).toBe(403);
    expect(toErrorBody(new BadRequestException({ code: "SESSION_FULL", message: "Full", details: { left: 0 } })).body.error).toEqual({ code: "SESSION_FULL", message: "Full", details: { left: 0 } });
  });

  it("hides what went wrong inside: an unexpected error is a plain 500 without its text", () => {
    const { status, body } = toErrorBody(new Error('relation "users" does not exist; password=hunter2'));
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});

describe("/ready", () => {
  it("is 503 NOT_READY, without the database error, when the database cannot be reached", async () => {
    const down = { execute: () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:5432")) } as unknown as Database;
    const result = await new HealthController(down).ready().catch((e: unknown) => e);
    expect(result).toBeInstanceOf(ServiceUnavailableException);
    const { status, body } = toErrorBody(result);
    expect(status).toBe(503);
    expect(body.error.code).toBe("NOT_READY");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });

  it("is ready when the database answers", async () => {
    const up = { execute: () => Promise.resolve([]) } as unknown as Database;
    expect(await new HealthController(up).ready()).toEqual({ status: "ready" });
    expect(new HealthController(up).health()).toEqual({ status: "ok" });
  });
});
