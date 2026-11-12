import { existsSync } from "node:fs";
import { z } from "zod";

// The settings of the API, read once from the environment (and from apps/api/.env in development). A missing or wrong value stops the start with a clear message, and the
// values are never printed: a DATABASE_URL carries the password of the database.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must start with postgres://"),
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
