import {
  renderBookingCancelled, renderBookingConfirmation, renderBookingInfo, renderPaymentReceived, renderSessionClosed, renderSessionRescheduled, renderShopBookingNotice,
  type BookingCancelledData, type BookingConfirmationData, type BookingInfoData, type PaymentReceivedData, type SessionClosedData, type SessionRescheduledData, type ShopBookingNoticeData,
} from "@workshop/shared";
import type { RenderedEmail } from "./email";
import { MESSAGES, asEmailLocale, type EditKind } from "./messages";

// The emails of the platform. Plain functions (no React Email yet).
// - About a booking (to the guest and to the shop): ONE email that holds the same message in six languages, one after the other (en, vi, th, zh, ko, ja), written by `@workshop/shared` (the
//   same renderers as the mock of the web app). Nothing is detected about the reader, so everybody gets the same email (REQUIREMENTS FR-MAIL-01).
// - About an account (a link to verify the email or to reset the password, a changed password, the code of a booking, a notice from the platform or the administrator): the words are in
//   `messages.ts` in the five languages of the platform, in the language of the account (`locale`; English when there is none).
// Everything that comes from a person is escaped in the HTML.
export type EmailTemplate = (
  | { name: "verify-email"; to: string; data: { name: string; link: string; hours: number } }
  | { name: "password-reset"; to: string; data: { name: string; link: string; hours: number } }
  | { name: "account-exists"; to: string; data: { name: string; loginLink: string; resetLink: string } }
  | { name: "password-changed"; to: string; data: { name: string } }
  | { name: "booking-otp"; to: string; data: { code: string; minutes: number; shop: string } }
  | { name: "booking-created"; to: string; data: BookingConfirmationData }
  /** The shop is told that a guest booked. */
  | { name: "booking-notice"; to: string; data: Omit<ShopBookingNoticeData, "kind"> }
  | { name: "booking-cancelled-guest"; to: string; data: BookingCancelledData }
  /** The shop is told that a guest cancelled. */
  | { name: "booking-cancelled-shop"; to: string; data: Omit<ShopBookingNoticeData, "kind"> }
  | { name: "booking-info"; to: string; data: BookingInfoData }
  | { name: "payment-received"; to: string; data: PaymentReceivedData }
  /** Written by a platform administrator: plain text (a blank line starts a paragraph), nothing in it is read as HTML. */
  | { name: "admin-message"; to: string; data: { name?: string; subject: string; body: string } }
  /** Told to a guest when the session of their booking is closed or moved. */
  | { name: "session-notice"; to: string; data: ({ kind: "CLOSED" } & SessionClosedData) | ({ kind: "RESCHEDULED" } & SessionRescheduledData) }
  /** Told to the owner of a shop when the platform administrator changes something of the shop on their behalf (D14, D15). */
  | { name: "admin-edit-notice"; to: string; data: { name: string; shop: string; what: string | { kind: EditKind; detail: string }; reason: string } }
) & { /** The language of the reader of an email about an account (en, vi, ko, ja, zh); anything else is read as English. */ locale?: string };

export const escapeHtml = (v: string): string => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const wrap = (body: string): string => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">${body}</div>`;
const button = (href: string, label: string): string => `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a></p>`;

