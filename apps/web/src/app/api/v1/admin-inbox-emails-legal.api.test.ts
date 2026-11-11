import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { adminEmails, adminMessages } from "@/lib/mock/admin-directory";
import { addContactMessage, contactMessages, resetContactStore } from "@/lib/mock/contact-store";
import { legalFor, resetLegalStore } from "@/lib/mock/legal-store";
import { queuePasswordReset, resetOutbox } from "@/lib/mock/outbox-store";
import { parseLegal } from "@/components/marketing/legal-document";
import { DELETE as deleteMessage, PATCH as patchMessage } from "./admin/messages/[id]/route";
import { POST as sendEmail } from "./admin/emails/route";
import { GET as readEmail } from "./admin/emails/[id]/route";
import { POST as resend } from "./admin/emails/[id]/resend/route";
import { GET as readLegal, PUT as writeLegal } from "./admin/legal/[kind]/route";

const call = (handler: (r: Request, c: never) => Promise<Response>, method: string, params: Record<string, string>, body?: unknown) =>
  handler(new Request("http://x", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { params: Promise.resolve(params) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;
const newMessage = () => addContactMessage({ name: "Anna Lee", email: "anna@example.com", topic: "support", message: "I cannot log in to my studio account." });

beforeEach(() => { resetContactStore(); resetOutbox(); resetLegalStore(); resetAccountsStore(); resetAdminAudit(); });

describe("the support inbox", () => {
  it("a message starts New with no note, and the admin list finds it by name, email, topic and text", () => {
    const m = newMessage();
    expect(m).toMatchObject({ status: "NEW", note: "" });
    for (const q of ["anna", "ANNA@example", "log in", "support"]) expect(adminMessages(q).map((x) => x.id), q).toEqual([m.id]);
    expect(adminMessages("zzz")).toEqual([]);
    expect(adminMessages("", "DONE")).toEqual([]);
    expect(adminMessages("", "NEW", "demo")).toEqual([]);
    expect(adminMessages("", "NEW", "support")).toHaveLength(1);
  });

  it("sets the status and keeps an internal note; a wrong status is 422, an unknown message 404", async () => {
    const m = newMessage();
    expect((await call(patchMessage, "PATCH", { id: m.id }, { status: "IN_PROGRESS", note: "  Asked for the shop name " })).status).toBe(200);
    expect(contactMessages()[0]).toMatchObject({ status: "IN_PROGRESS", note: "Asked for the shop name" });
    expect((await call(patchMessage, "PATCH", { id: m.id }, { status: "WHATEVER" })).status).toBe(422);
    expect((await call(patchMessage, "PATCH", { id: m.id }, {})).status).toBe(422);
    expect((await call(patchMessage, "PATCH", { id: "ct-nope" }, { status: "DONE" })).status).toBe(404);
  });

  it("deletes a message for good, and the audit lines never hold the text of the message or of the note", async () => {
    const m = newMessage();
    await call(patchMessage, "PATCH", { id: m.id }, { note: "Secret note about the person" });
    expect((await call(deleteMessage, "DELETE", { id: m.id })).status).toBe(204);
    expect(contactMessages()).toEqual([]);
    expect((await call(deleteMessage, "DELETE", { id: m.id })).status).toBe(404);
    const text = JSON.stringify(liveAuditLogs().slice(0, 3));
    expect(text).not.toContain("cannot log in");
    expect(text).not.toContain("Secret note");
    expect(liveAuditLogs().map((l) => l.action)).toEqual(expect.arrayContaining(["message.delete", "message.set_note"]));
  });

  it("an answer by email marks the message Done", async () => {
    const m = newMessage();
    const res = await call(sendEmail as never, "POST", {}, { audience: "ONE", to: "anna@example.com", subject: "Re: support", body: "Please tell us the name of your shop.", messageId: m.id });
    expect(res.status).toBe(201);
    expect(contactMessages()[0]!.status).toBe("DONE");
  });
});

describe("the emails of the platform", () => {
  it("an administrator email to one address is delivered, listed, and its text can be read; the audit line holds the subject but not the body", async () => {
    const res = await call(sendEmail as never, "POST", {}, { audience: "ONE", to: "  Anna@Example.com ", subject: "  Welcome ", body: "Hello Anna,\n\nThanks for joining." });
    expect(res.status).toBe(201);
    const { ids, total, failed } = await json(res);
    expect([total, failed]).toEqual([1, 0]);
    expect(adminEmails()[0]).toMatchObject({ to: "anna@example.com", subject: "Welcome", status: "SENT", attempts: 1, written: true });
    const detail = await json(await call(readEmail as never, "GET", { id: ids[0] }));
    expect(detail).toMatchObject({ type: "ADMIN_MESSAGE", body: "Hello Anna,\n\nThanks for joining." });
    const line = liveAuditLogs()[0]!;
    expect(line).toMatchObject({ action: "email.send", actorRole: "SYSTEM_ADMIN", targetEmail: "anna@example.com" });
    expect(JSON.stringify(line)).not.toContain("Thanks for joining");
  });

  it("an address that cannot receive mail makes the delivery fail; it can be sent again only while it failed", async () => {
    const { ids } = await json(await call(sendEmail as never, "POST", {}, { audience: "ONE", to: "nobody@fail.example", subject: "Hi", body: "Hello" }));
    expect(adminEmails("", "", "FAILED").map((e) => e.id)).toEqual(ids);
    const again = await call(resend as never, "POST", { id: ids[0] });
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ status: "FAILED", attempts: 2 });
    expect((await call(resend as never, "POST", { id: "nope" })).status).toBe(404);
    const ok = await json(await call(sendEmail as never, "POST", {}, { audience: "ONE", to: "fine@example.com", subject: "Hi", body: "Hello" }));
    expect((await call(resend as never, "POST", { id: ok.ids[0] })).status).toBe(409);
  });

  it("the emails of the system show who, when and what happened but never their text (they hold secret links and temporary passwords)", async () => {
    const e = queuePasswordReset({ to: "owner@example.com", locale: "en", accountName: "Owner", accountEmail: "owner@example.com", tempPassword: "Temp-Secret-123", resetUrl: "http://x/reset?token=SECRETTOKEN", expiresAt: new Date().toISOString() });
    const detail = await json(await call(readEmail as never, "GET", { id: e.id }));
    expect(detail).toMatchObject({ type: "PASSWORD_RESET", to: "owner@example.com", status: "SENT" });
    expect(detail.body).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain("SECRETTOKEN");
    expect(JSON.stringify(adminEmails())).not.toContain("Temp-Secret-123");
    expect(adminEmails()[0]!.written).toBe(false);
  });

  it("an announcement goes to every active shop owner or customer, one email each; 422 for a wrong address or an empty text", async () => {
    const owners = await json(await call(sendEmail as never, "POST", {}, { audience: "SHOP_OWNERS", subject: "News", body: "Something new." }));
    expect(owners.total).toBeGreaterThanOrEqual(3);
    expect(new Set(adminEmails("", "ADMIN_MESSAGE").map((e) => e.to)).size).toBe(owners.total);
    const customers = await json(await call(sendEmail as never, "POST", {}, { audience: "CUSTOMERS", subject: "News", body: "Something new." }));
    expect(customers.total).toBeGreaterThanOrEqual(5);
    const bad = await call(sendEmail as never, "POST", {}, { audience: "ONE", to: "nope", subject: " ", body: "" });
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.fields).toMatchObject({ subject: "required", body: "required" });
    expect((await call(sendEmail as never, "POST", {}, { audience: "ONE", subject: "x", body: "y" })).status).toBe(422);
  });
});

