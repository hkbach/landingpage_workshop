import { beforeEach, describe, expect, it } from "vitest";
import { workshopsWithShop } from "./admin-directory";
import { referralEarnings } from "./admin-income";
import { liveBookings, liveCustomers, resetBookingStore } from "./booking-store";
import { resetFeeRates } from "./fee-rates-store";
import { inviteBonuses, listInvites, resetInviteStore } from "./invite-store";
import { listReferrals, resetReferralStore } from "./referral-store";
import { listWithdrawals, resetWalletStore, walletOf } from "./wallet-store";

// The demo data of the Affiliate and Referrals pages has every case, so each state of each page can be seen.

beforeEach(() => { resetBookingStore(); resetFeeRates(); resetReferralStore(); resetInviteStore(); resetWalletStore(); });

const accounts = () => liveCustomers().filter((c) => c.account).map((c) => c.id);
const active = (workshopId: string) => workshopsWithShop().find((x) => x.workshop.id === workshopId)?.workshop.status === "ACTIVE";

describe("Affiliate: the links", () => {
  it("has links that earn, links with clicks and no booking, a link nobody opened, and links of deactivated workshops (Deactive)", () => {
    const links = listReferrals();
    const fee = referralEarnings();
    expect(links.some((l) => active(l.workshopId) && (fee.get(l.id)?.fee ?? 0) > 0), "On-going and earning").toBe(true);
    expect(links.some((l) => active(l.workshopId) && l.clicks > 0 && (fee.get(l.id)?.bookings ?? 0) === 0), "On-going, clicked, nothing earned").toBe(true);
    expect(links.some((l) => l.clicks === 0), "nobody opened it").toBe(true);
    expect(links.filter((l) => !active(l.workshopId)).length, "Deactive").toBeGreaterThanOrEqual(2);
  });
  it("has links to workshops of the demo shop and of other shops", () => {
    expect(new Set(listReferrals().map((l) => l.shopId)).size).toBeGreaterThanOrEqual(3);
  });
  it("some customers have several links, and some have none (the empty page)", () => {
    const per = accounts().map((id) => listReferrals().filter((l) => l.accountId === id).length);
    expect(Math.max(...per)).toBeGreaterThanOrEqual(4);
    expect(per.filter((n) => n === 0).length).toBeGreaterThanOrEqual(3);
  });
});

describe("Referrals: the friends", () => {
  it("has a friend who earned the bonus, friends waiting for a first paid booking, and one whose only paid booking came before registering", () => {
    const earned = new Set(inviteBonuses().map((b) => b.inviteId));
    const invites = listInvites();
    expect(invites.some((i) => earned.has(i.id)), "earned").toBe(true);
    expect(invites.filter((i) => !earned.has(i.id)).length, "waiting").toBeGreaterThanOrEqual(3);
    const before = invites.find((i) => !earned.has(i.id) && liveBookings().some((b) => b.customerId === i.inviteeId && b.paymentStatus === "PAID" && b.createdAt < i.registeredAt));
    expect(before, "paid before registering: not counted").toBeDefined();
  });
  it("a customer has several friends, with a mix of states; others invited nobody", () => {
    const earned = new Set(inviteBonuses().map((b) => b.inviteId));
    const mine = listInvites().filter((i) => i.inviterId === "cu-1");
    expect(mine.length).toBeGreaterThanOrEqual(4);
    expect(mine.some((i) => earned.has(i.id)) && mine.some((i) => !earned.has(i.id))).toBe(true);
    expect(accounts().filter((id) => !listInvites().some((i) => i.inviterId === id)).length).toBeGreaterThanOrEqual(5);
  });
  it("each friend is the referral of one customer only", () => {
    const ids = listInvites().map((i) => i.inviteeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Withdrawals: the invoices and the balances", () => {
  it("has every state in each program, with a reason for the rejected ones", () => {
    const all = listWithdrawals();
    for (const source of ["AFFILIATE", "REFERRAL"] as const) {
      expect(all.some((w) => w.source === source && w.status === "PAID"), `${source} paid`).toBe(true);
      expect(all.some((w) => w.source === source && w.status === "PENDING"), `${source} pending`).toBe(true);
      expect(all.some((w) => w.source === source && w.status === "REJECTED"), `${source} rejected`).toBe(true);
    }
    for (const w of all.filter((x) => x.status === "REJECTED")) expect(w.reason, w.code).toBeTruthy();
    for (const w of all.filter((x) => x.status !== "PENDING")) expect(w.processedAt, w.code).toBeTruthy();
    expect(new Set(all.map((w) => w.code)).size).toBe(all.length);
  });
  it("has a balance that is withdrawn in full, one with money to withdraw, one with a pending invoice, and customers with nothing yet", () => {
    const wallets = accounts().flatMap((id) => (["AFFILIATE", "REFERRAL"] as const).map((s) => ({ id, s, w: walletOf(id, s) })));
    expect(wallets.some(({ w }) => w.earned > 0 && w.available === 0 && w.withdrawn > 0), "withdrawn in full").toBe(true);
    expect(wallets.some(({ w }) => w.available > 0), "money to withdraw").toBe(true);
    expect(wallets.some(({ w }) => w.pending > 0), "pending").toBe(true);
    expect(wallets.some(({ w }) => w.earned === 0 && w.pending === 0 && w.withdrawn === 0), "nothing yet").toBe(true);
  });
  it("no invoice is over what the customer earned from the program", () => {
    for (const w of listWithdrawals().filter((x) => x.status !== "REJECTED")) {
      const wallet = walletOf(w.accountId, w.source);
      expect(wallet.pending + wallet.withdrawn, `${w.accountId} ${w.source}`).toBeLessThanOrEqual(wallet.earned);
    }
  });
});
