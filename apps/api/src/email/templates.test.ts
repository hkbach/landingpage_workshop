import { EMAIL_LANGS } from "@workshop/shared";
import { describe, expect, it } from "vitest";
import { bookingFacts, titleOf } from "./booking-facts";
import { MESSAGES, EMAIL_LOCALES, asEmailLocale } from "./messages";
import { renderEmail, type EmailTemplate } from "./templates";

const facts = { guestName: "Ava <b>Tran</b>", shopName: "Whisk & Ladle", bookingCode: "SES-0001-001", workshopTitle: "Pasta <i>class</i>", startsAt: "2026-11-14T03:00:00Z", endsAt: "2026-11-14T05:00:00Z", timezone: "Asia/Ho_Chi_Minh", quantity: 2, totalAmount: 5_000_000, currency: "VND", address: "1 Main St" };
const notice = { shopName: facts.shopName, guestName: facts.guestName, guestEmail: "ava@x.example", bookingCode: facts.bookingCode, workshopTitle: facts.workshopTitle, startsAt: facts.startsAt, endsAt: facts.endsAt, timezone: facts.timezone, quantity: 2, totalAmount: 5_000_000, currency: "VND" };

/** The emails about a booking: one of each, so a new one cannot be forgotten. */
const bookingMails = (): EmailTemplate[] => [
  { name: "booking-created", to: "a@x.example", data: { ...facts, confirmUrl: "https://shop.example/booking/confirm/abc" } },
  { name: "booking-info", to: "a@x.example", data: facts },
  { name: "booking-cancelled-guest", to: "a@x.example", data: { guestName: facts.guestName, shopName: facts.shopName, bookingCode: facts.bookingCode, workshopTitle: facts.workshopTitle, startsAt: facts.startsAt, endsAt: facts.endsAt, timezone: facts.timezone, quantity: 2, byGuest: false, reason: "Sorry" } },
  { name: "booking-notice", to: "a@x.example", data: notice },
  { name: "booking-cancelled-shop", to: "a@x.example", data: { ...notice, reason: "Plans changed" } },
  { name: "payment-received", to: "a@x.example", data: { guestName: facts.guestName, shopName: facts.shopName, bookingCode: facts.bookingCode, workshopTitle: facts.workshopTitle, startsAt: facts.startsAt, endsAt: facts.endsAt, timezone: facts.timezone, quantity: 2, totalAmount: 5_000_000, currency: "VND" } },
  { name: "session-notice", to: "a@x.example", data: { kind: "RESCHEDULED", guestName: facts.guestName, shopName: facts.shopName, bookingCode: facts.bookingCode, workshopTitle: facts.workshopTitle, timezone: facts.timezone, oldStartsAt: "2026-11-13T03:00:00Z", newStartsAt: facts.startsAt, newEndsAt: facts.endsAt, reason: { code: "VENUE_ISSUE" } } },
  { name: "session-notice", to: "a@x.example", data: { kind: "CLOSED", guestName: facts.guestName, shopName: facts.shopName, bookingCode: facts.bookingCode, workshopTitle: facts.workshopTitle, timezone: facts.timezone, startsAt: facts.startsAt, endsAt: facts.endsAt, reason: { code: "OTHER", note: "<script>x</script> we are sick" } } },
];

/** The emails about an account, in a language. */
const accountMails = (locale?: string): EmailTemplate[] => {
  const l = locale === undefined ? {} : { locale };
  return [
    { name: "verify-email", to: "a@x.example", ...l, data: { name: "Ava", link: "https://app.example/verify?t=1", hours: 48 } },
    { name: "password-reset", to: "a@x.example", ...l, data: { name: "Ava", link: "https://app.example/reset?t=1", hours: 24 } },
    { name: "account-exists", to: "a@x.example", ...l, data: { name: "Ava", loginLink: "https://app.example/login", resetLink: "https://app.example/forgot" } },
    { name: "password-changed", to: "a@x.example", ...l, data: { name: "Ava" } },
    { name: "booking-otp", to: "a@x.example", ...l, data: { code: "123456", minutes: 10, shop: "Whisk & Ladle" } },
    { name: "admin-message", to: "a@x.example", ...l, data: { name: "Ava", subject: "Maintenance", body: "We will be back soon.\n\nThank you." } },
    { name: "admin-edit-notice", to: "a@x.example", ...l, data: { name: "Ava", shop: "Whisk & Ladle", what: { kind: "SESSION_MOVED", detail: "S-0001" }, reason: "Venue closed" } },
  ];
};

