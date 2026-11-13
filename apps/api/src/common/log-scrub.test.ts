import { describe, expect, it } from "vitest";
import { scrubLog, scrubUrl } from "./log-scrub";

describe("scrubUrl", () => {
  it("drops the query string and any segment that looks like a secret, and keeps the ids", () => {
    expect(scrubUrl("/api/v1/auth/verify-email?token=abcdefghijklmnopqrstuvwxyz0123456789")).toBe("/api/v1/auth/verify-email");
    expect(scrubUrl("/api/v1/public/bookings/confirm/Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg")).toBe("/api/v1/public/bookings/confirm/:token");
    expect(scrubUrl("/api/v1/workshops/0b1f2a4e-8b1c-4f6a-9d3e-0123456789ab/sessions")).toBe("/api/v1/workshops/0b1f2a4e-8b1c-4f6a-9d3e-0123456789ab/sessions");
  });
});

describe("scrubLog", () => {
  it("hides the values of a failed query, the connection string, emails and tokens, and keeps the rest and the ids", () => {
    const error = `error: duplicate key value violates unique constraint "users_email_key"
    Failed query: insert into "users" ("email", "password_hash") values ($1, $2)
    params: ava@example.com,$argon2id$v=19$m=65536,t=3,p=4$abcdef
    at connect (postgres://workshop:s3cret-pass@localhost:5432/workshop)`;
    const out = scrubLog(error);
    expect(out).toContain("duplicate key value violates unique constraint");
    expect(out).toContain('insert into "users"');
    expect(out).not.toMatch(/ava@example\.com|argon2id|s3cret|abcdef/);
    expect(out).toContain("params: [hidden]");
    expect(out).toContain("postgres://[hidden]");
    expect(scrubLog("row 0b1f2a4e-8b1c-4f6a-9d3e-0123456789ab failed for ava@example.com")).toBe("row 0b1f2a4e-8b1c-4f6a-9d3e-0123456789ab failed for [email]");
    expect(scrubLog("token Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg was refused")).toBe("token [token] was refused");
    expect(scrubLog("stored enc:v1:abc_DEF-123:tag_x:body_y")).toBe("stored [encrypted]");
    expect(scrubLog("GET https://r2.example.com/bucket/file.png?X-Amz-Signature=abcdef&X-Amz-Date=1 failed")).toBe("GET [presigned-url] failed");
    expect(scrubLog("Authorization: Bearer abcdefghijklmnop")).toBe("Authorization: Bearer [hidden]");
  });
});
