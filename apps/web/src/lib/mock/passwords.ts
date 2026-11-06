// SERVER-ONLY: the password helpers of the mock backend, until apps/api exists. Passwords are only ever stored as a salted scrypt hash; the secrets of a
// password reset (the link token, the temporary password) are random and only their hash is kept. TODO(api): the real identity provider replaces all of this.
import { randomBytes, randomInt, scryptSync, createHash, timingSafeEqual } from "node:crypto";

/** `s1$<salt>$<hash>`, both in base64url. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `s1$${salt.toString("base64url")}$${scryptSync(password, salt, 32).toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [version, salt, hash] = stored.split("$");
  if (version !== "s1" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// No 0/O, 1/l/I: the password is read from an email.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";

/** A random temporary password of 14 characters with at least a letter and a digit. */
export function generateTempPassword(): string {
  const pick = (set: string) => set[randomInt(set.length)]!;
  const chars = [pick(LETTERS), pick(DIGITS), ...Array.from({ length: 12 }, () => pick(LETTERS + DIGITS))];
  for (let i = chars.length - 1; i > 0; i--) { // Fisher-Yates, so the letter and the digit are not always first
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** The secret of a link: 256 random bits. */
export const newToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
