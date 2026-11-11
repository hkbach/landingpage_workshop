import { beforeEach, describe, expect, it } from "vitest";
import { listAccounts, resetAccountsStore, resetValidMs, startPasswordReset } from "@/lib/mock/accounts-store";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { DEFAULT_PLATFORM_SETTINGS, getPlatformSettings, resetPlatformSettings } from "@/lib/mock/app-settings-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { resetContactStore } from "@/lib/mock/contact-store";
import { resetFeeRates } from "@/lib/mock/fee-rates-store";
import { resetInviteStore } from "@/lib/mock/invite-store";
import { resetOutbox } from "@/lib/mock/outbox-store";
import { resetReferralStore } from "@/lib/mock/referral-store";
import { requestWithdrawal, resetWalletStore, walletOf } from "@/lib/mock/wallet-store";
import { GET as readWallet } from "./customer/[id]/wallet/route";
import { POST as withdraw } from "./customer/[id]/withdrawals/route";
import { POST as sendContact } from "./public/contact/route";
import { GET, PUT } from "./admin/settings/route";

const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;
const ok = { withdrawalMin: 0, withdrawalMax: 0, resetLinkHours: 24, contactPerHour: 5 };

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetFeeRates(); resetReferralStore(); resetInviteStore(); resetWalletStore(); resetOutbox(); resetContactStore(); resetPlatformSettings(); resetAdminAudit(); });

describe("the settings of the platform", () => {
  it("start with the defaults: no withdrawal limit, a reset link that works 24 hours, 5 messages an hour", async () => {
    expect(DEFAULT_PLATFORM_SETTINGS).toEqual(ok);
    const body = await json(await GET());
    expect(body).toMatchObject({ ...ok, currency: "VND" });
    expect(resetValidMs()).toBe(24 * 3_600_000);
  });

  it("saves the values and writes an audit line naming what changed", async () => {
    const res = await put({ ...ok, withdrawalMin: 100_000, withdrawalMax: 5_000_000, resetLinkHours: 12 });
    expect(res.status).toBe(200);
    expect(getPlatformSettings()).toMatchObject({ withdrawalMin: 100_000, withdrawalMax: 5_000_000, resetLinkHours: 12, contactPerHour: 5 });
    expect(liveAuditLogs()[0]).toMatchObject({ action: "platform.settings_update", actorRole: "SYSTEM_ADMIN", details: "withdrawalMin 0 -> 100000; withdrawalMax 0 -> 5000000; resetLinkHours 24 -> 12" });
    const n = liveAuditLogs().length;
    await put({ ...ok, withdrawalMin: 100_000, withdrawalMax: 5_000_000, resetLinkHours: 12 });
    expect(liveAuditLogs()).toHaveLength(n);
  });

  it("422 for a maximum below the minimum, a negative or fractional amount, hours or messages out of range; nothing is saved", async () => {
    expect((await json(await put({ ...ok, withdrawalMin: 500, withdrawalMax: 100 }))).error.details.fields).toEqual({ withdrawalMax: "order" });
    expect((await put({ ...ok, withdrawalMin: -1 })).status).toBe(422);
    expect((await put({ ...ok, withdrawalMin: 1.5 })).status).toBe(422);
    expect((await json(await put({ ...ok, resetLinkHours: 0 }))).error.details.fields).toEqual({ resetLinkHours: "invalid" });
    expect((await json(await put({ ...ok, resetLinkHours: 500 }))).error.details.fields).toEqual({ resetLinkHours: "invalid" });
    expect((await json(await put({ ...ok, contactPerHour: 0 }))).error.details.fields).toEqual({ contactPerHour: "invalid" });
    expect((await put({ ...ok, contactPerHour: "5" })).status).toBe(422);
    expect(getPlatformSettings()).toEqual(ok);
  });

  it("a limit of 0 means none: a maximum alone or a minimum alone is allowed", async () => {
    expect((await put({ ...ok, withdrawalMin: 50_000 })).status).toBe(200);
    expect((await put({ ...ok, withdrawalMax: 800_000 })).status).toBe(200);
  });
});

describe("the settings are applied", () => {
  const ADAM = "cu-1";
  const available = () => walletOf(ADAM, "AFFILIATE").available;

  it("a withdrawal below the smallest or above the largest is refused (422 belowMin / aboveMax), one inside the limits is made", async () => {
    const a = available();
    expect(a).toBeGreaterThan(100_000);
    await put({ ...ok, withdrawalMin: 60_000, withdrawalMax: 90_000 });
    const body = (amount: number) => withdraw(new Request("http://app.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "AFFILIATE", amount }) }), { params: Promise.resolve({ id: ADAM }) } as never);
    const low = await body(50_000);
    expect(low.status).toBe(422);
    expect((await json(low)).error.details.fields).toEqual({ amount: "belowMin" });
    expect((await json(await body(100_000))).error.details.fields).toEqual({ amount: "aboveMax" });
    expect((await body(70_000)).status).toBe(201);
    expect(requestWithdrawal(ADAM, "AFFILIATE", 10).ok).toBe(false);
  });

  it("the wallet tells the customer the limits", async () => {
    await put({ ...ok, withdrawalMin: 60_000 });
    const res = await readWallet(new Request("http://app.localtest.me:3000/x?source=AFFILIATE"), { params: Promise.resolve({ id: ADAM }) } as never);
    expect((await json(res)).limits).toEqual({ min: 60_000, max: 0 });
  });

  it("the link of a reset works for the hours set, counted from the moment it was sent", () => {
    const owner = listAccounts()[0]!;
    const now = Date.UTC(2026, 10, 11, 12);
    const a = startPasswordReset(owner.id, (t) => `http://x/${t}`, now);
    expect(a.ok && Date.parse(a.expiresAt)).toBe(now + 24 * 3_600_000);
    return put({ ...ok, resetLinkHours: 6 }).then(() => {
      const b = startPasswordReset(owner.id, (t) => `http://x/${t}`, now);
      expect(b.ok && Date.parse(b.expiresAt)).toBe(now + 6 * 3_600_000);
    });
  });

  it("the Contact form accepts the number of messages set in an hour", async () => {
    await put({ ...ok, contactPerHour: 2 });
    const send = () => sendContact(new Request("http://x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ name: "Anna", email: "anna@example.com", topic: "general", message: "Hello, this is a message." }) }));
    expect([(await send()).status, (await send()).status, (await send()).status]).toEqual([201, 201, 429]);
  });
});
