import type { RenderedEmail } from "./email";

// The emails of the platform. Plain functions (no React Email yet: TODO(i18n, design) in REQUIREMENTS 2.2); English only for now. Everything that comes from a person is escaped in the HTML.
export type EmailTemplate =
  | { name: "verify-email"; to: string; data: { name: string; link: string; hours: number } }
  | { name: "password-reset"; to: string; data: { name: string; link: string; hours: number } }
  | { name: "account-exists"; to: string; data: { name: string; loginLink: string; resetLink: string } }
  | { name: "password-changed"; to: string; data: { name: string } }
  | { name: "booking-otp"; to: string; data: { code: string; minutes: number; shop: string } }
  | { name: "booking-created"; to: string; data: BookingMailData & { name: string; confirmLink: string } }
  | { name: "booking-notice"; to: string; data: BookingMailData & { guestName: string; guestEmail: string; guestPhone: string; request: string } }
  | { name: "booking-cancelled-guest"; to: string; data: BookingMailData & { name: string; by: "GUEST" | "SHOP"; reason: string } }
  | { name: "booking-cancelled-shop"; to: string; data: BookingMailData & { guestName: string; reason: string } }
  | { name: "booking-info"; to: string; data: BookingMailData & { name: string } }
  | { name: "payment-received"; to: string; data: BookingMailData & { name: string; paid: string } }
  /** Written by a platform administrator: plain text (a blank line starts a paragraph), nothing in it is read as HTML. */
  | { name: "admin-message"; to: string; data: { name?: string; subject: string; body: string } }
  /** Told to a guest when the session of their booking is closed or moved. The reason is plain text. */
  | { name: "session-notice"; to: string; data: BookingMailData & { name: string; kind: "CLOSED" | "RESCHEDULED"; reason: string; previousWhen?: string } }
  /** Told to the owner of a shop when the platform administrator changes something of the shop on their behalf (D14, D15). */
  | { name: "admin-edit-notice"; to: string; data: { name: string; shop: string; what: string; reason: string } };

/** What every booking email says about the booking: already formatted (the time in the time zone of the shop, the money with its currency). */
export interface BookingMailData { shop: string; code: string; workshop: string; when: string; timezone: string; quantity: number; total: string; address: string }

/** BR-09: shown in the booking form, on the confirmation page and in the emails. */
export const LATE_POLICY = "Please arrive on time for your workshop. If you arrive more than 30 minutes late, your booking may be released and your reserved spot may be offered to walk-in guests. If there are still available spots when you arrive, you may still be able to join.";

const details = (d: BookingMailData): string => `Workshop: ${d.workshop}
When: ${d.when} (${d.timezone})
Guests: ${d.quantity}
Total: ${d.total} (pay at the studio)
Booking code: ${d.code}${d.address ? `
Where: ${d.address}` : ""}`;
const detailsHtml = (d: BookingMailData): string => `<p>${[`Workshop: <strong>${escapeHtml(d.workshop)}</strong>`, `When: ${escapeHtml(d.when)} (${escapeHtml(d.timezone)})`, `Guests: ${d.quantity}`, `Total: ${escapeHtml(d.total)} (pay at the studio)`, `Booking code: <strong>${escapeHtml(d.code)}</strong>`, ...(d.address ? [`Where: ${escapeHtml(d.address)}`] : [])].join("<br>")}</p>`;

export const escapeHtml = (v: string): string => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const wrap = (body: string): string => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">${body}</div>`;
const button = (href: string, label: string): string => `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a></p>`;