describe("the Terms and the Privacy Policy", () => {
  const put = (kind: string, body: unknown) => call(writeLegal as never, "PUT", { kind }, body);

  it("start empty; the text of a language is saved trimmed, the version goes up only when it changed", async () => {
    expect(await json(await call(readLegal as never, "GET", { kind: "terms" }))).toMatchObject({ version: 0, content: {} });
    const a = await json(await put("terms", { locale: "en", content: "  # Terms\n\nBe kind.  " }));
    expect(a).toMatchObject({ version: 1, content: { en: "# Terms\n\nBe kind." } });
    const same = await json(await put("terms", { locale: "en", content: "# Terms\n\nBe kind." }));
    expect(same.version).toBe(1);
    expect((await json(await put("terms", { locale: "vi", content: "Hãy tử tế." }))).version).toBe(2);
    expect(liveAuditLogs()[0]).toMatchObject({ action: "legal.update", actorRole: "SYSTEM_ADMIN", details: "vi: version 2" });
    expect(JSON.stringify(liveAuditLogs().slice(0, 2))).not.toContain("Be kind");
  });

  it("the public page gets the language asked, else English, else any language, else nothing; an empty text removes a language", async () => {
    expect(legalFor("privacy", "ko")).toBeNull();
    await put("privacy", { locale: "ja", content: "プライバシー" });
    expect(legalFor("privacy", "ko")).toMatchObject({ locale: "ja" });
    await put("privacy", { locale: "en", content: "Privacy text" });
    expect(legalFor("privacy", "ko")).toMatchObject({ locale: "en", content: "Privacy text" });
    expect(legalFor("privacy", "ja")).toMatchObject({ locale: "ja" });
    await put("privacy", { locale: "en", content: "   " });
    expect(legalFor("privacy", "ko")).toMatchObject({ locale: "ja" });
  });

  it("422 for an unknown language or a text that is too long, 404 for another document", async () => {
    expect((await put("terms", { locale: "xx", content: "a" })).status).toBe(422);
    expect((await put("terms", { locale: "en", content: "a".repeat(50_001) })).status).toBe(422);
    expect((await put("cookies", { locale: "en", content: "a" })).status).toBe(404);
    expect((await call(readLegal as never, "GET", { kind: "cookies" })).status).toBe(404);
  });

  it("the text is only ever headings, paragraphs and lists: HTML typed in it stays text", () => {
    const blocks = parseLegal("# Title\n\nFirst line\nsecond line\n\n- one\n- two\n\n<script>alert(1)</script>");
    expect(blocks).toEqual([
      { kind: "h", text: "Title" },
      { kind: "p", text: "First line\nsecond line" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "p", text: "<script>alert(1)</script>" },
    ]);
  });
});