export function renderEmail(t: EmailTemplate): RenderedEmail {
  const m = MESSAGES[asEmailLocale(t.locale)];
  const name = "name" in t.data ? escapeHtml(t.data.name ?? "") : "";
  const hello = "name" in t.data ? m.hello(t.data.name ?? "") : "";
  const helloHtml = "name" in t.data ? m.hello(name) : "";
  switch (t.name) {
    case "booking-created": return { to: t.to, ...renderBookingConfirmation(t.data) };
    case "booking-info": return { to: t.to, ...renderBookingInfo(t.data) };
    case "booking-cancelled-guest": return { to: t.to, ...renderBookingCancelled(t.data) };
    case "booking-notice": return { to: t.to, ...renderShopBookingNotice({ ...t.data, kind: "CREATED" }) };
    case "booking-cancelled-shop": return { to: t.to, ...renderShopBookingNotice({ ...t.data, kind: "CANCELLED_BY_GUEST" }) };
    case "payment-received": return { to: t.to, ...renderPaymentReceived(t.data) };
    case "session-notice": return { to: t.to, ...(t.data.kind === "RESCHEDULED" ? renderSessionRescheduled(t.data) : renderSessionClosed(t.data)) };
    case "verify-email":
      return {
        to: t.to, subject: m.verify.subject,
        text: `${hello}\n\n${m.verify.textIntro}\n${t.data.link}\n\n${m.verify.note(t.data.hours)}`,
        html: wrap(`<p>${helloHtml}</p><p>${escapeHtml(m.verify.htmlIntro)}</p>${button(t.data.link, m.verify.button)}<p>${escapeHtml(m.verify.note(t.data.hours))}</p>`),
      };
    case "password-reset":
      return {
        to: t.to, subject: m.reset.subject,
        text: `${hello}\n\n${m.reset.textIntro}\n${t.data.link}\n\n${m.reset.note(t.data.hours)}`,
        html: wrap(`<p>${helloHtml}</p><p>${escapeHtml(m.reset.htmlIntro)}</p>${button(t.data.link, m.reset.button)}<p>${escapeHtml(m.reset.note(t.data.hours))}</p>`),
      };
    case "account-exists":
      return {
        to: t.to, subject: m.exists.subject,
        text: `${hello}\n\n${m.exists.intro}\n${m.exists.loginLabel}: ${t.data.loginLink}\n${m.exists.forgotLabel}: ${t.data.resetLink}\n\n${m.exists.ignore}`,
        html: wrap(`<p>${helloHtml}</p><p>${escapeHtml(m.exists.intro)}</p>${button(t.data.loginLink, m.exists.loginLabel)}<p>${escapeHtml(m.exists.forgotQuestion)} <a href="${escapeHtml(t.data.resetLink)}">${escapeHtml(m.exists.resetLabel)}</a>. ${escapeHtml(m.exists.ignore)}</p>`),
      };
    case "booking-otp":
      return {
        to: t.to, subject: m.otp.subject(t.data.code),
        text: `${m.otp.text(t.data.shop, t.data.code)}\n\n${m.otp.note(t.data.minutes)}`,
        html: wrap(`<p>${escapeHtml(m.otp.htmlIntro(t.data.shop))}</p><p style="font-size:28px;letter-spacing:6px"><strong>${escapeHtml(t.data.code)}</strong></p><p>${escapeHtml(m.otp.note(t.data.minutes))}</p>`),
      };
    case "admin-message": {
      const subject = t.data.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || m.adminMessage.subject;
      const paragraphs = t.data.body.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      return {
        to: t.to, subject,
        text: `${t.data.name ? `${hello}\n\n` : ""}${paragraphs.join("\n\n")}`,
        html: wrap(`${t.data.name ? `<p>${helloHtml}</p>` : ""}${paragraphs.map((x) => `<p>${escapeHtml(x).replace(/\n/g, "<br>")}</p>`).join("")}`),
      };
    }
    case "admin-edit-notice": {
      const reason = t.data.reason.trim();
      const what = typeof t.data.what === "string" ? t.data.what : m.adminEdit.what(t.data.what.kind, t.data.what.detail);
      return {
        to: t.to, subject: m.adminEdit.subject(t.data.shop.replace(/[\r\n]+/g, " ")),
        text: `${hello}\n\n${m.adminEdit.body(what)}${reason ? `\n\n${m.adminEdit.reason}: ${reason}` : ""}\n\n${m.adminEdit.footer}`,
        html: wrap(`<p>${helloHtml}</p><p>${escapeHtml(m.adminEdit.body(what))}</p>${reason ? `<p>${m.adminEdit.reason}: ${escapeHtml(reason)}</p>` : ""}<p>${escapeHtml(m.adminEdit.footer)}</p>`),
      };
    }
    case "password-changed":
      return {
        to: t.to, subject: m.changed.subject,
        text: `${hello}\n\n${m.changed.body}`,
        html: wrap(`<p>${helloHtml}</p><p>${escapeHtml(m.changed.body)}</p>`),
      };
  }
}
