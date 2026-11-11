import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { contactMessages, CONTACT_RATE_LIMIT, resetContactStore } from "@/lib/mock/contact-store";
import { POST } from "./public/contact/route";

const send = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://app.localtest.me:3000/api/v1/public/contact", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const valid = { name: "  Anna Lee ", email: " Anna@Example.com ", topic: "demo", message: "  Hello, I run a pottery studio and would like a walkthrough.  " };

beforeEach(() => { resetContactStore(); resetAdminAudit(); });

describe("POST /public/contact", () => {
  it("keeps a valid message (trimmed, the email in lower case) and answers 201", async () => {
    const res = await send(valid);
    expect(res.status).toBe(201);
    expect(contactMessages()).toHaveLength(1);
    expect(contactMessages()[0]).toMatchObject({ name: "Anna Lee", email: "anna@example.com", topic: "demo", message: "Hello, I run a pottery studio and would like a walkthrough." });
  });

  it("names the wrong fields with 422 and keeps nothing", async () => {
    const res = await send({ name: " ", email: "nope", topic: "demo", message: "short" });
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toEqual({ name: "required", email: "invalid", message: "tooShort" });
    expect((await send({ ...valid, topic: "other" })).status).toBe(422);
    expect((await send({ ...valid, message: "x".repeat(2001) })).status).toBe(422);
    expect(contactMessages()).toHaveLength(0);
  });

  it("400 for a body that is not JSON, 413 for a body that is far too large", async () => {
    expect((await send("not json")).status).toBe(400);
    expect((await send(JSON.stringify({ ...valid, message: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("a robot that fills the hidden box is told it worked and nothing is kept", async () => {
    const res = await send({ ...valid, website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect(contactMessages()).toHaveLength(0);
  });

  it("accepts 5 messages an hour from one client, then 429 with Retry-After; another client is not affected", async () => {
    for (let i = 0; i < CONTACT_RATE_LIMIT.max; i++) expect((await send(valid)).status).toBe(201);
    const limited = await send(valid);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await send(valid, "2.2.2.2")).status).toBe(201);
  });

  it("a refused message does not count towards the limit", async () => {
    for (let i = 0; i < 10; i++) await send({ ...valid, email: "bad" });
    expect((await send(valid)).status).toBe(201);
  });

  it("writes an audit line with the sender and the topic, never the text of the message", async () => {
    await send(valid);
    const [line] = liveAuditLogs();
    expect(line).toMatchObject({ action: "contact.submit", actorRole: "GUEST", actorEmail: "anna@example.com", details: "topic: demo" });
    expect(JSON.stringify(line)).not.toContain("pottery");
  });
});
