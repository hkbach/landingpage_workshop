import { existsSync } from "node:fs";
import { z } from "zod";
import { DEV_APP_SECRET } from "../common/secrets";

// The settings of the API, read once from the environment (and from apps/api/.env in development). A missing or wrong value stops the start with a clear message, and the
// values are never printed: a DATABASE_URL carries the password of the database.
const bool = (fallback: boolean) =>
  z.enum(["true", "false", "1", "0"]).optional().transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required").refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must start with postgres://"),

    // Where the web app lives: the origin the browser sends in `Origin` (CSRF check) and the base of the links in the emails.
    APP_URL: z.url().default("http://app.localtest.me:3000"),
    /** The domain the landing pages live under: a shop is at `{slug}.{PLATFORM_DOMAIN}` (same scheme and port as APP_URL). Used for the links of the emails sent to guests. */
    PLATFORM_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i, "invalid").default("localtest.me"),
    SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).default("wsp_sid"),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    /** How many reverse proxies stand in front of the API (0 = none: the client is the socket). Never trust a header the client can write. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /** On: a new account must verify its email before it can log in, and signing up never says whether an email is taken (D2, D3). Off in development so the demo works without a mailbox. */
    REQUIRE_EMAIL_VERIFICATION: bool(false),
    EMAIL_VERIFY_HOURS: z.coerce.number().int().min(1).max(168).default(48),
    RESET_LINK_HOURS: z.coerce.number().int().min(1).max(168).default(24),

    EMAIL_PROVIDER: z.enum(["mailpit", "resend"]).default("mailpit"),
    EMAIL_FROM: z.string().min(3).default("Workshop Platform <bookings@localtest.me>"),
    SMTP_HOST: z.string().default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    RESEND_API_KEY: z.string().optional(),

    /** The application secret: the pepper of the codes sent by email and the key of the encrypted columns (bank account numbers). At least 32 characters, random, kept in the secret store of the environment. A change makes the encrypted values unreadable. A development default exists; production refuses it. */
    APP_SECRET: z.string().min(32, "APP_SECRET must have at least 32 characters").default(DEV_APP_SECRET),

    /** Cloudflare Turnstile secret. Empty: the check is skipped (development only). */
    TURNSTILE_SECRET_KEY: z.string().optional(),

    /** Start the job publisher (pg-boss) inside the API, so an email goes out at once. The worker process always runs its own. */
    JOBS_ENABLED: bool(true),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production") {
      if (!v.TURNSTILE_SECRET_KEY) ctx.addIssue({ code: "custom", path: ["TURNSTILE_SECRET_KEY"], message: "TURNSTILE_SECRET_KEY is required in production" });
      if (!v.REQUIRE_EMAIL_VERIFICATION) ctx.addIssue({ code: "custom", path: ["REQUIRE_EMAIL_VERIFICATION"], message: "REQUIRE_EMAIL_VERIFICATION must be true in production" });
      if (v.APP_SECRET === DEV_APP_SECRET) ctx.addIssue({ code: "custom", path: ["APP_SECRET"], message: "APP_SECRET must be set in production" });
      if (!v.APP_URL.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must be https in production" });
    }
    if (v.EMAIL_PROVIDER === "resend" && !v.RESEND_API_KEY) ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required for the resend provider" });
  });

export type Env = z.infer<typeof schema>;

/** Loads apps/api/.env into process.env when it exists (Node's own loader; values already in the environment win). */
export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

/** Parses the environment. Throws one error that names the wrong settings (never their values). */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  return parsed.data;
}