describe("the emails about a booking", () => {
  it("hold the same message in six languages, one after the other, with a subject of six titles", () => {
    for (const t of bookingMails()) {
      const mail = renderEmail(t);
      expect(mail.subject.split(" | "), t.name).toHaveLength(6);
      for (const lang of EMAIL_LANGS) expect(mail.html, `${t.name} ${lang}`).toContain(`id="lang-${lang}"`);
      for (const name of ["English", "Tiếng Việt", "ภาษาไทย", "中文", "한국어", "日本語"]) expect(mail.text, t.name).toContain(name);
      expect(mail.text, t.name).toContain(facts.bookingCode);
    }
  });

  it("give the guest the link, the late policy and the details, and the shop the guest and the amount", () => {
    const created = renderEmail(bookingMails()[0]!);
    expect(created.html).toContain('href="https://shop.example/booking/confirm/abc"');
    expect(created.text).toContain("Please arrive on time"); // BR-09, in English and in the five other languages
    expect(created.text).toContain("Vui lòng đến đúng giờ");
    expect(created.text).toContain("โปรดมาถึงตรงเวลา");
    expect(created.text).toContain("정시에 도착해 주세요");
    const shop = renderEmail(bookingMails()[3]!);
    expect(shop.text).toContain("ava@x.example");
    expect(renderEmail(bookingMails()[4]!).text).toContain("Plans changed");
  });

  it("tell a reason of the platform in each language and keep the words the shop typed as they are, escaped in the HTML", () => {
    const moved = renderEmail(bookingMails()[6]!);
    expect(moved.text).toContain("Studio or venue problem");
    expect(moved.text).toContain("Sự cố studio hoặc địa điểm");
    const closed = renderEmail(bookingMails()[7]!);
    expect(closed.text).toContain("<script>x</script> we are sick");
    expect(closed.html).not.toContain("<script>x");
    expect(closed.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(closed.html).not.toContain("<b>Tran</b>"); // a name is escaped too
  });

  it("take the facts from the booking in the default language of the shop, and from the session when it moved", () => {
    const snap = { workshopTitle: { vi: "Mì ý", en: "Pasta" }, startsAt: "2026-11-14T03:00:00Z", endsAt: "2026-11-14T05:00:00Z", timezone: "UTC", address: "1 St" };
    const b = { guestName: "Ava", bookingCode: "C-1", quantity: 1, totalAmount: 100, currency: "USD", snapshot: snap };
    expect(bookingFacts({ name: "S", defaultLocale: "vi" }, b).workshopTitle).toBe("Mì ý");
    expect(bookingFacts({ name: "S", defaultLocale: "ko" }, b).workshopTitle).toBe("Pasta");
    expect(titleOf({ vi: "Mì ý" }, "ko")).toBe("Mì ý");
    expect(bookingFacts({ name: "S", defaultLocale: "en" }, b, { startsAt: new Date("2026-11-20T01:00:00Z"), endsAt: new Date("2026-11-20T02:00:00Z") })).toMatchObject({ startsAt: "2026-11-20T01:00:00.000Z", endsAt: "2026-11-20T02:00:00.000Z" });
  });
});

describe("the emails about an account", () => {
  it("have a complete catalog for every language: the same words, none left empty", () => {
    for (const l of EMAIL_LOCALES) {
      const flat = JSON.stringify(MESSAGES[l], (_k, v: unknown) => (typeof v === "function" ? (v as (...a: string[]) => string)("x", "y", "z") : v));
      expect(flat, l).not.toMatch(/:""/);
    }
  });

  it("render in every language with their links and numbers, and differ from English in the fixed words", () => {
    const english = accountMails("en").map((t) => renderEmail(t).subject);
    for (const l of EMAIL_LOCALES) {
      accountMails(l).forEach((t, i) => {
        const mail = renderEmail(t);
        expect(mail.subject.trim().length, `${t.name} ${l}`).toBeGreaterThan(3);
        expect(mail.html, `${t.name} ${l}`).toContain("<div");
        if ("link" in t.data) expect(mail.text).toContain(t.data.link);
        // (the subject of a message an administrator wrote is theirs, not ours)
        if (l !== "en" && t.name !== "admin-message") expect(mail.subject, `${t.name} ${l}`).not.toBe(english[i]);
      });
    }
  });

  it("read a missing or unknown language as English, and keep the English wording of before", () => {
    expect(asEmailLocale(undefined)).toBe("en");
    expect(asEmailLocale("fr")).toBe("en");
    expect(renderEmail(accountMails()[0]!).subject).toBe("Confirm your email");
    expect(renderEmail({ ...accountMails()[0]!, locale: "fr" }).subject).toBe("Confirm your email");
    expect(renderEmail(accountMails("en")[4]!).subject).toBe("Your booking code"); // (never the code itself: the subject is kept in the outbox and shown to administrators)
  });

  it("tell each language in its own words", () => {
    expect(renderEmail(accountMails("vi")[0]!).subject).toBe("Xác nhận email của bạn");
    expect(renderEmail(accountMails("ko")[0]!).subject).toBe("이메일을 확인해 주세요");
    expect(renderEmail(accountMails("ja")[0]!).subject).toBe("メールアドレスの確認");
    expect(renderEmail(accountMails("zh")[0]!).subject).toBe("请确认您的邮箱");
    expect(renderEmail(accountMails("vi")[6]!).text).toContain("buổi học S-0001 của shop bạn: đã được dời");
  });

  it("tell the owner of every kind of change an administrator makes, in each of the five languages, with the reason", () => {
    const kinds = ["SHOP_SETTINGS", "WORKSHOP_ACTIVATED", "WORKSHOP_DEACTIVATED", "WORKSHOP_CHANGED", "SESSION_CLOSED", "SESSION_REOPENED", "SESSION_MOVED", "SESSION_CHANGED", "LANDING_PAGE_PUBLISHED", "LANDING_PAGE_DRAFT_SAVED", "LANDING_PAGE_CREATED"] as const;
    for (const locale of ["en", "vi", "ko", "ja", "zh"] as const) {
      const sentences = new Set<string>();
      for (const kind of kinds) {
        const mail = renderEmail({ name: "admin-edit-notice", to: "a@x.example", locale, data: { name: "Ava", shop: "Whisk", what: { kind, detail: "D-1" }, reason: "Fixing the hours" } });
        expect(mail.text, `${locale} ${kind}`).toContain("Fixing the hours");
        expect(mail.text, `${locale} ${kind}`).not.toContain("undefined");
        sentences.add(mail.text);
      }
      expect(sentences.size, `${locale}: each kind has its own sentence`).toBe(kinds.length);
    }
  });

  it("escape a name in the HTML, and still render an old queued email that carries the sentence of what was changed", () => {
    expect(renderEmail({ name: "password-changed", to: "a@x.example", locale: "zh", data: { name: "<img src=x onerror=1>" } }).html).not.toContain("<img");
    const old = renderEmail({ name: "admin-edit-notice", to: "a@x.example", locale: "vi", data: { name: "Ava", shop: "S", what: "the session S-1 of your shop: it was closed", reason: "" } });
    expect(old.text).toContain("the session S-1 of your shop: it was closed");
  });
});
