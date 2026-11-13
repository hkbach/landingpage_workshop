import type { Gender, Locale, Socials, WorkshopCategory } from "@workshop/shared";
import type { CustomerBooking } from "./customer-bookings";

// Browser side of the account of a guest (/api/v1/customer/{id}). The guest is identified by the email of the login, sent in the `x-guest-email` header.
// TODO(api): the guest session is a cookie; no email is sent.

export interface CustomerProfile {
  id: string; fullName: string; email: string; phone?: string; preferredLocale: Locale;
  account: { country: string; birthDate: string; favoriteCategories: WorkshopCategory[]; gender?: Gender; socials?: Socials; avatarUrl?: string };
}

/** What the guest can change (the email cannot). Whatever is left out is removed from the profile. */
export interface CustomerProfileInput {
  fullName: string; phone?: string; preferredLocale: Locale; country: string; birthDate: string; favoriteCategories: WorkshopCategory[]; gender?: Gender; socials?: Socials; avatarUrl?: string;
}

export class CustomerApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly fields: Record<string, string> = {}) {
    super(code);
    this.name = "CustomerApiError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; details?: { fields?: Record<string, string> } } } | null;
    throw new CustomerApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.details?.fields ?? {});
  }
  return (await res.json()) as T;
}

const url = (id: string) => `/api/v1/customer/${encodeURIComponent(id)}`;

/** `email` is left out only while the login of the guest area is switched off. */
const emailHeader = (email?: string): Record<string, string> => (email ? { "x-guest-email": email } : {});

export const fetchCustomerProfile = async (id: string, email?: string): Promise<CustomerProfile> =>
  parse(await fetch(url(id), { headers: emailHeader(email), cache: "no-store" }));

/** The bookings of the guest, and the time of the server (the page counts "today" and "in 3 days" from it). */
export interface CustomerBookingsResponse { bookings: CustomerBooking[]; now: string }

export const fetchCustomerBookings = async (id: string, email?: string): Promise<CustomerBookingsResponse> =>
  parse(await fetch(`${url(id)}/bookings`, { headers: emailHeader(email), cache: "no-store" }));

/** A referral (affiliate) link of the guest with what it earned: the referral rate of the shop (basis points) x the original price of the paid bookings that came through it. */
export interface CustomerReferral {
  id: string; code: string; workshopId: string; workshopTitle: string; shopName: string; link: string; createdAt: string; clicks: number;
  referralBps: number; bookings: number; referralFee: number; currency: string;
  /** ON_GOING while the workshop is active; DEACTIVE once the workshop (or its shop) was deactivated. */
  status: "ON_GOING" | "DEACTIVE";
}

/** The links of the guest, the affiliate fee of every shop (basis points) and the shop of every workshop (so the fee of a workshop without a link can be shown). */
export interface CustomerReferralsResponse { items: CustomerReferral[]; rates: Record<string, number>; shopOfWorkshop: Record<string, string> }

export const fetchCustomerReferrals = async (id: string, email?: string): Promise<CustomerReferralsResponse> =>
  parse(await fetch(`${url(id)}/referrals`, { headers: emailHeader(email), cache: "no-store" }));

/** The link of a workshop (a new one, or the one the guest already has). */
export const createCustomerReferral = async (id: string, email: string | undefined, workshopId: string): Promise<CustomerReferral> =>
  parse(await fetch(`${url(id)}/referrals`, { method: "POST", headers: { "content-type": "application/json", ...emailHeader(email) }, body: JSON.stringify({ workshopId }) }));

/** A friend the guest invited to register: the name and the masked email, when they registered, and the bonus earned on their first paid booking (0 until then). */
export interface CustomerInvite {
  id: string; name: string; email: string; registeredAt: string; status: "REGISTERED" | "EARNED"; bonus: number; bookingCode?: string; paidAt?: string;
}
/** The one invite link of the guest, the bonus rate (basis points of the original price of the friend's first paid booking) and the friends. */
export interface CustomerInvitesResponse { code: string; /** An administrator switched the code off: friends who register with it are not counted. */ disabled: boolean; link: string; bonusBps: number; currency: string; items: CustomerInvite[]; total: number }

export const fetchCustomerInvites = async (id: string, email?: string): Promise<CustomerInvitesResponse> =>
  parse(await fetch(`${url(id)}/invites`, { headers: emailHeader(email), cache: "no-store" }));

/** The two programs a guest earns from: the fee of the links of a workshop (AFFILIATE) and the bonus for the friends invited to register (REFERRAL). */
export type WalletSource = "AFFILIATE" | "REFERRAL";
export type WithdrawalStatus = "PENDING" | "PAID" | "REJECTED";
/** An invoice: a withdrawal the guest asked for. `reason` is why the platform rejected it. */
export interface CustomerWithdrawal { id: string; code: string; amount: number; currency: string; status: WithdrawalStatus; requestedAt: string; processedAt?: string; reason?: string; /** Where it is paid; the number is masked ("****6789"). */ bankName: string; accountNumberMasked: string; /** The name of the owner of the account. */ bankAccountHolder: string }
/** What the guest earned from a program (minor units), what waits to be paid, what was withdrawn, what is left to withdraw, and the invoices (newest first). */
export interface CustomerWallet { source: WalletSource; currency: string; earned: number; pending: number; withdrawn: number; available: number; /** The smallest and the largest amount of one withdrawal, set by the platform (0 = no limit). */ limits: { min: number; max: number }; items: CustomerWithdrawal[] }

export const fetchCustomerWallet = async (id: string, email: string | undefined, source: WalletSource): Promise<CustomerWallet> =>
  parse(await fetch(`${url(id)}/wallet?source=${source}`, { headers: emailHeader(email), cache: "no-store" }));

/** Where the platform pays a withdrawal (outside the system). */
export interface BankDetailsInput { bankName: string; bankAccountNumber: string; bankAccountHolder: string }

/** Asks to withdraw `amount` (minor units) to a bank account: a new invoice that waits for the platform. The server refuses more than is available (422, `fields.amount` = "exceeds") and bad bank details (`fields.bankName`, `fields.bankAccountNumber`, `fields.bankAccountHolder`). */
export const requestCustomerWithdrawal = async (id: string, email: string | undefined, source: WalletSource, amount: number, bank: BankDetailsInput): Promise<CustomerWithdrawal> =>
  parse(await fetch(`${url(id)}/withdrawals`, { method: "POST", headers: { "content-type": "application/json", ...emailHeader(email) }, body: JSON.stringify({ source, amount, ...bank }) }));

export const saveCustomerProfile = async (id: string, email: string | undefined, input: CustomerProfileInput): Promise<CustomerProfile> =>
  parse(await fetch(url(id), { method: "PATCH", headers: { "content-type": "application/json", ...emailHeader(email) }, body: JSON.stringify(input) }));
