import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/** The value used when no secret is set. Development and tests only: the production start is refused with it (see config/env.ts). It protects nothing. */
export const DEV_APP_SECRET = "development-only-secret-not-for-production-use";

const PREFIX = "enc:v1:";

/**
 * The application secret (`APP_SECRET`) and the keys made from it, one for each purpose, so a key that leaks for one use tells nothing about another:
 * - `hmac(purpose, value)`: a keyed hash (the pepper of an OTP: a stolen database alone is not enough to try the 1,000,000 codes offline).
 * - `encrypt` / `decrypt`: AES-256-GCM for a personal value stored in a column (the bank account number). The stored text is `enc:v1:<iv>:<tag>:<ciphertext>` (base64url); a text
 *   without that prefix is read as it is (a row written before the encryption existed), so the move can be done without a stop.
 * Losing the secret loses the encrypted values: keep it in the secret store of the environment and in the backup procedure, never in the repository.
 */
export class Secrets {
  private readonly root: Buffer;
  constructor(secret: string) {
    this.root = Buffer.from(secret, "utf8");
  }

  private key(purpose: string): Buffer {
    return Buffer.from(hkdfSync("sha256", this.root, Buffer.alloc(0), `workshop:${purpose}`, 32));
  }

  hmac(purpose: string, value: string): string {
    return createHmac("sha256", this.key(`hmac:${purpose}`)).update(value).digest("hex");
  }

  encrypt(purpose: string, plain: string): string {
    if (plain === "") return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(`enc:${purpose}`), iv);
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${body.toString("base64url")}`;
  }

  /** Reads a stored value. Throws when the text was changed or the secret is not the one it was written with (GCM checks both). */
  decrypt(purpose: string, stored: string): string {
    if (!stored.startsWith(PREFIX)) return stored; // written before the encryption
    const [iv, tag, body] = stored.slice(PREFIX.length).split(":");
    if (!iv || !tag || !body) throw new Error("Malformed encrypted value");
    const decipher = createDecipheriv("aes-256-gcm", this.key(`enc:${purpose}`), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  }

  isEncrypted(stored: string): boolean {
    return stored.startsWith(PREFIX);
  }
}
