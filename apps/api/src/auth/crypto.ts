import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

// Passwords are hashed with argon2id (OWASP minimum: 19 MiB, 2 passes, 1 lane). The hash carries its own salt and parameters, so the cost can be raised later without a migration.
const ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => argon2.hash(password, ARGON2);

/** True when the password matches the hash. A malformed hash is "no", never an exception. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let decoy: Promise<string> | undefined;
/** Spends the time of one verification when there is no account, so an unknown email and a wrong password take the same time (no way to tell which emails exist). */
export async function spendVerifyTime(password: string): Promise<void> {
  decoy ??= hashPassword("not-an-account-decoy");
  await verifyPassword(await decoy, password);
}

/** A secret for a cookie or an email link: 256 random bits, URL safe. Only its hash is stored. */
export const newToken = (): string => randomBytes(32).toString("base64url");

/** What is stored for a token: a random 256-bit token needs no salt, a plain SHA-256 is enough and lets the database find it by value. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Constant-time comparison of two strings (an origin, a token). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
