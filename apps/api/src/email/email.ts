import { createTransport } from "nodemailer";
import type { Env } from "../config/env";

export interface RenderedEmail { to: string; subject: string; text: string; html: string }

/** How an email leaves the platform (REQUIREMENTS 2.2: an EmailProvider interface; Mailpit in development, Resend in production). */
export interface EmailProvider {
  send(email: RenderedEmail): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

/** Development: SMTP to Mailpit (nothing leaves the machine; the mails are read at http://127.0.0.1:8025). */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  constructor(private readonly from: string, host: string, port: number) {
    this.transport = createTransport({ host, port, secure: false, ignoreTLS: true, connectionTimeout: 5_000, socketTimeout: 10_000 });
  }

  async send(email: RenderedEmail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: email.to, subject: email.subject, text: email.text, html: email.html });
  }
}

/** Production: the Resend HTTP API. The key goes in the Authorization header only, and an error never repeats the response body (it may echo the address). */
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly from: string, private readonly apiKey: string) {}

  async send(email: RenderedEmail): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  }
}

/** Tests: keeps the emails in memory, and can be told to fail. */
export class MemoryEmailProvider implements EmailProvider {
  readonly sent: RenderedEmail[] = [];
  failWith: Error | null = null;

  async send(email: RenderedEmail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(email);
  }
}

export function createEmailProvider(env: Pick<Env, "EMAIL_PROVIDER" | "EMAIL_FROM" | "SMTP_HOST" | "SMTP_PORT" | "RESEND_API_KEY">): EmailProvider {
  return env.EMAIL_PROVIDER === "resend" ? new ResendEmailProvider(env.EMAIL_FROM, env.RESEND_API_KEY ?? "") : new SmtpEmailProvider(env.EMAIL_FROM, env.SMTP_HOST, env.SMTP_PORT);
}
