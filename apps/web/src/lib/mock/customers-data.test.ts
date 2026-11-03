import { describe, expect, it } from "vitest";
import { isDayKey } from "@workshop/shared";
import { bookings, customers } from "./data";

// Country and birth date come from the account of a customer; a guest who only booked has no account and so neither.

describe("demo customers", () => {
  it("a customer with an account has a country code and a real birth date in the past", () => {
    for (const c of customers.filter((x) => x.account)) {
      expect(c.account!.country, c.id).toMatch(/^[A-Z]{2}$/);
      expect(isDayKey(c.account!.birthDate), c.id).toBe(true);
      expect(c.account!.birthDate < new Date().toISOString().slice(0, 10), c.id).toBe(true);
    }
  });
  it("there are customers with an account, and guests who only booked (with an email, and without one)", () => {
    expect(customers.some((c) => c.account)).toBe(true);
    expect(customers.some((c) => !c.account && c.email)).toBe(true);
    expect(customers.some((c) => !c.account && !c.email)).toBe(true);
  });
  it("every customer has at least one booking", () => {
    for (const c of customers) expect(bookings.some((b) => b.customerId === c.id), c.id).toBe(true);
  });
});
