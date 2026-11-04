import type { Gender, Locale, Socials } from "@workshop/shared";

// Browser side of the account of a guest (/api/v1/customer/{id}). The guest is identified by the email of the login, sent in the `x-guest-email` header.
// TODO(api): the guest session is a cookie; no email is sent.

export interface CustomerProfile {
  id: string; fullName: string; email: string; phone?: string; preferredLocale: Locale;
  account: { country: string; birthDate: string; gender?: Gender; socials?: Socials; avatarUrl?: string };
}

/** What the guest can change (the email cannot). Whatever is left out is removed from the profile. */
export interface CustomerProfileInput {
  fullName: string; phone?: string; preferredLocale: Locale; country: string; birthDate: string; gender?: Gender; socials?: Socials; avatarUrl?: string;
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

export const saveCustomerProfile = async (id: string, email: string | undefined, input: CustomerProfileInput): Promise<CustomerProfile> =>
  parse(await fetch(url(id), { method: "PATCH", headers: { "content-type": "application/json", ...emailHeader(email) }, body: JSON.stringify(input) }));
