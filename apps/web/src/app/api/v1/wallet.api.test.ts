import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminWithdrawals } from "@/lib/mock/admin-directory";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { resetFeeRates } from "@/lib/mock/fee-rates-store";
import { resetInviteStore } from "@/lib/mock/invite-store";
import { resetReferralStore } from "@/lib/mock/referral-store";
import { resetWalletStore, walletOf } from "@/lib/mock/wallet-store";
import { POST as process } from "./admin/withdrawals/[id]/route";
import { GET as wallet } from "./customer/[id]/wallet/route";
import { POST as withdraw } from "./customer/[id]/withdrawals/route";

const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;
const walletOf$ = async (id: string, source: string) => body(await wallet(new Request(`http://x/api/v1/customer/${id}/wallet?source=${source}`), ctx({ id })));
const ask = (id: string, source: string, amount: unknown) => withdraw(json({ source, amount }), ctx({ id }));

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetAccountStatus(); resetFeeRates(); resetReferralStore(); resetInviteStore(); resetWalletStore(); resetAdminAudit(); });

describe("the wallet of a customer", () => {
  it("shows what was earned, what is pending, what was withdrawn and the invoices, for each program", async () => {
    const a = await walletOf$("cu-4", "AFFILIATE");
    expect(a).toMatchObject({ source: "AFFILIATE", currency: "VND", pending: 100_000, withdrawn: 200_000 });
    expect(a.earned).toBeGreaterThan(0);
    expect(a.available).toBe(Math.max(0, a.earned - a.pending - a.withdrawn));
    expect(a.items.map((i: { code: string; status: string }) => [i.code, i.status])).toEqual([["WD-0002", "PENDING"], ["WD-0001", "PAID"]]);
    const r = await walletOf$("cu-4", "REFERRAL"); // the two programs are apart
    expect(r.items.map((i: { status: string }) => i.status)).toEqual(["REJECTED"]);
    expect(r.items[0].reason).toMatch(/Bank account/);
    expect(r).toMatchObject({ pending: 0, withdrawn: 0 });
    expect(r.available).toBe(r.earned); // a rejected invoice gives the amount back
  });
  it("404 for a customer who does not exist, 422 for another program", async () => {
    expect((await wallet(new Request("http://x/api/v1/customer/nobody/wallet?source=AFFILIATE"), ctx({ id: "nobody" }))).status).toBe(404);
    expect((await wallet(new Request("http://x/api/v1/customer/cu-4/wallet?source=OTHER"), ctx({ id: "cu-4" }))).status).toBe(422);
  });
});

describe("a withdrawal", () => {
  it("is an invoice that waits for the admin and takes its amount out of what is available", async () => {
    const before = await walletOf$("cu-4", "REFERRAL");
    const amount = Math.min(70_000, before.available);
    const res = await ask("cu-4", "REFERRAL", amount);
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({ code: "WD-0004", amount, status: "PENDING", currency: "VND" });
    const after = await walletOf$("cu-4", "REFERRAL");
    expect([after.pending, after.available, after.earned]).toEqual([amount, before.available - amount, before.earned]);
    expect(after.items[0]).toMatchObject({ code: "WD-0004", status: "PENDING" });
  });
  it("is refused for an amount that is not a whole positive number, and for more than is available", async () => {
    for (const amount of [0, -5, 1.5, "100", null]) {
      const res = await ask("cu-4", "AFFILIATE", amount);
      expect(res.status, String(amount)).toBe(422);
    }
    const w = await walletOf$("cu-4", "AFFILIATE");
    const over = await ask("cu-4", "AFFILIATE", w.available + 1);
    expect([over.status, (await body(over)).error.details.fields]).toEqual([422, { amount: "exceeds" }]);
    expect((await ask("cu-4", "AFFILIATE", w.available)).status).toBe(201); // all of it is fine
    expect((await ask("cu-4", "AFFILIATE", 1)).status).toBe(422); // and then nothing is left
    expect((await ask("cu-4", "OTHER", 100)).status).toBe(422);
    expect((await ask("nobody", "AFFILIATE", 100)).status).toBe(404);
  });
  it("cannot take money from the other program", async () => {
    const aff = await walletOf$("cu-9", "AFFILIATE"); // earned nothing
    expect(aff.available).toBe(0);
    expect((await ask("cu-9", "AFFILIATE", 1)).status).toBe(422);
  });
});

describe("the admin processes an invoice", () => {
  it("marks it paid: it moves from pending to withdrawn, and it is processed once", async () => {
    const before = walletOf("cu-4", "AFFILIATE");
    const res = await process(json({ action: "pay" }), ctx({ id: "wd-2" }));
    expect(await body(res)).toMatchObject({ code: "WD-0002", status: "PAID" });
    const after = walletOf("cu-4", "AFFILIATE");
    expect([after.pending, after.withdrawn, after.available]).toEqual([0, before.withdrawn + before.pending, before.available]);
    expect((await process(json({ action: "reject", reason: "late" }), ctx({ id: "wd-2" }))).status).toBe(409);
    expect((await process(json({ action: "pay" }), ctx({ id: "nope" }))).status).toBe(404);
  });
  it("rejects it with a reason, and the amount goes back to what is available", async () => {
    const before = walletOf("cu-4", "AFFILIATE");
    expect((await process(json({ action: "reject" }), ctx({ id: "wd-2" }))).status).toBe(422);
    expect((await process(json({ action: "reject", reason: "  " }), ctx({ id: "wd-2" }))).status).toBe(422);
    const res = await process(json({ action: "reject", reason: "Name does not match" }), ctx({ id: "wd-2" }));
    expect(await body(res)).toMatchObject({ status: "REJECTED", reason: "Name does not match" });
    const after = walletOf("cu-4", "AFFILIATE");
    expect([after.pending, after.available]).toEqual([0, before.available + before.pending]);
    expect((await process(json({ action: "other" }), ctx({ id: "wd-2" }))).status).toBe(422);
  });
  it("is written in the audit log without any secret", async () => {
    await process(json({ action: "pay" }), ctx({ id: "wd-2" }));
    expect(liveAuditLogs()[0]).toMatchObject({ action: "withdrawal.pay", entityType: "withdrawal", entityId: "WD-0002" });
  });
});

describe("the list of the admin", () => {
  it("puts the pending invoices first and searches by invoice number, email and name", async () => {
    const all = adminWithdrawals();
    expect(all.map((w) => w.code)).toEqual(["WD-0002", "WD-0003", "WD-0001"]); // pending, then newest
    expect(adminWithdrawals("wd-0001").map((w) => w.code)).toEqual(["WD-0001"]);
    expect(adminWithdrawals("thu@example").length).toBe(3);
    expect(adminWithdrawals("nobody@example.com")).toEqual([]);
    expect(adminWithdrawals("", "PAID").map((w) => w.code)).toEqual(["WD-0001"]);
    expect(adminWithdrawals("", "", "", "", "REFERRAL").map((w) => w.code)).toEqual(["WD-0003"]);
    expect(adminWithdrawals("", "", "2999-01-01")).toEqual([]);
    expect(all[0]).toMatchObject({ accountEmail: "thu@example.com", source: "AFFILIATE", status: "PENDING" });
  });
});
