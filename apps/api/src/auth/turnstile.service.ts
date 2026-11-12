import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV } from "../config/env.module";
import type { Env } from "../config/env";

/** Cloudflare Turnstile (anti-bot on the public forms). Without a secret the check is skipped: only allowed outside production (config/env.ts refuses a production start without it). */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger("Turnstile");
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** True when the visitor passed (or the check is off). A failing or unreachable Cloudflare is "no": a bot check that cannot run must not let everybody through in production. */
  async verify(token: string | undefined, ip: string | null): Promise<boolean> {
    const secret = this.env.TURNSTILE_SECRET_KEY;
    if (!secret) return this.env.NODE_ENV !== "production";
    if (!token) return false;
    try {
      const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return false;
      return ((await res.json()) as { success?: boolean }).success === true;
    } catch (error) {
      this.logger.warn(`Turnstile could not be reached: ${error instanceof Error ? error.name : "error"}`);
      return false;
    }
  }
}
