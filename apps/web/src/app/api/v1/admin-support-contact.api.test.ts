import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { getPlatformSupport, platformSupport, resetPlatformSupport } from "@/lib/mock/platform";
import { supportLinks } from "@/lib/support-contact";
import { GET, PUT } from "./admin/support-contact/route";

const put = (body: unknown) => PUT(new Request("http://x/api/v1/admin/support-contact", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;
const all = { whatsapp: "+84 90 111 2222", phone: "+84 28 3333 4444", zalo: "0905556666", email: "help@platform.example" };

beforeEach(() => { resetPlatformSupport(); resetAdminAudit(); });

describe("the support contact of the platform, edited by the admin", () => {
  it("starts with the demo values", async () => {
    expect(await body(await GET())).toEqual({ whatsapp: platformSupport.whatsapp, phone: platformSupport.phone, zalo: platformSupport.zalo, email: platformSupport.email });
  });

  it("saves trimmed values and every reader (shop owner, customer) gets them", async () => {
    const res = await put({ ...all, email: `  ${all.email} ` });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(all);
    expect(getPlatformSupport()).toEqual(all);
    expect(supportLinks(getPlatformSupport()).map((l) => l.href)).toEqual(["https://wa.me/84901112222", "tel:+842833334444", "https://zalo.me/0905556666", "mailto:help@platform.example"]);
  });

  it("an empty value clears the channel, so it is not shown", async () => {
    await put({ ...all, zalo: "", whatsapp: "" });
    expect(getPlatformSupport()).toEqual({ phone: all.phone, email: all.email });
    expect(supportLinks(getPlatformSupport()).map((l) => l.channel)).toEqual(["phone", "email"]);
  });

  it("refuses a wrong number or email with 422 naming the fields, and saves nothing", async () => {
    const res = await put({ ...all, phone: "abc", email: "not-an-email", zalo: "123" });
    expect(res.status).toBe(422);
    expect((await body(res)).error.details.fields).toEqual({ zalo: "invalid", phone: "invalid", email: "invalid" });
    expect(getPlatformSupport()).toEqual(platformSupport);
    expect((await put({ whatsapp: 5 })).status).toBe(422);
  });

  it("writes an audit line with the channels that changed, never the values, and none when nothing changed", async () => {
    const before = liveAuditLogs().length;
    await put({ ...platformSupport, phone: platformSupport.phone, email: "new@platform.example" });
    const [line] = liveAuditLogs();
    expect(line).toMatchObject({ action: "platform.support_contact_update", actorRole: "SYSTEM_ADMIN", details: "changed: email" });
    expect(JSON.stringify(line)).not.toContain("new@platform.example");
    await put({ ...platformSupport, email: "new@platform.example" });
    expect(liveAuditLogs()).toHaveLength(before + 1);
  });
});
