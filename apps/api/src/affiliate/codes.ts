import { randomInt } from "node:crypto";

// The codes of the links. 31 characters without the ones people mix up (0 O 1 I L): 8 of them make about 8.5 x 10^11 codes, and the database refuses a duplicate anyway.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const AFFILIATE_CODE_RE = /^A[A-Z0-9]{8}$/;
export const INVITE_CODE_RE = /^I[A-Z0-9]{8}$/;

export const newCode = (prefix: "A" | "I"): string => prefix + Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** An email shown to somebody else's eyes: the first character of the name and the domain ("j***@example.com"). */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}
