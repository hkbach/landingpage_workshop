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
  | { name: "booking-cancelled-shop"; to: string; data: BookingMailData & { guestName: string; reason: string } };

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
  const name = "name" in t.data ? escapeHtml(t.data.name) : "";
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
    case "password-changed":
      return {
        to: t.to, subject: "Your password was changed",
        text: `Hello ${t.data.name},\n\nThe password of your account was just changed and every device was logged out. If it was not you, reset your password at once.`,
        html: wrap(`<p>Hello ${name},</p><p>The password of your account was just changed and every device was logged out. If it was not you, reset your password at once.</p>`),
      };
  }
}