export function renderEmail(t: EmailTemplate): RenderedEmail {
  const name = "name" in t.data ? escapeHtml(t.data.name ?? "") : "";
  switch (t.name) {
    case "verify-email":
      return {
        to: t.to, subject: "Confirm your email",
        text: `Hello ${t.data.name},\n\nConfirm your email to finish creating your account:\n${t.data.link}\n\nThe link works for ${t.data.hours} hours. If you did not sign up, ignore this email.`,
        html: wrap(`<p>Hello ${name},</p><p>Confirm your email to finish creating your account.</p>${button(t.data.link, "Confirm email")}<p>The link works for ${t.data.hours} hours. If you did not sign up, ignore this email.</p>`),
      };
    case "password-reset":
      return {
        to: t.to, subject: "Reset your password",
        text: `Hello ${t.data.name},\n\nChoose a new password here:\n${t.data.link}\n\nThe link works for ${t.data.hours} hours and only once. If you did not ask for it, ignore this email: your password is unchanged.`,
        html: wrap(`<p>Hello ${name},</p><p>Choose a new password.</p>${button(t.data.link, "Choose a new password")}<p>The link works for ${t.data.hours} hours and only once. If you did not ask for it, ignore this email: your password is unchanged.</p>`),
      };
    case "account-exists":
      return {
        to: t.to, subject: "You already have an account",
        text: `Hello ${t.data.name},\n\nSomeone tried to sign up with this email, but it already has an account.\nLog in: ${t.data.loginLink}\nForgot your password: ${t.data.resetLink}\n\nIf it was not you, ignore this email.`,
        html: wrap(`<p>Hello ${name},</p><p>Someone tried to sign up with this email, but it already has an account.</p>${button(t.data.loginLink, "Log in")}<p>Forgot your password? <a href="${escapeHtml(t.data.resetLink)}">Reset it</a>. If it was not you, ignore this email.</p>`),
      };
    case "booking-otp":
      return {
        to: t.to, subject: `Your booking code: ${t.data.code}`,
        text: `Your code to confirm a booking at ${t.data.shop} is ${t.data.code}.

It works for ${t.data.minutes} minutes. If you did not ask for it, ignore this email.`,
        html: wrap(`<p>Your code to confirm a booking at ${escapeHtml(t.data.shop)} is:</p><p style="font-size:28px;letter-spacing:6px"><strong>${escapeHtml(t.data.code)}</strong></p><p>It works for ${t.data.minutes} minutes. If you did not ask for it, ignore this email.</p>`),
      };
    case "booking-created":
      return {
        to: t.to, subject: `Your booking ${t.data.code} at ${t.data.shop}`,
        text: `Hello ${t.data.name},

Your spot is reserved. Please confirm your booking:
${t.data.confirmLink}

${details(t.data)}

${LATE_POLICY}

To change or cancel the booking, use your booking code and email on the studio's page, or contact the studio.`,
        html: wrap(`<p>Hello ${name},</p><p>Your spot is reserved. Please confirm your booking.</p>${button(t.data.confirmLink, "Confirm booking")}${detailsHtml(t.data)}<p>${escapeHtml(LATE_POLICY)}</p><p>To change or cancel the booking, use your booking code and email on the studio's page, or contact the studio.</p>`),
      };
    case "booking-notice":
      return {
        to: t.to, subject: `New booking ${t.data.code}`,
        text: `${t.data.guestName} (${t.data.guestEmail}${t.data.guestPhone ? `, ${t.data.guestPhone}` : ""}) booked ${t.data.workshop}.

${details(t.data)}${t.data.request ? `
Request: ${t.data.request}` : ""}`,
        html: wrap(`<p>${escapeHtml(t.data.guestName)} (${escapeHtml(t.data.guestEmail)}${t.data.guestPhone ? `, ${escapeHtml(t.data.guestPhone)}` : ""}) booked ${escapeHtml(t.data.workshop)}.</p>${detailsHtml(t.data)}${t.data.request ? `<p>Request: ${escapeHtml(t.data.request)}</p>` : ""}`),
      };
    case "booking-cancelled-guest":
      return {
        to: t.to, subject: `Booking ${t.data.code} cancelled`,
        text: `Hello ${t.data.name},

Your booking was cancelled${t.data.by === "SHOP" ? " by the studio" : ""}.${t.data.reason ? `
Reason: ${t.data.reason}` : ""}

${details(t.data)}`,
        html: wrap(`<p>Hello ${name},</p><p>Your booking was cancelled${t.data.by === "SHOP" ? " by the studio" : ""}.${t.data.reason ? ` Reason: ${escapeHtml(t.data.reason)}` : ""}</p>${detailsHtml(t.data)}`),
      };
    case "booking-cancelled-shop":
      return {
        to: t.to, subject: `Booking ${t.data.code} cancelled by the guest`,
        text: `${t.data.guestName} cancelled a booking.${t.data.reason ? `
Reason: ${t.data.reason}` : ""}

${details(t.data)}`,
        html: wrap(`<p>${escapeHtml(t.data.guestName)} cancelled a booking.${t.data.reason ? ` Reason: ${escapeHtml(t.data.reason)}` : ""}</p>${detailsHtml(t.data)}`),
      };
    case "booking-info":
      return {
        to: t.to, subject: `Your booking ${t.data.code} at ${t.data.shop}`,
        text: `Hello ${t.data.name},

The studio booked a spot for you.

${details(t.data)}

${LATE_POLICY}`,
        html: wrap(`<p>Hello ${name},</p><p>The studio booked a spot for you.</p>${detailsHtml(t.data)}<p>${escapeHtml(LATE_POLICY)}</p>`),
      };
    case "payment-received":
      return {
        to: t.to, subject: `Payment received for booking ${t.data.code}`,
        text: `Hello ${t.data.name},

The studio received your payment of ${t.data.paid}. Thank you!

${details(t.data)}`,
        html: wrap(`<p>Hello ${name},</p><p>The studio received your payment of ${escapeHtml(t.data.paid)}. Thank you!</p>${detailsHtml(t.data)}`),
      };
    case "admin-message": {
      const subject = t.data.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "A message from the platform";
      const paragraphs = t.data.body.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
      return {
        to: t.to, subject,
        text: `${t.data.name ? `Hello ${t.data.name},\n\n` : ""}${paragraphs.join("\n\n")}`,
        html: wrap(`${t.data.name ? `<p>Hello ${name},</p>` : ""}${paragraphs.map((x) => `<p>${escapeHtml(x).replace(/\n/g, "<br>")}</p>`).join("")}`),
      };
    }
    case "session-notice": {
      const reason = t.data.reason.trim();
      const moved = t.data.kind === "RESCHEDULED";
      const intro = moved ? "The studio moved the session of your booking to a new time. Your booking stays valid." : "The studio closed the session of your booking, so it will not take place.";
      const next = moved ? `If the new time does not suit you, you can cancel your booking with its code and your email, or contact the studio.` : "Please contact the studio about your booking.";
      return {
        to: t.to, subject: moved ? `Your workshop at ${t.data.shop} was moved (${t.data.code})` : `Your workshop at ${t.data.shop} was closed (${t.data.code})`,
        text: `Hello ${t.data.name},\n\n${intro}${reason ? `\nReason: ${reason}` : ""}${moved && t.data.previousWhen ? `\nBefore: ${t.data.previousWhen}` : ""}\n\n${details(t.data)}\n\n${next}`,
        html: wrap(`<p>Hello ${name},</p><p>${intro}${reason ? ` Reason: ${escapeHtml(reason)}.` : ""}</p>${moved && t.data.previousWhen ? `<p>Before: ${escapeHtml(t.data.previousWhen)}</p>` : ""}${detailsHtml(t.data)}<p>${next}</p>`),
      };
    }
    case "admin-edit-notice": {
      const reason = t.data.reason.trim();
      return {
        to: t.to, subject: `The platform changed your shop ${t.data.shop.replace(/[\r\n]+/g, " ")}`,
        text: `Hello ${t.data.name},\n\nA platform administrator changed ${t.data.what}.${reason ? `\n\nReason: ${reason}` : ""}\n\nYou can see and change it in your dashboard; the latest save wins.`,
        html: wrap(`<p>Hello ${name},</p><p>A platform administrator changed ${escapeHtml(t.data.what)}.</p>${reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ""}<p>You can see and change it in your dashboard; the latest save wins.</p>`),
      };
    }
    case "password-changed":
      return {
        to: t.to, subject: "Your password was changed",
        text: `Hello ${t.data.name},\n\nThe password of your account was just changed and every device was logged out. If it was not you, reset your password at once.`,
        html: wrap(`<p>Hello ${name},</p><p>The password of your account was just changed and every device was logged out. If it was not you, reset your password at once.</p>`),
      };
  }
}
