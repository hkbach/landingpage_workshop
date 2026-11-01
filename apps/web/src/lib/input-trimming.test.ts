import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReportSchema, financeEntrySchema, trimDeep } from "@workshop/shared";
import { bookingContactSchema } from "@/components/booking/schema";

// BR-16: a person may type spaces at both ends of a text box; every text is trimmed when the form is submitted.

const SRC = join(process.cwd(), "src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("the guest booking form", () => {
  const ok = { fullName: "Linh", email: "linh@example.com", country: "VN", phone: "+84 90 000 0000", specialRequest: "", consent: true };
  it("trims the name, email, phone and request", () => {
    const r = bookingContactSchema.safeParse({ ...ok, fullName: "  Linh Tran  ", email: "  linh@example.com ", phone: " +84 90 000 0000 ", specialRequest: "\n Vegetarian snacks \t" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ fullName: "Linh Tran", email: "linh@example.com", phone: "+84 90 000 0000", specialRequest: "Vegetarian snacks" });
  });
  it("a name of only spaces is empty, and the 500 characters of the request are counted without the spaces at the ends", () => {
    expect(bookingContactSchema.safeParse({ ...ok, fullName: "    " }).error?.issues[0]?.message).toBe("required");
    expect(bookingContactSchema.safeParse({ ...ok, specialRequest: ` ${"x".repeat(500)} ` }).success).toBe(true);
    expect(bookingContactSchema.safeParse({ ...ok, specialRequest: "x".repeat(501) }).success).toBe(false);
    expect(bookingContactSchema.safeParse({ ...ok, phone: "   " }).error?.issues[0]?.message).toBe("required"); // the phone number is required
  });
});

describe("the report form", () => {
  it("trims the description and the email", () => {
    const r = createReportSchema.safeParse({ reason: "SCAM", description: "   They charged my card twice at the studio.  ", email: "  me@example.com " });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ description: "They charged my card twice at the studio.", email: "me@example.com" });
  });
  it("counts the minimum length without the spaces", () => {
    expect(createReportSchema.safeParse({ reason: "SCAM", description: "      short      " }).success).toBe(false);
  });
});

describe("the income and expenses form", () => {
  it("trims the note", () => {
    const r = financeEntrySchema.safeParse({ type: "EXPENSE", category: "RENT", amount: 100, date: "2026-10-05", note: "   Studio rent  " });
    expect(r.data?.note).toBe("Studio rent");
  });
});

describe("a whole page of the builder", () => {
  it("is trimmed text by text when it is published", () => {
    const page = { seo: { title: { en: " Clay & Co " } }, sections: [{ props: { heading: { en: " About us " }, items: [{ q: { en: " Q? " } }], count: 3 } }] };
    expect(trimDeep(page)).toEqual({ seo: { title: { en: "Clay & Co" } }, sections: [{ props: { heading: { en: "About us" }, items: [{ q: { en: "Q?" } }], count: 3 } }] });
  });
});

describe("typing", () => {
  it("is never changed while it happens: no text box trims in its onChange", () => {
    const offenders = files(SRC).filter((f) => /onChange=\{[^}\n]*\.trim(Start|End)?\(\)/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
  it("is not undone by the browser: a box that React controls is never type=email or type=url (the browser strips spaces at the ends of those)", () => {
    const offenders = files(SRC).filter((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/<Input\b[\s\S]*?\/>/g)].some(([chunk]) => /type="(email|url)"/.test(chunk) && /\bvalue=\{/.test(chunk));
    });
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
