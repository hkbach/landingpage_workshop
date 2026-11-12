import type { RenderedEmail } from "./email";

// The emails of the platform. Plain functions (no React Email yet: TODO(i18n, design) in REQUIREMENTS 2.2); English only for now. Everything that comes from a person is escaped in the HTML.
export type EmailTemplate =
  | { name: "verify-email"; to: string; data: { name: string; link: string; hours: number } }
  | { name: "password-reset"; to: string; data: { name: string; link: string; hours: number } }
  | { name: "account-exists"; to: string; data: { name: string; loginLink: string; resetLink: string } }
  | { name: "password-changed"; to: string; data: { name: string } };

export const escapeHtml = (v: string): string => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const wrap = (body: string): string => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">${body}</div>`;
const button = (href: string, label: string): string => `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a></p>`;

export function renderEmail(t: EmailTemplate): RenderedEmail {
  const name = escapeHtml(t.data.name);
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
    case "password-changed":
      return {
        to: t.to, subject: "Your password was changed",
        text: `Hello ${t.data.name},\n\nThe password of your account was just changed and every device was logged out. If it was not you, reset your password at once.`,
        html: wrap(`<p>Hello ${name},</p><p>The password of your account was just changed and every device was logged out. If it was not you, reset your password at once.</p>`),
      };
  }
}
