// SERVER-ONLY: signing up from the public site (the popup Sign up): a customer with an email and a password, or a shop owner with an email, a password and the name of the shop (the slug of
// the shop comes from the name). Both are logged in at once by the caller. Mock until apps/api exists. TODO(api): the verification of the email, Turnstile, one transaction.
import { checkPassword } from "@workshop/shared";
import { findAccountByEmail, setPassword, type Account } from "./accounts-store";
import { registerGuestAccount } from "./booking-store";
import { currentShop } from "./data";
import { registerShop } from "./registered-shops-store";

export type SignupResult = { ok: true; account: Account } | { ok: false; code: "EMAIL_TAKEN" | "WEAK_PASSWORD" };

const nameOf = (email: string) => email.split("@")[0]!;

/** A customer: the name is the first part of the email and the profile (country, date of birth, favorite categories) is completed by the customer in My Profile. */
export function signupCustomer(input: { email: string; password: string }): SignupResult {
  if (checkPassword(input.password) !== "OK") return { ok: false, code: "WEAK_PASSWORD" };
  const email = input.email.trim().toLowerCase();
  if (findAccountByEmail(email)) return { ok: false, code: "EMAIL_TAKEN" };
  const res = registerGuestAccount({ email, fullName: nameOf(email), country: currentShop.country, birthDate: "", categories: [], consentAt: new Date().toISOString() });
  if (!res.ok) return { ok: false, code: "EMAIL_TAKEN" };
  setPassword(res.customerId, input.password);
  return { ok: true, account: findAccountByEmail(email)! };
}

/** A shop owner: the shop is created (DRAFT) with the slug made from its name, and the owner of it is this account. */
export function signupShopOwner(input: { email: string; password: string; shopName: string }): SignupResult {
  if (checkPassword(input.password) !== "OK") return { ok: false, code: "WEAK_PASSWORD" };
  const email = input.email.trim().toLowerCase();
  if (findAccountByEmail(email)) return { ok: false, code: "EMAIL_TAKEN" };
  const shop = registerShop({ name: input.shopName, ownerEmail: email, ownerName: nameOf(email) });
  const account = findAccountByEmail(email)!;
  setPassword(account.id, input.password);
  void shop;
  return { ok: true, account };
}
